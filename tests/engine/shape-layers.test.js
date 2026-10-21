import { describe, it, expect } from 'vitest';
import { Cell } from '../../server/engine/cell.js';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';
import { CellManager } from '../../server/engine/cell-manager.js';
import { editLayer } from '../../server/engine/shape-layers.js';
import { buildLayerTree, paintLayerTree, translateParams, validateLayers } from '../../server/web/public/js/shared/shape-layers.js';

const transparent = { mode: 'transparent' };
const layer = (id = 'child', extra = {}) => ({ id, x: 2, y: 1, w: 3, h: 3, z: 1, background: transparent, ...extra });
const renderer = (background = transparent) => new CanvasRenderer({ resolve: c => ({ red: '#ff0000', green: '#00ff00' })[c] ?? c }, { background });
const pixel = (data, x, y, w = 8) => [...data.slice((y * w + x) * 4, (y * w + x) * 4 + 4)];

describe('isolated editable child surfaces', () => {
  it('fills a translated source-sized child independently of the underlay', () => {
    const cell = new Cell(8);
    cell.draw('rect', { x: 0, y: 0, w: 8, h: 8, filled: true }, '#0000ff');
    cell.draw('fill', { x: 2, y: 1, layers: [layer()] }, 'red');
    const data = renderer().renderCellRaw(cell);
    expect(pixel(data, 0, 0)).toEqual([0, 0, 255, 255]);
    expect(pixel(data, 4, 3)).toEqual([255, 0, 0, 255]);
    expect(pixel(data, 5, 3)).toEqual([0, 0, 255, 255]);
  });

  it('protects child and root backgrounds and neighboring parts from child erasers', () => {
    const cell = new Cell(8), layers = [layer('child', { background: { mode: 'chroma', color: '#00ff00' } })];
    cell.draw('rect', { x: 0, y: 0, w: 8, h: 8, filled: true }, '#0000ff');
    cell.draw('rect', { x: 0, y: 0, w: 8, h: 8, filled: true, layers }, 'red');
    cell.draw('rect', { x: 3, y: 2, w: 4, h: 4, filled: true, erase: true, layers }, '#ffffff');
    const data = renderer({ mode: 'chroma', color: '#ff00ff' }).renderCellRaw(cell);
    expect(pixel(data, 3, 2)).toEqual([0, 255, 0, 255]);
    expect(pixel(data, 5, 2)).toEqual([0, 0, 255, 255]);
    expect(pixel(data, 2, 1)).toEqual([255, 0, 0, 255]);
  });

  it('orders complete groups explicitly even when member z values interleave', () => {
    const cell = new Cell(8);
    cell.draw('point', { x: 2, y: 1, layers: [layer('a', { z: 10 })] }, 'red', 'a0', { zIndex: 0 });
    cell.draw('point', { x: 2, y: 1, layers: [layer('b', { z: 20 })] }, '#0000ff', 'b', { zIndex: 1 });
    cell.draw('point', { x: 2, y: 1, layers: [layer('a', { z: 10 })] }, 'green', 'a1', { zIndex: 2 });
    expect(pixel(renderer().renderCellRaw(cell), 2, 1)).toEqual([0, 0, 255, 255]);
  });

  it('clips nested children to both original surfaces and composites source-over alpha', () => {
    const cell = new Cell(8), layers = [layer('outer'), layer('inner', { x: 4, y: 2, w: 3, h: 3 })];
    cell.draw('rect', { x: 0, y: 0, w: 8, h: 8, filled: true }, '#0000ff');
    cell.draw('rect', { x: 0, y: 0, w: 8, h: 8, filled: true, layers }, '#ff000080');
    const data = renderer().renderCellRaw(cell);
    expect(pixel(data, 4, 2)).toEqual([128, 0, 127, 255]);
    expect(pixel(data, 5, 2)).toEqual([0, 0, 255, 255]);
    expect(pixel(data, 4, 4)).toEqual([0, 0, 255, 255]);
  });

  it('rejects unknown, inconsistent, excessive and malformed metadata before drawing', () => {
    for (const layers of [null, {}, [layer('x', { w: 0 })], [layer('x', { extra: 1 })], [layer('x', { background: null })], Array.from({ length: 9 }, (_, i) => layer(String(i)))]) {
      const cell = new Cell(8);
      cell.draw('point', { x: 2, y: 1, layers }, 'red');
      expect(() => renderer().renderCellRaw(cell)).toThrow(/layer/i);
    }
    const cell = new Cell(8);
    cell.draw('point', { x: 2, y: 1, layers: [layer()] }, 'red');
    cell.draw('point', { x: 2, y: 1, layers: [layer('child', { x: 3 })] }, 'red');
    expect(() => renderer().renderCellRaw(cell)).toThrow(/inconsistent/i);
    const big = new Cell(8);
    for (let i = 0; i < 16; i++) big.draw('point', { x: 0, y: 0, layers: [layer(String(i), { w: 2048, h: 2048 })] }, 'red');
    expect(() => renderer().renderCellRaw(big)).toThrow(/budget/i);
  });
});

