import { afterEach, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Project } from '../../server/engine/project.js';
import { Shape } from '../../server/engine/shape.js';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';
import { editLayer } from '../../server/engine/shape-layers.js';
import { createConstructionRecorder } from '../../server/engine/construction-replay.js';
import { handleCloneShape, handleDuplicateShape, handleResizeShape, handleMoveShapeTo } from '../../server/handlers/shape.js';

afterEach(() => vi.restoreAllMocks());
const own = entries => Object.fromEntries(entries);
function fixture() {
  const project = Project.create({ name: 'Shared art', cellSize: 8, rows: 1, cols: 3, palette: 'pico8' });
  const a = project.cells.getCell('0,0');
  a.name = 'start'; a.reference = { path: 'underlay.png', opacity: 0.4 };
  a.draw('polygon', { points: [{ x: 1, y: 1 }, { x: 6, y: 1 }, { x: 1, y: 6 }], filled: true }, '#ff004d80', 'body');
  a.draw('point', { y: 2, x: 2 }, '#ffffff', 'eye');
  project.cells.copyCell('0,0', '0,1');
  return project;
}
function shared() { return Project.fromJSON(fixture().toJSON(), { sharedGeometry: true }); }
function v2() {
  const data = fixture().toJSON();
  data.version = 2;
  data.geometry = { g0: { type: 'polygon', params: data.cells['0,0'].shapes[0].params }, g1: { type: 'point', params: { x: 2, y: 2 } } };
  for (const cell of Object.values(data.cells)) cell.shapes = cell.shapes.map(({ type, params, ...instance }, i) => ({ ...instance, geometryRef: `g${i}` }));
  return data;
}
const first = project => project.cells.getCell('0,0').shapes.get('body');
const second = project => project.cells.getCell('0,1').shapes.get('body');

test('encodes row-major paint order, recursive object equality, array order and primitive type deterministically', () => {
  const project = fixture(), a = project.cells.getCell('0,0');
  a.draw('point', { x: 2, y: 2 }, 'red', 'same', { zIndex: -1 });
  a.draw('fill', { x: 2, y: 2 }, 'red', 'fill');
  a.draw('polygon', { filled: true, points: [{ y: 1, x: 1 }, { y: 1, x: 6 }, { y: 6, x: 1 }] }, 'blue', 'same-polygon');
  a.draw('polygon', { points: [{ x: 1, y: 6 }, { x: 6, y: 1 }, { x: 1, y: 1 }], filled: true }, 'blue', 'reversed');
  const data = project.toSharedJSON();
  expect(Object.keys(data.geometry)).toEqual(['g0', 'g1', 'g2', 'g3']);
  expect(data.geometry.g0.type).toBe('point');
  expect(data.cells['0,0'].shapes.map(s => s.geometryRef)).toEqual(['g0', 'g1', 'g0', 'g2', 'g1', 'g3']);
  expect(data.cells['0,1'].shapes.map(s => s.geometryRef)).toEqual(['g1', 'g0']);
  expect(data.cells['0,0'].shapes[0]).not.toHaveProperty('params');
  const reordered = Project.fromJSON(project.toJSON());
  first(reordered).params = { filled: true, points: [{ y: 1, x: 1 }, { y: 1, x: 6 }, { y: 6, x: 1 }] };
  expect(JSON.stringify(reordered.toSharedJSON())).toBe(JSON.stringify(data));
});

test('shared encoder walks live instances without expanded serializers or repeated immutable parameter reads', () => {
  const project = shared(), params = first(project).params;
  vi.spyOn(project, 'toJSON').mockImplementation(() => { throw new Error('expanded project'); });
  vi.spyOn(first(project), 'toJSON').mockImplementation(() => { throw new Error('expanded shape'); });
  const one = project.toSharedJSON(), two = project.toSharedJSON();
  expect(one).toEqual(two);
  expect(one.geometry.g0.params).toBe(two.geometry.g0.params);
  expect(first(project).params).toBe(params);
});

