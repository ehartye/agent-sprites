import { expect, test } from 'vitest';
import { generateNormalPlane, encodeNormalPlane } from '../../server/web/public/js/shared/surface-normals.js';

const image = (w, h, color = [180, 180, 180, 255]) => new Uint8ClampedArray(Array.from({ length: w * h }, () => color).flat());
const vector = (n, width, x, y) => Array.from(n.slice((y * width + x) * 3, (y * width + x) * 3 + 3));
test('flat normals encode in export coordinates and preserve partial alpha', () => {
  const rgba = image(3, 1); rgba[7] = 127; rgba[11] = 0;
  const normal = generateNormalPlane({ rgba, width: 3, height: 1 });
  expect(Array.from(normal)).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 0]);
  expect(Array.from(encodeNormalPlane({ rgba, normals: normal, width: 3, height: 1 }))).toEqual([128, 128, 255, 255, 128, 128, 255, 127, 0, 0, 0, 0]);
  const north = generateNormalPlane({ rgba, width: 3, height: 1, normal: { mode: 'flat', vector: [0, -1, 1] } });
  expect(encodeNormalPlane({ rgba, normals: north, width: 3, height: 1 })[1]).toBeGreaterThan(128);
});

test('bevel follows painted boundaries, holes and image borders', () => {
  const rgba = image(7, 7); rgba[(3 * 7 + 3) * 4 + 3] = 0;
  const normals = generateNormalPlane({ rgba, width: 7, height: 7, normal: { mode: 'bevel', width: 2, depth: 2 } });
  expect(vector(normals, 7, 0, 3)[0]).toBeLessThan(0); expect(vector(normals, 7, 6, 3)[0]).toBeGreaterThan(0);
  expect(vector(normals, 7, 2, 3)[0]).toBeGreaterThan(0); expect(vector(normals, 7, 3, 2)[1]).toBeGreaterThan(0);
  expect(vector(normals, 7, 3, 3)).toEqual([0, 0, 0]);
  for (let i = 0; i < 49; i++) if (rgba[i * 4 + 3]) expect(Math.hypot(...normals.slice(i * 3, i * 3 + 3))).toBeCloseTo(1);
});

test('dome uses each connected component instead of its combined bounding box', () => {
  const rgba = image(11, 5, [0, 0, 0, 0]);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) rgba[(y * 11 + x) * 4 + 3] = 255;
  for (let y = 1; y < 4; y++) for (let x = 8; x < 11; x++) rgba[(y * 11 + x) * 4 + 3] = 255;
  const normals = generateNormalPlane({ rgba, width: 11, height: 5, normal: { mode: 'dome', depth: 3 } });
  expect(vector(normals, 11, 2, 2)).toEqual([0, 0, 1]); expect(vector(normals, 11, 9, 2)).toEqual([0, 0, 1]);
  expect(vector(normals, 11, 8, 2)[0]).toBeLessThan(0); expect(vector(normals, 11, 10, 2)[0]).toBeGreaterThan(0);
});

test('luma derives height from current RGB and mask rather than alpha alone', () => {
  const rgba = image(5, 3, [0, 0, 0, 255]); for (let y = 0; y < 3; y++) rgba.set([255, 255, 255, 255], (y * 5 + 2) * 4);
  const before = rgba.slice();
  const normals = generateNormalPlane({ rgba, width: 5, height: 3, normal: { mode: 'luma', depth: 2 } });
  expect(vector(normals, 5, 1, 1)[0]).toBeLessThan(0); expect(vector(normals, 5, 3, 1)[0]).toBeGreaterThan(0); expect(rgba).toEqual(before);
  expect(vector(generateNormalPlane({ rgba, width: 5, height: 3, normal: { mode: 'luma', depth: 0 } }), 5, 1, 1)).toEqual([0, 0, 1]);
});

test('grid uses local origin, hard and soft directions and flat unassigned pixels', () => {
  const rgba = image(5, 2);
  const normals = generateNormalPlane({ rgba, width: 5, height: 2, normal: { mode: 'grid', x: 1, y: 0, rows: ['8w6', '0. '] } });
  expect(vector(normals, 5, 0, 0)).toEqual([0, 0, 1]); expect(vector(normals, 5, 1, 0)[1]).toBeLessThan(vector(normals, 5, 2, 0)[1]);
  expect(vector(normals, 5, 3, 0)[0]).toBeGreaterThan(0); expect(vector(normals, 5, 2, 1)).toEqual([0, 0, 1]);
});

test('normal APIs reject unsafe sizes and invalid buffers before allocation', () => {
  const args = { width: 4194305, height: 1, get rgba() { throw new Error('buffer read'); } };
  expect(() => generateNormalPlane(args)).toThrow(/pixel/i); expect(() => encodeNormalPlane(args)).toThrow(/pixel/i);
  expect(() => generateNormalPlane({ rgba: image(1, 1), width: 2, height: 2 })).toThrow(/rgba/i);
  expect(() => encodeNormalPlane({ rgba: image(1, 1), normals: new Float32Array([NaN, 0, 1]), width: 1, height: 1 })).toThrow(/normal/i);
  expect(() => encodeNormalPlane({ rgba: image(1, 1), normals: new Float64Array([Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE]), width: 1, height: 1 })).toThrow(/normal/i);
});
