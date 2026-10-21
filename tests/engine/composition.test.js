import { describe, expect, it } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';
import { handleDraw } from '../../server/handlers/draw.js';
import { applyComposition, compileComposition } from '../../server/engine/composition.js';

const project = () => Project.create({ name: 'composition', cellSize: 32, rows: 1, cols: 2, palette: 'pico8' });
const leaf = { shapes: [{ name: 'stem', type: 'line', params: { x1: 0, y1: 0, x2: 0, y2: 3 }, color: 'green' }] };
const spec = (placements = [{ kind: 'stamp', part: 'leaf', name: 'tuft', x: 3, y: 2 }]) => ({ cell: '0,0', prefix: 'garden', parts: { leaf: structuredClone(leaf) }, placements });
const cell = p => p.cells.getCell('0,0');

describe('compact composition', () => {
  it.each(['__proto__', 'constructor', 'toString', ['checker']].map(pattern => ({ pattern })))('rejects invalid pattern names without editing: %j', ({ pattern }) => {
    const p = project(), input = spec();
    input.parts.leaf.shapes = [{ name: 'body', type: 'rect', params: { x: 0, y: 0, w: 2, h: 2, filled: true, pattern, color2: '#ffffff' }, color: '#ff0000' }];
    const before = p.toJSON();
    expect(() => applyComposition(p, input)).toThrow(/pattern/);
    expect(p.toJSON()).toEqual(before);
    expect(cell(p).undo()).toBe(false);
  });

  it('compiles deterministic named stamps, tiles and seeded scatter without mutating the project or input', () => {
    const p = project(), input = spec([
      { kind: 'stamp', part: 'leaf', name: 'tuft', x: 3, y: 2 },
      { kind: 'tile', part: 'leaf', name: 'bed', x: 0, y: 0, cols: 2, rows: 2, stepX: 4, stepY: 5 },
      { kind: 'scatter', part: 'leaf', name: 'wild', x: 0, y: 0, w: 16, h: 16, count: 8, seed: 'meadow' },
    ]), before = p.toJSON(), saved = structuredClone(input);
    const result = compileComposition(p, input);
    expect(result).toEqual(compileComposition(p, input));
    expect(result.instances).toHaveLength(13);
    expect(result.instances[4]).toEqual({ name: 'bed/r1c1', part: 'leaf', x: 4, y: 5, shapes: ['garden:bed/r1c1:stem'] });
    expect(result.shapes[0]).toMatchObject({ name: 'garden:tuft:stem', type: 'line', params: { x1: 3, y1: 2, x2: 3, y2: 5, composition: { prefix: 'garden', part: 'leaf', instance: 'tuft', localName: 'stem' } }, color: 'green', visible: true });
    expect(result.operations[0]).toMatchObject({ command: 'draw', cell: '0,0', type: 'line', name: 'garden:tuft:stem', x1: 3, y1: 2, x2: 3, y2: 5, color: 'green' });
    const alternate = structuredClone(input); alternate.placements[2].seed = 'hill';
    expect(compileComposition(p, alternate).instances.slice(5)).not.toEqual(result.instances.slice(5));
    expect(p.toJSON()).toEqual(before); expect(input).toEqual(saved);
  });

  it('offsets every supported primitive and paints the same pixels as canonical direct shapes', () => {
    const p = project(), shapes = [
      ['point', { x: 1, y: 1 }], ['line', { x1: 1, y1: 1, x2: 3, y2: 3 }],
      ['rect', { x: 0, y: 0, w: 3, h: 2, filled: false }], ['circle', { cx: 3, cy: 3, r: 2 }],
      ['ellipse', { cx: 3, cy: 3, rx: 2, ry: 1 }], ['polygon', { points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 1, y: 3 }], filled: true }],
      ['polyline', { points: [{ x: 0, y: 0 }, { x: 3, y: 1 }] }], ['fill', { x: 20, y: 20 }],
    ].map(([type, params], i) => ({ type, params, color: '#008751', name: `s${i}` }));
    const input = { cell: '0,0', prefix: 'mixed', parts: { all: { shapes } }, placements: [{ kind: 'stamp', part: 'all', name: 'one', x: 2, y: 4 }] };
    const out = applyComposition(p, input);
    expect(out.shapes[0].params).toMatchObject({ x: 3, y: 5 });
    expect(out.shapes[2].params).toMatchObject({ x: 2, y: 4, w: 3, h: 2, filled: false });
    expect(out.shapes[3].params).toMatchObject({ cx: 5, cy: 7, r: 2 });
    expect(out.shapes[5].params.points).toEqual([{ x: 2, y: 4 }, { x: 5, y: 4 }, { x: 3, y: 7 }]);
    const direct = p.cells.getCell('0,1');
    for (const shape of out.shapes) direct.draw(shape.type, shape.params, shape.color);
    const renderer = new CanvasRenderer(p.palette);
    expect(renderer.renderCellRaw(cell(p))).toEqual(renderer.renderCellRaw(direct));
  });

  it('copies selected canonical source shapes by name with independent snapshot ownership', () => {
    const p = project(), source = p.cells.getCell('0,1');
    const original = source.draw('polygon', { points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 1, y: 2 }], filled: true }, 'green', 'crown');
    source.draw('point', { x: 5, y: 5 }, '#ffffff', 'ignored');
    const input = { cell: '0,0', prefix: 'copy', parts: { tree: { source: { cell: '0,1', shapes: ['crown'] } } }, placements: [{ kind: 'stamp', part: 'tree', name: 'oak', x: 4, y: 6 }] };
    const compiled = compileComposition(p, input);
    const out = applyComposition(p, input), copied = cell(p).shapes.getByName('copy:oak:crown');
    expect(out.shapes).toHaveLength(1);
    expect(copied.params.composition.source).toEqual({ cell: '0,1', shape: 'crown' });
    source.moveShape('crown', 2, 0);
    expect(compiled.shapes[0].params.points[0]).toEqual({ x: 4, y: 6 });
    expect(copied.params.points[0]).toEqual({ x: 4, y: 6 });
    applyComposition(p, input);
    expect(copied.params.points[0]).toEqual({ x: 6, y: 6 });
    copied.params.points[0].x = 99;
    expect(original.params.points[0]).toEqual({ x: 2, y: 0 });
  });

  it('preserves original source paint order even when names are selected in reverse order', () => {
    const p = project(), source = p.cells.getCell('0,1');
    source.draw('rect', { x: 0, y: 0, w: 4, h: 4, filled: true }, 'green', 'body');
    source.draw('point', { x: 1, y: 1 }, 'red', 'highlight');
    const input = { cell: '0,0', prefix: 'copy', parts: { leaf: { source: { cell: '0,1', shapes: ['highlight', 'body'] } } }, placements: [{ kind: 'stamp', part: 'leaf', name: 'one', x: 0, y: 0 }] };
    const result = applyComposition(p, input);
    expect(result.shapes.map(s => s.params.composition.localName)).toEqual(['body', 'highlight']);
    const renderer = new CanvasRenderer(p.palette);
    expect(renderer.renderCellRaw(cell(p))).toEqual(renderer.renderCellRaw(source));
  });

  it('reconciles a whole prefix, revises selected parts with stable IDs and removes obsolete output only', () => {
    const p = project(), target = cell(p);
    const unrelated = target.draw('point', { x: 31, y: 31 }, 'red', 'unrelated'); target.setZ('unrelated', 500);
    const input = spec([{ kind: 'tile', part: 'leaf', name: 'bed', x: 0, y: 0, cols: 2, rows: 1, stepX: 4, stepY: 4 }]);
    applyComposition(p, input);
    const first = target.shapes.getByName('garden:bed/r0c0:stem'), removed = target.shapes.getByName('garden:bed/r0c1:stem');
    const before = target.toJSON(), unrelatedBefore = unrelated.toJSON();
    const revised = structuredClone(input); revised.parts.leaf.shapes[0] = { name: 'stem', type: 'rect', params: { x: 1, y: 1, w: 2, h: 3, filled: true }, color: '#ffffff', visible: false }; revised.placements[0].cols = 1;
    const result = applyComposition(p, revised), after = target.toJSON();
    expect(result).toMatchObject({ changed: 1, removed: 1 });
    expect(target.shapes.getByName(first.name)).toBe(first); expect(first.id).toBe(before.shapes[1].id);
    expect(first).toMatchObject({ type: 'rect', color: '#ffffff', visible: false });
    expect(first.params).not.toHaveProperty('x1');
    expect(first.zIndex).toBeGreaterThan(500);
    expect(target.shapes.getByName(removed.name)).toBeNull(); expect(unrelated.toJSON()).toEqual(unrelatedBefore);
    target.undo(); expect(target.toJSON()).toEqual(before);
    target.redo(); expect(target.toJSON()).toEqual(after);
    target.deleteShape(first.name); target.undo(); target.undo(); expect(target.toJSON()).toEqual(before);
    target.redo(); expect(target.toJSON()).toEqual(after);
    target.clear(); target.undo(); target.undo(); expect(target.toJSON()).toEqual(before);
  });

  it('applies more than 50 expanded shapes as exactly one logical undo and redo', () => {
    const p = project(), target = cell(p), before = target.toJSON();
    const input = spec([{ kind: 'tile', part: 'leaf', name: 'field', x: 0, y: 0, cols: 8, rows: 8, stepX: 3, stepY: 3 }]);
    const result = applyComposition(p, input), after = target.toJSON();
    expect(result.changed).toBe(64); expect(target._undoStack).toHaveLength(1);
    target.undo(); expect(target.toJSON()).toEqual(before);
    target.redo(); expect(target.toJSON()).toEqual(after);
    const restored = Project.fromJSON(p.toJSON()), ids = cell(restored).shapes.listByZ().map(s => s.id);
    applyComposition(restored, input);
    expect(cell(restored).shapes.listByZ().map(s => s.id)).toEqual(ids);
    applyComposition(restored, { ...input, placements: [] });
    expect(cell(restored).shapes.listByZ()).toEqual([]);
  });

  it('uses owned names when another shape is named after an owned ID', () => {
    const p = project(), target = cell(p); applyComposition(p, spec());
    const owned = target.shapes.getByName('garden:tuft:stem');
    const unrelated = target.draw('point', { x: 20, y: 20 }, 'red', owned.id), before = unrelated.toJSON();
    const revised = spec(); revised.placements[0].x = 9;
    applyComposition(p, revised);
    expect(owned.params.x1).toBe(9); expect(unrelated.toJSON()).toEqual(before);
  });

  it('normalizes primitive defaults and fractional geometry to exact ordinary draw semantics', () => {
    const p = project(), input = spec();
    input.parts.leaf.shapes = [{ name: 'body', type: 'rect', params: { x: 0.5, y: 0.1, w: 3.2, h: 2.4 }, color: 'green' }];
    const result = applyComposition(p, input), actual = result.shapes[0];
    expect(actual.params).toMatchObject({ x: 4, y: 2, w: 3, h: 2, filled: true });
    expect(result.operations[0]).toMatchObject({ filled: true, x: 4, y: 2 });
    const operation = result.operations[0];
    handleDraw({ project: p }, operation.type, { ...operation, cell: '0,1', shape_name: operation.name });
    const renderer = new CanvasRenderer(p.palette);
    expect(renderer.renderCellRaw(cell(p))).toEqual(renderer.renderCellRaw(p.cells.getCell('0,1')));
  });

  it('copies omitted source fill flags as outlines and strips prior composition ownership', () => {
    const p = project(), source = p.cells.getCell('0,1');
    source.draw('rect', { x: 0, y: 0, w: 4, h: 4, composition: { prefix: 'old' }, asciiPatch: 'old' }, 'green', 'outline');
    const input = { cell: '0,0', prefix: 'copy', parts: { leaf: { source: { cell: '0,1', shapes: ['outline'] } } }, placements: [{ kind: 'stamp', part: 'leaf', name: 'one', x: 0, y: 0 }] };
    const result = applyComposition(p, input);
    expect(result.shapes[0].params.filled).toBe(false);
    expect(result.operations[0].filled).toBe(false);
    expect(result.shapes[0].params).not.toHaveProperty('asciiPatch');
    const renderer = new CanvasRenderer(p.palette);
    expect(renderer.renderCellRaw(cell(p))).toEqual(renderer.renderCellRaw(source));
  });

  it.each([undefined, false])('captures source outline pixels with filled=%s and discards irrelevant pattern fields for ordinary replay', filled => {
    const p = project(), source = p.cells.getCell('0,1');
    source.draw('rect', { x: 0, y: 0, w: 4, h: 4, pattern: 'checker', color2: '#ffffff', ...(filled === undefined ? {} : { filled }) }, 'green', 'outline');
    const input = { cell: '0,0', prefix: 'copy', parts: { leaf: { source: { cell: '0,1', shapes: ['outline'] } } }, placements: [{ kind: 'stamp', part: 'leaf', name: 'one', x: 0, y: 0 }] };
    const compiled = compileComposition(p, input), result = applyComposition(p, input);
    expect(compiled.shapes[0].params.filled).toBe(false);
    expect(compiled.shapes[0].params).not.toHaveProperty('pattern');
    expect(compiled.operations[0]).not.toHaveProperty('color2');
    const replay = project(), operation = result.operations[0];
    handleDraw({ project: replay }, operation.type, { ...operation, shape_name: operation.name });
    const renderer = new CanvasRenderer(p.palette);
    expect(renderer.renderCellRaw(cell(p))).toEqual(renderer.renderCellRaw(source));
    expect(renderer.renderCellRaw(cell(replay))).toEqual(renderer.renderCellRaw(source));
  });

  it.each([500, 500.25])('compiles explicit replay z-order above an existing z=%s and matches applied pixels', previousZ => {
    const prior = () => {
      const p = project(), target = cell(p);
      target.draw('point', { x: 0, y: 0 }, 'red', 'top'); target.setZ('top', previousZ);
      return p;
    };
    const p = prior(), replay = prior();
    const input = { cell: '0,0', prefix: 'proof', parts: { dot: { shapes: [{ name: 'dot', type: 'point', params: { x: 0, y: 0 }, color: 'green' }] } }, placements: [{ kind: 'stamp', part: 'dot', name: 'one', x: 0, y: 0 }] };
    const compiled = compileComposition(p, input), result = applyComposition(p, input);
    expect(compiled.operations[0].z).toBe(501);
    expect(result.shapes[0].zIndex).toBe(compiled.operations[0].z);
    for (const { command, cell: ref, name, type, color, visible, z, ...params } of compiled.operations) {
      replay.cells.getCell(ref).draw(type, params, color, name, { visible, zIndex: z });
    }
    const renderer = new CanvasRenderer(p.palette);
    expect(renderer.renderCellRaw(cell(replay))).toEqual(renderer.renderCellRaw(cell(p)));
    expect(cell(replay).draw('point', { x: 1, y: 0 }, 'green', 'next').zIndex).toBe(502);
  });

  it('creates hidden shapes through the normal draw visibility option and retains visibility across history', () => {
    const p = project(), target = cell(p);
    const shape = target.draw('point', { x: 0, y: 0 }, 'green', 'hidden', { visible: false });
    expect(shape.visible).toBe(false);
    target.undo(); target.redo(); expect(shape.visible).toBe(false);
  });

  it.each([1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER])('rejects unsafe explicit draw z-order %s before changing state or history', zIndex => {
    const p = project(), target = cell(p), before = target.toJSON(), nextZ = target._nextZ;
    expect(() => target.draw('point', { x: 0, y: 0 }, 'green', 'bad-z', { zIndex })).toThrow(/z|order|integer/i);
    expect(target.toJSON()).toEqual(before); expect(target._undoStack).toHaveLength(0); expect(target._nextZ).toBe(nextZ);
  });

  it('does not lower the next draw order after an explicitly lower draw z-order', () => {
    const p = project(), target = cell(p);
    target.draw('point', { x: 0, y: 0 }, 'red', 'high', { zIndex: 100 });
    target.draw('point', { x: 1, y: 0 }, 'green', 'low', { zIndex: -10 });
    expect(target.draw('point', { x: 2, y: 0 }, 'blue', 'next').zIndex).toBe(101);
  });

  it('copies existing names with spaces, Unicode and namespace punctuation without hierarchy collisions', () => {
    const p = project(), source = p.cells.getCell('0,1');
    const names = ['left eye', '花瓣', 'head:part/eye', 'head%3Apart%2Feye'];
    for (const name of names) source.draw('point', { x: 1, y: 1 }, 'green', name);
    const input = { cell: '0,0', prefix: 'copy', parts: { face: { source: { cell: '0,1', shapes: names } } }, placements: [{ kind: 'stamp', part: 'face', name: 'one', x: 0, y: 0 }] };
    const result = applyComposition(p, input);
    expect(result.shapes.map(s => s.name)).toEqual(names.map(name => `copy:one:${encodeURIComponent(name)}`));
    expect(result.shapes.map(s => s.params.composition.localName)).toEqual(names);
    const ids = result.shapes.map(s => s.id);
    applyComposition(p, input); expect(cell(p).shapes.listByZ().map(s => s.id)).toEqual(ids);
    applyComposition(p, { ...input, placements: [] }); expect(cell(p).shapes.listByZ()).toEqual([]);
  });

  it('rejects an exhausted z-order before replacing or deleting any shape', () => {
    const p = project(), target = cell(p); target.draw('point', { x: 0, y: 0 }, 'red', 'top'); target.setZ('top', Number.MAX_SAFE_INTEGER);
    const before = target.toJSON();
    expect(() => applyComposition(p, spec())).toThrow(/z|order|range/i);
    expect(target.toJSON()).toEqual(before);
  });

  it('paints above existing finite fractional z-order without changing unrelated state', () => {
    const p = project(), target = cell(p);
    const original = target.draw('point', { x: 0, y: 0 }, 'red', 'top'); target.setZ('top', 500.25);
    const before = original.toJSON();
    const result = applyComposition(p, spec());
    expect(result.shapes[0].zIndex).toBeGreaterThan(500.25);
    expect(original.toJSON()).toEqual(before);
  });

  it('rejects unrelated name collisions before changing any state or history', () => {
    const p = project(), target = cell(p);
    target.draw('point', { x: 0, y: 0 }, 'red', 'garden:tuft:stem');
    const before = target.toJSON(), undo = target._undoStack.length;
    expect(() => applyComposition(p, spec())).toThrow(/owned|collision/i);
    expect(target.toJSON()).toEqual(before); expect(target._undoStack).toHaveLength(undo);
  });

  it.each([
    ['unknown root field', x => { x.typo = true; }],
    ['unknown part field', x => { x.parts.leaf.typo = true; }],
    ['invalid primitive', x => { x.parts.leaf.shapes[0].type = 'unknown'; }],
    ['nonfinite geometry', x => { x.parts.leaf.shapes[0].params.x1 = Infinity; }],
    ['unknown shape parameter', x => { x.parts.leaf.shapes[0].params.typo = true; }],
    ['pattern without color2', x => { x.parts.leaf.shapes[0] = { name: 'body', type: 'rect', params: { x: 0, y: 0, w: 4, h: 4, pattern: 'checker' }, color: 'green' }; }],
    ['color2 without pattern', x => { x.parts.leaf.shapes[0].params.color2 = 'red'; }],
    ['pattern on a line', x => { Object.assign(x.parts.leaf.shapes[0].params, { pattern: 'checker', color2: 'red' }); }],
    ['pattern on an outline', x => { x.parts.leaf.shapes[0] = { name: 'body', type: 'rect', params: { x: 0, y: 0, w: 4, h: 4, filled: false, pattern: 'checker', color2: 'red' }, color: 'green' }; }],
    ['erase flood fill', x => { x.parts.leaf.shapes[0] = { name: 'body', type: 'fill', params: { x: 0, y: 0, erase: true }, color: 'green' }; }],
    ['fill flag on a line', x => { x.parts.leaf.shapes[0].params.filled = true; }],
    ['unresolved color', x => { x.parts.leaf.shapes[0].color = 'not-a-color'; }],
    ['malformed hex', x => { x.parts.leaf.shapes[0].color = '#zz0000'; }],
    ['duplicate local names', x => { x.parts.leaf.shapes.push(structuredClone(x.parts.leaf.shapes[0])); }],
    ['invalid prefix', x => { x.prefix = 'bad:prefix'; }],
    ['unknown part', x => { x.placements[0].part = 'missing'; }],
    ['fractional placement', x => { x.placements[0].x = 0.5; }],
    ['missing seed', x => { x.placements = [{ kind: 'scatter', part: 'leaf', name: 'wild', x: 0, y: 0, w: 4, h: 4, count: 4 }]; }],
    ['invalid seed', x => { x.placements = [{ kind: 'scatter', part: 'leaf', name: 'wild', x: 0, y: 0, w: 4, h: 4, count: 4, seed: {} }]; }],
    ['too many expanded shapes', x => { x.placements = [{ kind: 'tile', part: 'leaf', name: 'field', x: 0, y: 0, cols: 4097, rows: 1, stepX: 1, stepY: 1 }]; }],
    ['excess raster work', x => { x.parts.leaf.shapes[0] = { name: 'large', type: 'rect', params: { x: 0, y: 0, w: 100000, h: 100000 }, color: 'green' }; }],
    ['integer overflow', x => { x.placements[0].x = Number.MAX_SAFE_INTEGER; }],
    ['malformed source', x => { x.parts.leaf = { source: { cell: '0,1', shapes: ['absent'] } }; }],
    ['conflicting source and shapes', x => { x.parts.leaf.source = { cell: '0,1', shapes: ['absent'] }; }],
    ['duplicate placement names', x => { x.placements.push(structuredClone(x.placements[0])); }],
  ])('rejects %s atomically', (_, mutate) => {
    const p = project(), target = cell(p); target.draw('point', { x: 31, y: 31 }, 'red', 'original');
    const input = structuredClone(spec()); mutate(input);
    const before = p.toJSON(), undo = target._undoStack.length, nextZ = target._nextZ;
    expect(() => applyComposition(p, input)).toThrow();
    expect(p.toJSON()).toEqual(before); expect(target._undoStack).toHaveLength(undo); expect(target._nextZ).toBe(nextZ);
  });
});