test.each([['direct V2', () => Project.fromJSON(v2())], ['explicit V1', shared]])('%s hydrates one detached deeply frozen parameter tree per unique geometry', (_, load) => {
  const project = load(), a = first(project), b = second(project);
  expect(project.storageVersion).toBe(2);
  expect(a.params).toBe(b.params);
  expect(Object.isFrozen(a.params.points[0])).toBe(true);
  expect(Object.hasOwn(a, 'params')).toBe(true);
  expect(Object.keys(a)).toContain('params');
  expect(structuredClone(a).params).toEqual(a.params);
  expect({ ...a }.params).toBe(a.params);
  expect(Object.keys(a)).not.toContain('_params');
  expect(a.clone().params).toBe(a.params);
  const snapshot = project.toJSON();
  snapshot.cells['0,0'].shapes[0].params.points[0].x = 7;
  expect(snapshot.cells['0,1'].shapes[0].params.points[0].x).toBe(1);
  expect(a.params.points[0].x).toBe(1);
});

test.each([['V1', () => fixture().toJSON()], ['V2', v2]])('shared %s hydration clones only unique raw parameter trees and leaves the incoming document mutable', (_, make) => {
  const data = make();
  const clone = vi.spyOn(globalThis, 'structuredClone');
  const project = Project.fromJSON(data, { sharedGeometry: true });
  const parameterClones = clone.mock.calls.filter(([value]) => value?.points?.length === 3);
  expect(parameterClones.length).toBeLessThanOrEqual(1);
  expect(first(project).params).toBe(second(project).params);
  const incoming = data.version === 2 ? data.geometry.g0.params : data.cells['0,0'].shapes[0].params;
  incoming.points[0].x = 7;
  expect(first(project).params.points[0].x).toBe(1);
  expect(Object.isFrozen(incoming)).toBe(false);
});

test('ordinary V1 and missing-version input stay mutable and choose expanded storage', () => {
  const data = fixture().toJSON(); delete data.version;
  const project = Project.fromJSON(data), a = first(project), b = second(project);
  expect(project.storageVersion).toBe(1);
  expect(project.toStorageJSON().version).toBe(1);
  expect(Object.isFrozen(a.params)).toBe(false);
  expect(a.clone().params.points).not.toBe(a.params.points);
  a.params.points[0].x = 7;
  expect(b.params.points[0].x).toBe(1);
});

test('only known deeply frozen shared params can be reused by clones', () => {
  const legacy = first(fixture());
  Object.freeze(legacy.params);
  const copy = legacy.clone();
  expect(copy.params).not.toBe(legacy.params);
  expect(copy.params.points).not.toBe(legacy.params.points);
  copy.params.points[0].x = 7;
  expect(legacy.params.points[0].x).toBe(1);
});

test('mutable geometry is recanonicalized after direct edits', () => {
  const project = fixture(), previous = project.toSharedJSON();
  first(project).params.points[0].x = 3;
  expect(project.toSharedJSON().geometry.g0.params.points[0].x).toBe(3);
  expect(previous.geometry.g0.params.points[0].x).toBe(1);
});

