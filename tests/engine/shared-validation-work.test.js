import { afterEach, expect, test, vi } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { Shape } from '../../server/engine/shape.js';
import * as layers from '../../server/web/public/js/shared/shape-layers.js';
import * as surfaceRaster from '../../server/web/public/js/shared/surface-raster.js';
import { SURFACE_LIMITS } from '../../server/web/public/js/shared/surface-model.js';

afterEach(() => vi.restoreAllMocks());
const layer = () => ({ id: 'clip', x: -8, y: 0, w: 8, h: 8, z: 0, background: { mode: 'transparent' } });
function fixture() {
  const p = Project.create({ name: 'Validated', cellSize: 8, rows: 1, cols: 1, palette: 'pico8' });
  p.cells.getCell('0,0').draw('point', { x: 1, y: 1, surface: { normal: { mode: 'grid', x: 1, y: 1, rows: ['6'] }, lamps: [{ name: 'key', x: 1, y: 1 }] } }, '#fff');
  return p;
}
test('scene preflight never clones unused primitive parameter trees', () => {
  const p = fixture(), shape = p.cells.getCell('0,0').shapes.listByZ()[0];
  const clone = vi.spyOn(globalThis, 'structuredClone');
  surfaceRaster.validateSurfaceScene({ shapes: [shape], width: 8, height: 8 });
  expect(clone.mock.calls.some(([value]) => value === shape.params)).toBe(false);
});
test('geometry validation views share exact translation arithmetic while authoring still deeply detaches', () => {
  const params = { points: [{ x: 1, y: 2, detail: { keep: true } }, { x: 3, y: 4 }], layers: [layer()], surface: { normal: { mode: 'grid', x: 1, y: 1, rows: ['6'] } }, detail: { values: [1] } };
  expect(typeof layers.translateGeometryParams).toBe('function');
  const view = layers.translateGeometryParams(params, 8, 2), authored = layers.translateParams(params, 8, 2);
  expect(view.points).toEqual(authored.points); expect(view.points).not.toBe(params.points);
  authored.layers[0].background.mode = 'chroma'; authored.detail.values[0] = 2; authored.points[0].detail.keep = false; authored.surface.normal.rows[0] = '4';
  expect(params).toMatchObject({ layers: [{ background: { mode: 'transparent' } }], detail: { values: [1] }, points: [{ detail: { keep: true } }, {}], surface: { normal: { rows: ['6'] } } });
});
test.each([1, 2])('validated shared V%s loading checks each surface scene once', version => {
  const p = fixture(), data = version === 2 ? p.toSharedJSON() : p.toJSON();
  const validate = vi.spyOn(surfaceRaster, 'validateSurfaceScene');
  Project.fromJSON(data, { sharedGeometry: true });
  expect(validate).toHaveBeenCalledTimes(1);
});
test.each(['grid', 'lamp'])('shared and legacy loaders reject translated %s overflow and roll back IDs', kind => {
  const p = fixture(), compact = p.toSharedJSON(), data = p.toJSON(), shape = data.cells['0,0'].shapes[0];
  shape.params.layers = [layer()];
  if (kind === 'grid') shape.params.surface.normal.x = SURFACE_LIMITS.maxCoordinate;
  else shape.params.surface.lamps[0].x = SURFACE_LIMITS.maxCoordinate;
  const previous = new Shape('point', { x: 0, y: 0 }, 'red').id;
  shape.id = 's900000';
  data.skipSceneValidation = true;
  for (const sharedGeometry of [true, false]) expect(() => Project.fromJSON(data, { sharedGeometry, skipSceneValidation: true })).toThrow(/Grid|Lamp/);
  compact.geometry.g0.params = structuredClone(shape.params); compact.skipSceneValidation = true;
  expect(() => Project.fromJSON(compact, { skipSceneValidation: true })).toThrow(/Grid|Lamp/);
  expect(+new Shape('point', { x: 0, y: 0 }, 'red').id.slice(1)).toBe(+previous.slice(1) + 1);
});
test('ordinary constructor cannot receive validation proof through options or an arbitrary second argument', () => {
  const p = fixture(); p.cells.getCell('0,0').shapes.listByZ()[0].params.surface = null;
  expect(() => new Project({ ...p, storageVersion: 2, skipSceneValidation: true }, Symbol('validated'))).toThrow(/surface/);
});
