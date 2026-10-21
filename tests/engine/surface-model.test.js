import { expect, test } from 'vitest';
import { SURFACE_LIMITS, validateSurface, validateLighting, translateSurface, flipSurface, rotateSurface, validateSurfaceWork } from '../../server/web/public/js/shared/surface-model.js';

test('normalizes detached surface data and supplies explicit source defaults', () => {
  const input = { normal: { mode: 'flat', vector: [3, 0, 4] }, material: { wall: true }, lamps: [{ name: 'key', x: 2, y: -3 }] };
  const result = validateSurface(input);
  expect(result.normal.vector).toEqual([0.6, 0, 0.8]);
  expect(result.material).toEqual({ wall: true });
  expect(result.lamps[0]).toEqual({ name: 'key', x: 2, y: -3, radius: 32, power: 1, z: 8, color: '#ffffff' });
  result.normal.vector[0] = 0; expect(input.normal.vector[0]).toBe(3);
  expect(validateSurface(undefined)).toBeUndefined(); expect(validateSurface({})).toEqual({});
  expect(validateSurface({ normal: { mode: 'flat' } }).normal.vector).toEqual([0, 0, 1]);
  expect(validateSurface({ normal: { mode: 'bevel' } }).normal).toEqual({ mode: 'bevel', width: 2, depth: 1 });
  for (const mode of ['dome', 'luma']) expect(validateSurface({ normal: { mode } }).normal).toEqual({ mode, depth: 1 });
});

test.each([
  null, { mystery: true }, { normal: { mode: 'unknown' } }, { normal: { mode: 'flat', vector: [0, 0, 0] } },
  { normal: { mode: 'flat', vector: [0, 0, -1] } }, { normal: { mode: 'flat', vector: [Infinity, 0, 1] } },
  { normal: { mode: 'bevel', width: 0 } }, { normal: { mode: 'dome', depth: 33 } },
  { material: { wall: 1 } }, { material: { specular: true } },
  { lamps: [{ name: 'a', x: 0, y: 0, color: '#fff8' }] }, { lamps: [{ name: '', x: 0, y: 0 }] },
  { lamps: [{ name: 'a', x: 0.5, y: 0 }] }, { lamps: [{ name: 'a', x: 1048577, y: 0 }] },
  { lamps: [{ name: 'a', x: 0, y: 0, power: NaN }] }, { lamps: [{ name: 'a', x: 0, y: 0, radius: 0 }] },
  { lamps: [{ name: 'a', x: 0, y: 0, z: -1 }] }, { lamps: [{ name: 'a', x: 0, y: 0 }, { name: 'a', x: 1, y: 1 }] },
])('rejects invalid retained surface data %#', input => expect(() => validateSurface(input)).toThrow());

test('validates grid symbols, extent and lamp count before copying', () => {
  const normal = { mode: 'grid', x: -2, y: 4, rows: ['789qwe', '456asd', '123zxc', '0. 5s0'] };
  expect(validateSurface({ normal }).normal).toEqual(normal);
  for (const rows of [[], ['1', '22'], ['?'], [''], ['0'.repeat(65537)]]) expect(() => validateSurface({ normal: { mode: 'grid', x: 0, y: 0, rows } })).toThrow();
  expect(() => validateSurface({ lamps: Array.from({ length: 65 }, (_, i) => ({ name: `l${i}`, x: 0, y: 0 })) })).toThrow();
});

test.each([
  () => validateSurface({ normal: { mode: 'flat', vector: [, , 1] } }),
  () => validateLighting({ palettePolicy: 'rgb', skyDir: [, -1] }),
  () => validateSurface({ lamps: Array(1) }),
])('rejects sparse metadata arrays instead of normalizing holes %#', validate => expect(validate).toThrow());