test('storageVersion is a cheap numeric hint and save/load honor selected or explicit formats', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sprite-shared-'));
  try {
    const project = shared();
    vi.spyOn(project, 'toSharedJSON').mockImplementationOnce(() => { throw new Error('geometry walk'); });
    expect(project.storageVersion).toBe(2);
    project.toSharedJSON.mockRestore();
    const file = path.join(dir, 'art.json');
    project.save(file);
    expect(JSON.parse(fs.readFileSync(file)).version).toBe(2);
    expect(Project.load(file).storageVersion).toBe(2);
    project.save(file, { format: 'expanded' });
    expect(JSON.parse(fs.readFileSync(file)).version).toBe(1);
    expect(project.storageVersion).toBe(2);
    expect(project.toStorageJSON().version).toBe(2);
    Project.load(file).save(file, { format: 'shared' });
    expect(JSON.parse(fs.readFileSync(file)).version).toBe(2);
    expect(() => project.save(file, { format: 'other' })).toThrow(/format/i);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('complete metadata, prototype-like names, orphan shape groups and replay survive compact roundtrip', () => {
  const project = fixture();
  project.groups.create('__proto__', ['start', '0,1']); project.groups.create('constructor', ['0,1']);
  project.animationFps = own([['__proto__', 12], ['constructor', 7]]);
  project.animationDirections = own([['__proto__', 'pingpong_reverse']]);
  project.animationLoops = own([['__proto__', false]]); project.frameDurations = { '0,0': 222 };
  project.shapeGroups = own([['start', own([['__proto__', ['body', 'missing']]])], ['orphan', { old: ['body'] }], ['0,0', { current: ['eye'] }]]);
  project.background = { mode: 'chroma', color: '#112233' }; project.pivot = { x: 4, y: 7 }; project.review = { notes: ['inspect'] };
  const digest = createHash('sha256').update('[]').digest('hex');
  const recorder = createConstructionRecorder({ cells: ['0,0'] }, { operations: [{ command: 'new' }], source: { kind: 'ops', path: 'ops.json' }, inputs: [{ path: 'ops.json', sha256: digest }] });
  recorder.capture(project, 0); recorder.finish(project);
  const expanded = project.toJSON(), loaded = Project.fromJSON(project.toSharedJSON());
  expect(loaded.toJSON()).toEqual(expanded);
  expect(Object.hasOwn(loaded.toSharedJSON().groups, '__proto__')).toBe(true);
  expect(Object.hasOwn(loaded.shapeGroups.start, '__proto__')).toBe(true);
  expect(loaded.shapeGroups.orphan).toEqual({ old: ['body'] });
  expect(loaded.exportAseprite()).toEqual(project.exportAseprite());
});

test.each([
  ['unknown version', d => { d.version = 3; }, /version|format/i],
  ['null version', d => { d.version = null; }, /version|format/i],
  ['invalid dictionary key', d => { d.geometry.bad = d.geometry.g0; }, /geometry.*key/i],
  ['unknown dictionary field', d => { d.geometry.g0.extra = true; }, /geometry.*field/i],
  ['unsupported primitive', d => { d.geometry.g0.type = 'script'; }, /shape.*type|geometry.*type/i],
  ['dangling reference', d => { d.cells['0,1'].shapes[0].geometryRef = 'g9'; }, /geometry.*ref/i],
  ['inherited reference', d => { d.cells['0,1'].shapes[0].geometryRef = 'constructor'; }, /geometry.*ref/i],
  ['expanded instance', d => { d.cells['0,1'].shapes[0].params = {}; }, /instance.*field/i],
  ['missing instance state', d => { delete d.cells['0,1'].shapes[0].visible; }, /instance.*field/i],
  ['duplicate local ID', d => { d.cells['0,0'].shapes[1].id = d.cells['0,0'].shapes[0].id; }, /unique.*ID|IDs.*unique/i],
  ['duplicate local name', d => { d.cells['0,0'].shapes[1].name = 'body'; }, /duplicate.*name/i],
  ['unsafe ID capacity', d => { d.cells['0,0'].shapes[0].id = `s${Number.MAX_SAFE_INTEGER - 1}`; }, /ID.*space/i],
  ['unsafe dimensions', d => { d.cellWidth = Number.MAX_SAFE_INTEGER; }, /dimension|pixel/i],
  ['noncanonical cell key', d => { d.cells['00,0'] = d.cells['0,0']; }, /cell/i],
  ['excess declared cells', d => { d.grid.cols = 10001; }, /cell/i],
  ['nonfinite JSON', d => { d.geometry.g0.params.detail = Infinity; }, /JSON|finite/i],
  ['non-JSON value', d => { d.geometry.g0.params.detail = undefined; }, /JSON/i],
  ['cyclic JSON', d => { d.geometry.g0.params.detail = d.geometry.g0.params; }, /JSON.*cycle/i],
  ['sparse JSON array with an extra key', d => { const value = []; value.length = 1; value.extra = true; d.geometry.g0.params.detail = value; }, /JSON.*array/i],
  ['unreferenced invalid surface', d => { d.geometry.g2 = { type: 'point', params: { x: 0, y: 0, surface: { normal: { mode: 'unknown' } } } }; }, /normal/i],
  ['unreferenced invalid layers', d => { d.geometry.g2 = { type: 'point', params: { x: 0, y: 0, layers: [{}] } }; }, /layer/i],
  ['excess JSON depth', d => { let p = d.geometry.g0.params; for (let i = 0; i < 70; i++) p = p.detail = {}; }, /depth/i],
  ['unsafe native stepping', d => { d.geometry.g1.params.x = Number.MAX_SAFE_INTEGER; d.geometry.g1.params.layers = [{ id: 'clip', x: -8, y: 0, w: 8, h: 8, z: 0, background: { mode: 'transparent' } }]; }, /coordinate|geometry|bound/i],
  ['excess raster work', d => { d.geometry.g0 = { type: 'line', params: { x1: 0, y1: 0, x2: 64000001, y2: 0 } }; }, /work/i],
])('rejects %s before any Shape hydration', (_, mutate, error) => {
  const data = v2(); mutate(data);
  const allocation = vi.spyOn(Shape, 'fromJSON');
  expect(() => Project.fromJSON(data)).toThrow(error);
  expect(allocation).not.toHaveBeenCalled();
});

test('rejects declared dictionary and expanded instance budgets before hydration', () => {
  const allocation = vi.spyOn(Shape, 'fromJSON');
  expect(() => Project.fromJSON(v2(), { maxShapes: 3 })).toThrow(/expanded shapes/i);
  expect(() => Project.fromJSON(v2(), { maxGeometry: 1 })).toThrow(/geometry/i);
  expect(allocation).not.toHaveBeenCalled();
});

test('charges repeated shared geometry against expanded raster work before hydration', () => {
  const data = v2();
  data.geometry = { g0: { type: 'line', params: { x1: 0, y1: 0, x2: 32000000, y2: 0 } } };
  data.cells['0,0'].shapes = Array.from({ length: 3 }, (_, i) => ({ id: `line-${i}`, name: null, color: 'red', zIndex: i, visible: true, geometryRef: 'g0' }));
  delete data.cells['0,1'];
  const allocation = vi.spyOn(Shape, 'fromJSON');
  expect(() => Project.fromJSON(data)).toThrow(/work/i);
  expect(allocation).not.toHaveBeenCalled();
});

test('shared hydration preserves per-cell repeated IDs and reserves imported numeric IDs globally', () => {
  const data = v2(), before = new Shape('point', { x: 0, y: 0 }, 'red');
  const id = `s${BigInt(before.id.slice(1)) + 1000n}`;
  data.cells['0,0'].shapes[0].id = id; data.cells['0,1'].shapes[0].id = id;
  const project = Project.fromJSON(data), a = first(project), b = second(project), cell = project.cells.getCell('0,0');
  expect(a.id).toBe(id); expect(b.id).toBe(id); expect(a).not.toBe(b);
  cell.deleteShape(id); cell.undo(); expect(cell.shapes.getById(id)).toBe(a);
  expect(project.cells.getCell('0,1').shapes.getById(id)).toBe(b);
  expect(BigInt(new Shape('point', { x: 0, y: 0 }, 'red').id.slice(1))).toBeGreaterThan(BigInt(id.slice(1)));
});

test('roundtrips reference-only cells in either representation', () => {
  const project = fixture();
  project.cells.getCell('0,2').reference = { path: 'guide.png', opacity: 0.5 };
  const expanded = project.toJSON();
  expect(expanded.cells['0,2']).toMatchObject({ shapes: [], reference: { path: 'guide.png', opacity: 0.5 } });
  expect(Project.fromJSON(project.toSharedJSON()).toJSON()).toEqual(expanded);
});

test('shared snapshots reject non-JSON live params clearly before canonicalization', () => {
  const project = fixture();
  first(project).params.detail = first(project).params;
  expect(() => project.toSharedJSON()).toThrow(/JSON.*cycle/i);
});

test('prototype-like parameter keys are retained as own data without polluting objects', () => {
  const data = v2();
  data.geometry.g0.params.detail = own([['__proto__', { safe: true }], ['constructor', ['value']]]);
  const project = Project.fromJSON(data), json = project.toSharedJSON();
  expect(Object.hasOwn(first(project).params.detail, '__proto__')).toBe(true);
  expect(json.geometry.g0.params.detail.__proto__).toEqual({ safe: true });
  expect({}.safe).toBeUndefined();
});

test('failed prospective model hydration rolls back the global shape allocator', () => {
  const data = v2(), before = new Shape('point', { x: 0, y: 0 }, 'red');
  data.cells['0,0'].shapes[0].id = `s${BigInt(before.id.slice(1)) + 10000n}`;
  data.groups.bad = ['missing-cell'];
  expect(() => Project.fromJSON(data)).toThrow(/cell/i);
  expect(new Shape('point', { x: 0, y: 0 }, 'red').id).toBe(`s${BigInt(before.id.slice(1)) + 1n}`);
});

test.each([['V1', () => fixture().toJSON()], ['V2', v2]])('near-limit direct shared %s hydration rejects exhausted capacity and rolls back before the next ordinary draw', (_, make) => {
  const data = make(); delete data.cells['0,1'];
  data.cells['0,0'].shapes[0].id = `s${Number.MAX_SAFE_INTEGER - 2}`;
  const before = new Shape('point', { x: 0, y: 0 }, 'red'), rollback = new Error('test allocator checkpoint');
  try {
    Shape.withIdAllocationTransaction(() => {
      expect(() => Project.fromJSON(data, { sharedGeometry: true })).toThrow(/ID space/i);
      const ordinary = Project.create({ name: 'After rollback', cellSize: 8, rows: 1, cols: 1 });
      expect(ordinary.cells.getCell('0,0').draw('point', { x: 0, y: 0 }, 'red').id).toBe(`s${BigInt(before.id.slice(1)) + 1n}`);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});

test.each([
  ['recolor secondary and history', (p, c) => { c.recolorShape('body', 'blue', 'yellow'); c.undo(); c.redo(); }],
  ['update params and history', (p, c) => { c.updateShapeParams('body', { filled: false }); c.undo(); c.redo(); }],
  ['move and history', (p, c) => { c.moveShape('body', 1, 0); c.undo(); c.redo(); }],
  ['flip and history', (p, c) => { c.flipShape('body', 'horizontal'); c.undo(); c.redo(); }],
  ['rotate and history', (p, c) => { c.rotateShape('body', 90); c.undo(); c.redo(); }],
  ['shift cell nested points', p => p.cells.shiftCell('0,0', 1, 1)],
  ['mirror cell nested points', p => p.cells.mirrorCell('0,0', 'horizontal')],
  ['rotate cell nested points', p => p.cells.rotateCell('0,0', 90)],
  ['delete undo and update', (p, c) => { const original = c.shapes.get('body'); c.deleteShape('body'); c.undo(); expect(c.shapes.get('body')).toBe(original); c.updateShapeParams('body', { filled: false }); c.undo(); c.redo(); }],
  ['clear undo and update', (p, c) => { const original = c.shapes.get('body'); c.clear(); c.undo(); expect(c.shapes.get('body')).toBe(original); c.recolorShape('body', 'blue', 'yellow'); c.undo(); c.redo(); }],
  ['copy cell then shift', p => { p.cells.copyCell('0,0', '0,2'); expect(p.cells.getCell('0,2').shapes.get('body').params).toBe(first(p).params); p.cells.shiftCell('0,2', 1, 1); }],
  ['handler resize and move', p => { const state = { project: p }; handleResizeShape(state, { cell: '0,0', shape: 'body', updates: { filled: false } }); handleMoveShapeTo(state, { cell: '0,0', shape: 'body', x: 2, y: 2 }); }],
  ['handler clone and duplicate', p => { const state = { project: p }; handleCloneShape(state, { from_cell: '0,0', to_cell: '0,2', shape: 'body', new_name: 'clone' }); handleDuplicateShape(state, { cell: '0,0', shape: 'body', as: 'copy', mirror: 'horizontal' }); }],
])('%s isolates shared geometry in other frames', (_, edit) => {
  const project = shared(), cell = project.cells.getCell('0,0'), before = second(project).toJSON();
  edit(project, cell);
  expect(second(project).toJSON()).toEqual(before);
});

test('mutableParams detaches once and assigning replacement params detaches without leaking private state', () => {
  const project = shared(), shape = first(project), pooled = shape.params;
  const owned = shape.mutableParams();
  expect(owned).not.toBe(pooled); expect(shape.mutableParams()).toBe(owned);
  owned.points[0].x = 4;
  expect(second(project).params.points[0].x).toBe(1);
  shape.params = { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] };
  expect(shape.clone().params).not.toBe(shape.params);
  expect(Object.keys(shape)).toEqual(['id', 'type', 'params', 'color', 'name', 'zIndex', 'visible']);
});

test('assigning known shared params detaches a replacement from its source', () => {
  const project = shared(), a = first(project), b = second(project);
  a.params = b.params;
  expect(a.params).not.toBe(b.params);
  a.params.points[0].x = 6;
  expect(b.params.points[0].x).toBe(1);
});

test('layer/surface/lighting edits and native color/normal/atlas output retain compact parity', () => {
  const project = fixture(), cell = project.cells.getCell('0,0');
  cell.updateShapeParams('body', { layers: [{ id: 'art', x: 1, y: 1, w: 6, h: 6, z: 0, background: { mode: 'transparent' } }], surface: { normal: { mode: 'bevel', width: 1, depth: 1 }, material: { solid: true } } });
  cell.draw('rect', { x: 2, y: 2, w: 2, h: 2, filled: true, erase: true }, '#ffffff80', 'eraser');
  cell.setLighting({ palettePolicy: 'rgb', ambient: 0.2, sky: 0.7 });
  project.cells.copyCell('0,0', '0,1');
  const compact = Project.fromJSON(project.toSharedJSON());
  const renderer = new CanvasRenderer(project.palette), restored = new CanvasRenderer(compact.palette);
  for (const channel of ['color', 'normal', 'light']) {
    expect(restored.renderCellRaw(compact.cells.getCell('0,0'), { channel })).toEqual(renderer.renderCellRaw(cell, { channel }));
    expect(restored.renderSheet(compact.cells, { channel })).toEqual(renderer.renderSheet(project.cells, { channel }));
  }
  expect(compact.exportAseprite()).toEqual(project.exportAseprite());
  const before = second(compact).toJSON(), target = compact.cells.getCell('0,0');
  editLayer(target, { id: 'art', dx: 1 }); target.undo(); target.redo();
  target.setShapeSurface(first(compact), { normal: { mode: 'flat' } }); target.undo(); target.redo();
  compact.cells.mirrorCell('0,0', 'horizontal'); compact.cells.rotateCell('0,0', 90); compact.cells.shiftCell('0,0', 1, 0);
  expect(second(compact).toJSON()).toEqual(before);
});

test.each([
  ['point', { x: 2, y: 2 }], ['fill', { x: 0, y: 0 }],
  ['line', { x1: 1.2, y1: 1.6, x2: 6.2, y2: 5.7 }],
  ['rect', { x: 1, y: 1, w: 5, h: 5, filled: true, pattern: 'checker', color2: '#0000ff80' }],
  ['circle', { cx: 4, cy: 4, r: 2, filled: false }],
  ['ellipse', { cx: 4, cy: 4, rx: 2, ry: 1, filled: true }],
  ['polygon', { points: [{ x: 1, y: 1 }, { x: 6, y: 2 }, { x: 2, y: 6 }], filled: true }],
  ['polyline', { points: [{ x: 1, y: 1 }, { x: 6, y: 2 }, { x: 2, y: 6 }] }],
])('compact %s retains canonical native color and normal pixels and atlas metadata', (type, params) => {
  const project = Project.create({ name: 'Primitives', cellSize: 8, rows: 1, cols: 2 });
  const cell = project.cells.getCell('0,0');
  cell.draw(type, { ...params, surface: { normal: { mode: 'flat', vector: [0, -1, 1] } } }, '#ff000080', 'art');
  cell.draw('point', { x: 2, y: 2, erase: true }, '#ffffff80', 'eraser');
  project.cells.copyCell('0,0', '0,1');
  const loaded = Project.fromJSON(project.toSharedJSON());
  const before = new CanvasRenderer(project.palette), after = new CanvasRenderer(loaded.palette);
  for (const channel of ['color', 'normal']) {
    expect(after.renderCellRaw(loaded.cells.getCell('0,0'), { channel })).toEqual(before.renderCellRaw(cell, { channel }));
    expect(after.renderSheet(loaded.cells, { channel })).toEqual(before.renderSheet(project.cells, { channel }));
  }
  expect(loaded.exportAseprite()).toEqual(project.exportAseprite());
});
