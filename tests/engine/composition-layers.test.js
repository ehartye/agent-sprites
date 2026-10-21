import { describe, it, expect } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { applyComposition, compileComposition } from '../../server/engine/composition.js';
import { buildLayerTree } from '../../server/web/public/js/shared/shape-layers.js';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';

const layer = { id: 'retained', x: 1, y: 2, w: 3, h: 4, z: 7, background: { mode: 'transparent' } };
const project = () => Project.create({ name: 'layers', cellSize: 16, rows: 1, cols: 2 });
const shape = { name: 'pixel', type: 'point', params: { x: 2, y: 3, layers: [layer] }, color: '#ff0000' };
const spec = part => ({ cell: '0,0', prefix: 'scene', parts: { child: part }, placements: [
  { kind: 'stamp', part: 'child', name: 'a', x: 2, y: 3 },
  { kind: 'stamp', part: 'child', name: 'b', x: 5, y: 6 },
] });

describe('composition retained layer metadata', () => {
  it.each(['literal', 'source'])('copies %s layers with translated origins and independent deterministic instance IDs', kind => {
    const p = project(); p.cells.getCell('0,1').draw(shape.type, shape.params, shape.color, shape.name);
    const input = spec(kind === 'literal' ? { shapes: [shape] } : { source: { cell: '0,1', shapes: ['pixel'] } });
    const before = structuredClone(input), result = compileComposition(p, input);
    expect(result).toEqual(compileComposition(p, input));
    const [a, b] = result.shapes;
    expect(a.params.layers[0]).toMatchObject({ x: 3, y: 5, w: 3, h: 4, z: a.zIndex });
    expect(b.params.layers[0]).toMatchObject({ x: 6, y: 8 });
    expect(a.params.layers[0].id).not.toBe(b.params.layers[0].id);
    expect(a.params.layers[0].id).not.toBe(layer.id);
    expect(result.operations[0].layers).toEqual(a.params.layers);
    applyComposition(p, input); expect(buildLayerTree(p.cells.getCell('0,0').shapes.listByZ(), 16, 16).layerCount).toBe(2);
    expect(input).toEqual(before); expect(p.cells.getCell('0,1').shapes.get('pixel').params.layers).toEqual([layer]);
  });
  it('rejects malformed and inconsistent source descriptors atomically', () => {
    const p = project(), input = spec({ shapes: [shape, { ...shape, name: 'bad', params: { x: 2, y: 3, layers: [{ ...layer, w: 4 }] } }] });
    const before = p.toJSON();
    expect(() => applyComposition(p, input)).toThrow(/inconsistent.*layer/i);
    expect(p.toJSON()).toEqual(before);
    input.parts.child.shapes[1].params.layers[0].w = 0;
    expect(() => compileComposition(p, input)).toThrow(/layer.*dimension/i);
  });
  it('copies complete root paint units above destination content while preserving source group/flat order', () => {
    const p = project(), source = p.cells.getCell('0,1'), target = p.cells.getCell('0,0');
    const red = source.draw('rect', { x: 2, y: 3, w: 2, h: 1, filled: true, layers: [layer] }, '#ff0000', 'layered');
    source.setZ(red.id, 100);
    source.draw('point', { x: 2, y: 3 }, '#0000ff', 'flat', { zIndex: 50 });
    // Layer z7 is below the source flat z50 despite its member z100.
    target.draw('rect', { x: 2, y: 3, w: 2, h: 1, filled: true }, '#00ff00', 'existing', { zIndex: 500 });
    applyComposition(p, { cell: '0,0', prefix: 'copied', parts: { child: { source: { cell: '0,1', shapes: ['layered', 'flat'] } } }, placements: [{ kind: 'stamp', part: 'child', name: 'one', x: 0, y: 0 }] });
    const data = new CanvasRenderer(p.palette).renderCellRaw(target), at = (3 * 16 + 2) * 4;
    expect([...data.slice(at, at + 4)]).toEqual([0, 0, 255, 255]);
    expect([...data.slice(at + 4, at + 8)]).toEqual([255, 0, 0, 255]);
    const layerZ = target.shapes.get('copied:one:layered').params.layers[0].z;
    expect(layerZ).toBeGreaterThan(500);
    expect(layerZ).toBeLessThan(target.shapes.get('copied:one:flat').zIndex);
  });
  it('keeps layer IDs independent from primitive names when ranking paint units', () => {
    const p = project();
    const input = { cell: '0,0', prefix: 'copied', parts: { child: { shapes: [
      { name: 'retained', type: 'point', params: { x: 2, y: 3 }, color: '#0000ff' },
      { ...shape, params: { ...shape.params, layers: [{ ...layer, z: -1 }] } },
    ] } }, placements: [{ kind: 'stamp', part: 'child', name: 'one', x: 0, y: 0 }] };
    applyComposition(p, input);
    const data = new CanvasRenderer(p.palette).renderCellRaw(p.cells.getCell('0,0')), at = (3 * 16 + 2) * 4;
    expect([...data.slice(at, at + 4)]).toEqual([0, 0, 255, 255]);
  });
  it('rejects repeated large child flood work during compilation without rendering or mutation', () => {
    const p = Project.create({ name: 'bounded', cellSize: 8, rows: 1, cols: 1 });
    const large = { ...layer, x: 0, y: 0, w: 2048, h: 2048 };
    const input = { cell: '0,0', prefix: 'fillwork', parts: { child: { shapes: Array.from({ length: 32 }, (_, i) => ({ name: `fill${i}`, type: 'fill', params: { x: 0, y: 0, layers: [large] }, color: i % 2 ? '#ff0000' : '#0000ff' })) } }, placements: [{ kind: 'stamp', part: 'child', name: 'one', x: 0, y: 0 }] };
    const before = p.toJSON();
    expect(() => compileComposition(p, input)).toThrow(/16777216.*raster work budget/);
    expect(p.toJSON()).toEqual(before); expect(p.cells.getCell('0,0')._undoStack).toHaveLength(0);
  });
  it('aggregates retained surface allocation work with primitive work inside the composition budget', () => {
    const p = Project.create({ name: 'bounded', cellSize: 8, rows: 1, cols: 1 });
    const input = { cell: '0,0', prefix: 'surfacework', parts: { child: { shapes: Array.from({ length: 4 }, (_, i) => ({ name: `pixel${i}`, type: 'point', params: { x: 0, y: 0, layers: [{ ...layer, id: `surface${i}`, x: 0, y: 0, w: 2048, h: 2048 }] }, color: '#ff0000' })) } }, placements: [{ kind: 'stamp', part: 'child', name: 'one', x: 0, y: 0 }] };
    expect(() => compileComposition(p, input)).toThrow(/16777216.*raster work budget/);
  });
  const crowded = count => {
    const p = Project.create({ name: 'crowded', cellSize: 8, rows: 1, cols: 1 }), cell = p.cells.getCell('0,0');
    for (let i = 0; i < count; i++) cell.draw('point', { x: 0, y: 0, layers: [{ ...layer, id: `existing${i}`, x: 0, y: 0, w: 2048, h: 2048, z: i }] }, '#ffffff', `existing${i}`, { zIndex: 0 });
    return { p, cell };
  };
  const largeComposition = () => ({ cell: '0,0', prefix: 'added', parts: { child: { shapes: [{ name: 'pixel', type: 'point', params: { x: 0, y: 0, layers: [{ ...layer, x: 0, y: 0, w: 2048, h: 2048 }] }, color: '#ff0000' }] } }, placements: [{ kind: 'stamp', part: 'child', name: 'one', x: 0, y: 0 }] });
  it('rejects an individually valid composition that would exceed final retained-cell allocation bounds before mutation', () => {
    const { p, cell } = crowded(15), input = largeComposition();
    expect(buildLayerTree(cell.shapes.listByZ(), 8, 8).rasterWork).toBe(62_914_624);
    expect(() => compileComposition(p, input)).not.toThrow();
    const before = cell.toJSON(), history = cell._undoStack.length, nextZ = cell._nextZ;
    expect(() => applyComposition(p, input)).toThrow(/64000000.*budget/);
    expect(cell.toJSON()).toEqual(before); expect(cell._undoStack).toHaveLength(history); expect(cell._nextZ).toBe(nextZ);
  });
  it.each(['replacement', 'obsolete removal'])('validates reconciled retained-cell allocation after %s without double-counting prior owned output', mode => {
    const { p, cell } = crowded(14), input = largeComposition();
    applyComposition(p, input);
    const original = cell.shapes.get('added:one:pixel'), before = cell.toJSON(), history = cell._undoStack.length;
    if (mode === 'obsolete removal') input.parts.child.shapes[0].name = 'revised';
    const result = applyComposition(p, input);
    expect(result.changed).toBe(1); expect(result.removed).toBe(mode === 'obsolete removal' ? 1 : 0);
    expect(buildLayerTree(cell.shapes.listByZ(), 8, 8)).toMatchObject({ rasterWork: 62_914_624, layerCount: 15 });
    if (mode === 'replacement') expect(result.shapes[0].id).toBe(original.id);
    expect(cell._undoStack).toHaveLength(history + 1); cell.undo(); expect(cell.toJSON()).toEqual(before);
  });
});