describe('retained layer edits and transforms', () => {
  const generatedCell = () => {
    const cell = new Cell(8);
    cell.draw('point', { x: 2, y: 1, layers: [layer('base', { z: 0 })] }, 'red', 'base', { zIndex: 0 });
    cell.draw('point', { x: 2, y: 1, layers: [layer('top', { z: 200001 })] }, '#0000ff', 'top', { zIndex: 0 });
    return cell;
  };
  it.each(['generated', 'imported', 'copied'])('appends manual root primitives above %s child paint units without rescanning shapes', kind => {
    let cell = generatedCell();
    if (kind === 'imported') cell = Cell.fromJSON(cell.toJSON(), 8);
    if (kind === 'copied') {
      const manager = new CellManager(8, 1, 2); manager._grid[0][0] = cell;
      manager.copyCell('0,0', '0,1'); cell = manager.getCell('0,1');
    }
    const list = cell.shapes.listByZ;
    cell.shapes.listByZ = () => { throw new Error('draw must not scan retained shapes'); };
    const manual = cell.draw('point', { x: 2, y: 1 }, 'green', 'manual');
    cell.shapes.listByZ = list;
    expect(pixel(renderer().renderCellRaw(cell), 2, 1)).toEqual([0, 255, 0, 255]);
    expect(manual.zIndex).toBeGreaterThan(200001);
    cell.undo(); expect(pixel(renderer().renderCellRaw(cell), 2, 1)).toEqual([0, 0, 255, 255]);
    cell.redo(); expect(pixel(renderer().renderCellRaw(cell), 2, 1)).toEqual([0, 255, 0, 255]);
  });
  it('reserves paint order across layer reorder, undo and redo while keeping member z unchanged', () => {
    const cell = generatedCell();
    editLayer(cell, { id: 'base', z: 400001 });
    expect(cell.shapes.get('base').zIndex).toBe(0);
    const first = cell.draw('point', { x: 2, y: 1 }, 'green', 'first');
    expect(pixel(renderer().renderCellRaw(cell), 2, 1)).toEqual([0, 255, 0, 255]);
    expect(first.zIndex).toBeGreaterThan(400001);
    cell.undo(); cell.undo(); expect(pixel(renderer().renderCellRaw(cell), 2, 1)).toEqual([0, 0, 255, 255]);
    cell.redo(); expect(pixel(renderer().renderCellRaw(cell), 2, 1)).toEqual([255, 0, 0, 255]);
    cell.draw('point', { x: 2, y: 1 }, 'green', 'second');
    expect(pixel(renderer().renderCellRaw(cell), 2, 1)).toEqual([0, 255, 0, 255]);
  });
  it('appends above an explicitly raised root primitive and keeps its paint reservation through undo', () => {
    const cell = generatedCell();
    cell.draw('point', { x: 2, y: 1 }, 'green', 'raised');
    cell.setZ('raised', 600001);
    cell.draw('point', { x: 2, y: 1 }, 'red', 'appended');
    expect(pixel(renderer().renderCellRaw(cell), 2, 1)).toEqual([255, 0, 0, 255]);
    cell.undo(); cell.undo();
    const afterUndo = cell.draw('point', { x: 2, y: 1 }, 'red', 'after-undo');
    expect(afterUndo.zIndex).toBeGreaterThan(600001);
    expect(pixel(renderer().renderCellRaw(cell), 2, 1)).toEqual([255, 0, 0, 255]);
  });
  it('rejects a manual append when an imported root paint unit exhausts the safe integer range', () => {
    const cell = generatedCell(), json = cell.toJSON(); json.shapes[1].params.layers[0].z = Number.MAX_SAFE_INTEGER;
    const imported = Cell.fromJSON(json, 8), before = imported.toJSON();
    expect(() => imported.draw('point', { x: 2, y: 1 }, 'green')).toThrow(/safe integer|z-order/i);
    expect(imported.toJSON()).toEqual(before); expect(imported._undoStack).toHaveLength(0);
  });
  it('moves and orders all nested members in one deep reversible edit with stable identities', () => {
    const cell = new Cell(8), outer = layer('outer'), inner = layer('inner', { x: 3, y: 2 });
    const a = cell.draw('point', { x: 3, y: 2, layers: [outer, inner] }, 'red', 'a');
    const b = cell.draw('line', { x1: 2, y1: 1, x2: 4, y2: 3, layers: [outer] }, 'green', 'b');
    const before = cell.toJSON(), history = cell._undoStack.length;
    const result = editLayer(cell, { id: 'outer', dx: 2, dy: -1, z: 12 });
    expect(result.changed).toBe(2); expect(result.shapes.map(s => s.id)).toEqual([a.id, b.id]);
    expect(cell._undoStack.length).toBe(history + 1);
    expect(a.params).toMatchObject({ x: 5, y: 1, layers: [{ x: 4, y: 0, z: 12 }, { x: 5, y: 1 }] });
    const after = cell.toJSON(); cell.undo(); expect(cell.toJSON()).toEqual(before); cell.redo(); expect(cell.toJSON()).toEqual(after);
    cell.undo(); a.params.layers[1].background.mode = 'chroma'; cell.redo(); expect(cell.toJSON()).toEqual(after);
    expect(() => editLayer(cell, { id: 'missing', dx: 1 })).toThrow(/not found/i);
    expect(() => editLayer(cell, { id: 'outer', dx: 0.5 })).toThrow(/integer/i);
  });
  it('keeps single-shape movement within its existing clip', () => {
    const cell = new Cell(8), shape = cell.draw('point', { x: 2, y: 1, layers: [layer()] }, 'red', 'p');
    cell.moveShape('p', 4, 0); expect(shape.params.layers).toEqual([layer()]);
    expect([...renderer().renderCellRaw(cell)].every(n => n === 0)).toBe(true);
  });
  it('moves bounds with whole-cell shift, mirror and rotation while preserving primitive geometry', () => {
    const cm = new CellManager(8, 1, 1), cell = cm.getCell('0,0');
    const shape = cell.draw('point', { x: 2, y: 1, layers: [layer()] }, 'red');
    cm.shiftCell('0,0', 1, 2); expect(shape.params.layers[0]).toMatchObject({ x: 3, y: 3 });
    cm.mirrorCell('0,0', 'horizontal'); expect(shape.params.layers[0]).toMatchObject({ x: 2, y: 3, w: 3, h: 3 });
    cm.rotateCell('0,0', 90); expect(shape.params.layers[0]).toMatchObject({ x: 2, y: 2, w: 3, h: 3 });
    expect(() => buildLayerTree(cell.shapes.listByZ(), 8, 8)).not.toThrow();
  });
  it('translates primitive copies without mutating canonical geometry or metadata', () => {
    const original = { points: [{ x: 2, y: 3 }], layers: [layer()] };
    expect(translateParams(original, 4, -2)).toEqual({ points: [{ x: 6, y: 1 }], layers: [layer()] });
    expect(translateParams(original, 4, -2, { layers: true }).layers[0]).toMatchObject({ x: 6, y: -1 });
    expect(original.points).toEqual([{ x: 2, y: 3 }]); expect(validateLayers(original.layers)).toEqual([layer()]);
  });
  it('rejects an over-budget plan without calling its surface factory', () => {
    let allocations = 0;
    const shapes = Array.from({ length: 16 }, (_, i) => ({ type: 'point', params: { x: 0, y: 0, layers: [layer(String(i), { w: 2048, h: 2048 })] } }));
    expect(() => paintLayerTree(null, buildLayerTree(shapes, 8, 8), { createCanvas() { allocations++; } })).toThrow(/budget/);
    expect(allocations).toBe(0);
  });
});
