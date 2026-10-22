import { expect, test } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { validateImportedProject } from '../../server/import/project-validation.js';
import { translateParams } from '../../server/web/public/js/shared/shape-layers.js';
import { snapParams } from '../../server/web/public/js/shared/raster.js';

const limits = { maxCells: 10000, maxShapes: 200000 };
const layer = x => ({ id: 'retained', x, y: 0, w: 8, h: 8, z: 0, background: { mode: 'transparent' } });
function packet(type, params) {
  const data = Project.create({ name: 'Translated art', cellSize: 8, rows: 1, cols: 1, palette: 'pico8' }).toJSON();
  data.cells['0,0'] = { name: null, shapes: [{ id: 's1', name: null, type, params, color: 'red', zIndex: 0, visible: true }] };
  return data;
}
const origin = Number.MAX_SAFE_INTEGER - 3;
const primitives = [
  ['point', { x: origin, y: 0 }],
  ['fill', { x: origin, y: 0 }],
  ['line', { x1: origin, y1: 0, x2: origin + 1, y2: 1 }],
  ['rect', { x: origin, y: 0, w: 3, h: 1, filled: true, pattern: 'checker', color2: 'blue' }],
  ['circle', { cx: origin, cy: 0, r: 1, filled: true }],
  ['ellipse', { cx: origin, cy: 0, rx: 1, ry: 1, filled: true }],
  ['polygon', { points: [{ x: origin, y: 0 }, { x: origin + 1, y: 0 }, { x: origin, y: 1 }], filled: true }],
  ['polyline', { points: [{ x: origin, y: 0 }, { x: origin + 1, y: 1 }] }],
];
const translatedCases = primitives.flatMap(([type, geometry]) => [false, true].map(surface => [type, surface, geometry]));
test.each(translatedCases)('rejects unsafe translated %s coordinates with surface=%s without rasterizing', (type, surface, geometry) => {
  const params = { ...geometry, layers: [layer(-8)], ...(surface ? { surface: { normal: { mode: 'flat' } } } : {}) };
  const local = snapParams(translateParams(params, 8, 0));
  const localX = local.x ?? local.x1 ?? local.cx ?? local.points[0].x;
  expect(Number.isSafeInteger(localX)).toBe(false);
  expect(() => validateImportedProject(packet(type, params), limits)).toThrow(/shape.*(?:coordinate|geometry|bound)/i);
});
test('checks the rendered local rectangle endpoint rather than an unused global endpoint', () => {
  const params = { x: Number.MAX_SAFE_INTEGER, y: 0, w: 3, h: 1, filled: true, pattern: 'checker', color2: 'blue', layers: [layer(Number.MAX_SAFE_INTEGER - 8)] };
  expect(Number.isSafeInteger(params.x + params.w)).toBe(false);
  const local = snapParams(translateParams(params, -params.layers[0].x, 0));
  expect(Number.isSafeInteger(local.x + local.w)).toBe(true);
  expect(() => validateImportedProject(packet('rect', params), limits)).not.toThrow();
});