test('lighting requires an explicit palette policy and validates every optional field', () => {
  expect(validateLighting(undefined)).toBeUndefined();
  expect(validateLighting({ palettePolicy: 'rgb' })).toEqual({ cell: 4, smooth: false, block: 0.4, shape: 'round', ambient: 0, ambientColor: '#ffffff', sky: 0, skyColor: '#ffffff', skyReach: 24, skyDir: [0, -1], relief: 1, palettePolicy: 'rgb' });
  const value = { palettePolicy: 'nearest', skyDir: [3, -4], skyColor: '#abc' };
  const result = validateLighting(value); result.skyDir[0] = 99; expect(value.skyDir[0]).toBe(3);
  for (const bad of [{}, { palettePolicy: 'auto' }, { palettePolicy: 'rgb', cell: 0 }, { palettePolicy: 'rgb', smooth: 1 }, { palettePolicy: 'rgb', block: 2 }, { palettePolicy: 'rgb', ambient: Infinity }, { palettePolicy: 'rgb', sky: -1 }, { palettePolicy: 'rgb', skyDir: [0, 0] }, { palettePolicy: 'rgb', skyReach: 0 }, { palettePolicy: 'rgb', ambientColor: '#ffffff80' }, { palettePolicy: 'rgb', extra: 0 }]) expect(() => validateLighting(bad)).toThrow();
});

test('translates, flips and rotates global metadata without touching the input', () => {
  const surface = { normal: { mode: 'grid', x: 2, y: 3, rows: ['86', 'q0', '12'] }, lamps: [{ name: 'key', x: 4, y: 5 }] };
  const original = structuredClone(surface);
  expect(translateSurface(surface, -2, 4).normal).toMatchObject({ x: 0, y: 7, rows: surface.normal.rows });
  expect(translateSurface(surface, -2, 4).lamps[0]).toMatchObject({ x: 2, y: 9 });
  expect(flipSurface(surface, 'x', 10).normal).toEqual({ mode: 'grid', x: 7, y: 3, rows: ['48', '0e', '23'] });
  expect(flipSurface(surface, 'y', 10).normal).toEqual({ mode: 'grid', x: 2, y: 5, rows: ['78', 'z0', '26'] });
  expect(rotateSurface(surface, 90, 0, 0).normal).toEqual({ mode: 'grid', x: -5, y: 2, rows: ['7e6', '402'] });
  expect(rotateSurface(surface, 90, 0, 0).lamps[0]).toMatchObject({ x: -5, y: 4 });
  expect(rotateSurface(rotateSurface(surface, 90, 0, 0), 270, 0, 0)).toEqual(validateSurface(surface));
  expect(surface).toEqual(original);
});

test('direction transforms use clockwise y-down coordinates and retain derived modes', () => {
  const value = { normal: { mode: 'flat', vector: [1, 0, 1] } };
  expect(flipSurface(value, 'x', 0).normal.vector[0]).toBeLessThan(0);
  const rotated = rotateSurface(value, 90, 3, 4).normal.vector;
  expect(rotated[0]).toBeCloseTo(0); expect(rotated[1]).toBeCloseTo(Math.SQRT1_2);
  expect(rotateSurface({ normal: { mode: 'dome', depth: 2 } }, 180, 0, 0)).toEqual({ normal: { mode: 'dome', depth: 2 } });
  expect(() => rotateSurface(value, 45, 0, 0)).toThrow(); expect(() => flipSurface(value, 'z', 0)).toThrow();
  expect(() => translateSurface({ lamps: [{ name: 'a', x: 1048576, y: 0 }] }, 1, 0)).toThrow();
});

test('quarter turns round pixel points around odd/even rectangular cell pivots', () => {
  const surface = { normal: { mode: 'grid', x: 0, y: 0, rows: ['7896', '4560', '123.'] }, lamps: [{ name: 'corner', x: 0, y: 0 }, { name: 'opposite', x: 3, y: 2 }] };
  const result = rotateSurface(surface, 90, 1.5, 1);
  expect(result.normal).toEqual({ mode: 'grid', x: 1, y: 0, rows: ['789', '456', '123', '.02'] });
  expect(result.lamps.map(({ x, y }) => [x, y])).toEqual([[3, 0], [1, 3]]);
  expect(surface.normal.rows).toEqual(['7896', '4560', '123.']);
});

test('rejects pixel and source work limits before accessing pixel storage', () => {
  expect(SURFACE_LIMITS).toMatchObject({ maxPixels: 4194304, maxLamps: 64, maxWork: 64000000 });
  expect(() => validateSurfaceWork(4194305, 1, 0)).toThrow(/pixel/i);
  expect(() => validateSurfaceWork(1024, 1024, 64)).toThrow(/work/i);
  expect(() => validateSurfaceWork(1000000000, 1000000000, 0)).toThrow();
  expect(validateSurfaceWork(4, 8, 2, { sky: 1 })).toBe(32);
});
