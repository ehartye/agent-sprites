import { expect, test } from 'vitest';
import { applySurfaceLighting } from '../../server/web/public/js/shared/surface-lighting.js';
import { generateNormalPlane } from '../../server/web/public/js/shared/surface-normals.js';

const image = (w, h, color = [200, 160, 120, 255]) => new Uint8ClampedArray(Array.from({ length: w * h }, () => color).flat());
const lamp = (extra = {}) => ({ name: 'key', x: 0, y: 0, radius: 32, power: 1, z: 8, color: '#fff', ...extra });
const options = { palettePolicy: 'rgb', cell: 1 };
const red = (a, w, x, y = 0) => a[(y * w + x) * 4];
const run = (extra = {}) => applySurfaceLighting({ rgba: image(9, 1), width: 9, height: 1, lamps: [lamp()], lighting: options, ...extra });

test('disabled lighting exactly clones source pixels and keeps alpha in light output', () => {
  const rgba = new Uint8ClampedArray([20, 50, 90, 120, 7, 8, 9, 0]);
  const result = run({ rgba, width: 2, lighting: undefined });
  expect(result.color).toEqual(rgba); expect(result.color).not.toBe(rgba);
  expect(Array.from(result.light)).toEqual([255, 255, 255, 120, 0, 0, 0, 0]);
});

test('lamp diffusion fades with distance and channels combine by maximum', () => {
  const one = run(); expect(red(one.light, 9, 0)).toBeGreaterThan(red(one.light, 9, 8));
  const mixed = run({ lamps: [lamp({ name: 'red', color: '#f00' }), lamp({ name: 'blue', color: '#00f' })] });
  expect(Array.from(mixed.light.slice(0, 3))).toEqual([255, 0, 255]);
  expect(run({ lamps: [lamp(), lamp({ name: 'other' })] }).color).toEqual(one.color);
});

test('solid thickness attenuates more than air while walls pass propagated light', () => {
  const width = 12, height = 3, rgba = image(width, height), materials = new Uint8Array(width * height * 3);
  const render = () => run({ rgba, width, height, materials, lighting: { ...options, block: 0.5 }, lamps: [lamp({ y: 1, radius: 64 })] });
  const openResult = render(), open = red(openResult.light, width, 10, 1);
  for (let y = 0; y < height; y++) materials[(y * width + 4) * 3 + 1] = 255;
  expect(render().light).toEqual(openResult.light);
  for (let y = 0; y < height; y++) materials[(y * width + 4) * 3] = 255;
  const thin = red(render().light, width, 10, 1);
  for (let y = 0; y < height; y++) for (let x = 5; x <= 7; x++) materials[(y * width + x) * 3] = 255;
  const thick = red(render().light, width, 10, 1); expect(open).toBeGreaterThan(thin); expect(thin).toBeGreaterThan(thick);
});

test('solid block is a fractional loss per eight pixels independent of grid size', () => {
  const width = 24, rgba = image(width, 1), materials = new Uint8Array(width * 3);
  for (let x = 0; x < width; x++) materials[x * 3] = 255;
  const input = { rgba, width, height: 1, materials, lamps: [lamp({ x: 4, radius: 8192, power: 0.5 })] };
  const coarse = run({ ...input, lighting: { ...options, cell: 8, block: 0.5 } });
  const fine = run({ ...input, lighting: { ...options, cell: 1, block: 0.5 } });
  // One eight-pixel step transmits one half, rather than subtracting 0.5 intensity.
  expect(red(coarse.light, width, 12)).toBe(64); expect(red(coarse.light, width, 20)).toBe(32);
  expect(red(fine.light, width, 12)).toBe(red(coarse.light, width, 12));
  expect(red(fine.light, width, 20)).toBe(red(coarse.light, width, 20));
});

test('solid transitions integrate fractional half-endpoint thickness', () => {
  const rgba = image(3, 1), materials = new Uint8Array(9); materials[3] = 255;
  const result = run({ rgba, width: 3, height: 1, materials, lamps: [lamp({ radius: 8192, power: 0.5 })], lighting: { ...options, block: 0.99 } });
  // Entering/exiting a one-pixel solid each crosses half a pixel of material.
  expect(red(result.light, 3, 1)).toBe(Math.round(0.5 * 0.01 ** (0.5 / 8) * 255));
  expect(red(result.light, 3, 2)).toBe(Math.round(0.5 * 0.01 ** (1 / 8) * 255));
});

test('block one stops any positive solid thickness and block zero adds no loss', () => {
  const rgba = image(3, 1), materials = new Uint8Array(9); materials[3] = 255;
  const input = { rgba, width: 3, height: 1, lamps: [lamp({ radius: 32 })] };
  expect(run({ ...input, materials, lighting: { ...options, block: 0 } }).light).toEqual(run({ ...input, lighting: { ...options, block: 0 } }).light);
  const blocked = run({ ...input, materials, lighting: { ...options, block: 1 } });
  expect(red(blocked.light, 3, 0)).toBe(255); expect(red(blocked.light, 3, 1)).toBe(0); expect(red(blocked.light, 3, 2)).toBe(0);
});

test('brighter sources retain proportionally more light deep inside solid material', () => {
  const width = 24, rgba = image(width, 1), materials = new Uint8Array(width * 3);
  for (let x = 0; x < width; x++) materials[x * 3] = 255;
  const render = power => run({ rgba, width, height: 1, materials, lamps: [lamp({ x: 4, radius: 8192, power })], lighting: { ...options, cell: 8, block: 0.5 } });
  expect(red(render(0.25).light, width, 20)).toBe(16); expect(red(render(1).light, width, 20)).toBe(64);
});

test('round propagation blocks diagonal corner leaks and diamond uses axial paths', () => {
  const rgba = image(2, 2), materials = new Uint8Array(12); materials[3] = 255; materials[6] = 255;
  const blocked = run({ rgba, width: 2, height: 2, materials, lamps: [lamp({ radius: 4 })], lighting: { ...options, block: 1 } });
  expect(red(blocked.light, 2, 1, 1)).toBeLessThan(128);
  const round = run({ rgba, width: 2, height: 2, lamps: [lamp({ radius: 4 })] });
  const diamond = run({ rgba, width: 2, height: 2, lamps: [lamp({ radius: 4 })], lighting: { ...options, shape: 'diamond' } });
  expect(red(round.light, 2, 1, 1)).toBeGreaterThan(red(diamond.light, 2, 1, 1));
});

test('sky excludes its first wall from seeding and unlit pixels skip quantization', () => {
  const width = 3, height = 5, rgba = image(width, height), materials = new Uint8Array(width * height * 3);
  for (let x = 0; x < width; x++) materials[(2 * width + x) * 3 + 1] = 255;
  materials[(4 * width + 1) * 3 + 2] = 128;
  const result = run({ rgba, width, height, materials, lamps: [], lighting: { ...options, sky: 1, skyReach: 2, palettePolicy: 'nearest' }, palette: ['#000', '#fff'] });
  expect(red(result.light, width, 1, 0)).toBe(255); expect(red(result.light, width, 0, 4)).toBe(0);
  expect(red(result.light, width, 1, 2)).toBe(128);
  expect(Array.from(result.color.slice((4 * width + 1) * 4, (4 * width + 2) * 4))).toEqual([200, 160, 120, 255]);
});

test('zero-height lamps use the actual direction and a finite flat-relative relief response', () => {
  const rgba = image(3, 1, [255, 255, 255, 255]), normals = generateNormalPlane({ rgba, width: 3, height: 1, normal: { mode: 'flat', vector: [-1, 0, 0] } });
  const base = { rgba, width: 3, height: 1, lamps: [lamp({ x: 0, radius: 4, power: 0.25, z: 0 })] };
  const unmapped = run(base), mapped = run({ ...base, normals });
  // At x=2, source direction is (-1,0,0); flat response is 0, normal dot is 1.
  expect(red(unmapped.light, 3, 2)).toBe(32); expect(red(mapped.light, 3, 2)).toBe(64);
  expect(red(mapped.light, 3, 1)).toBe(96);
  // At zero source distance the explicit unit fallback is (0,0,1).
  expect(red(mapped.light, 3, 0)).toBe(0);
});

test('flat normals match unmapped light and zero relief disables normal response', () => {
  const rgba = image(9, 1), normals = generateNormalPlane({ rgba, width: 9, height: 1 });
  expect(run({ rgba, normals }).color).toEqual(run({ rgba }).color);
  const tilted = generateNormalPlane({ rgba, width: 9, height: 1, normal: { mode: 'flat', vector: [1, 0, 1] } });
  expect(run({ rgba, normals: tilted, lighting: { ...options, relief: 0 } }).color).toEqual(run({ rgba }).color);
  expect(red(run({ rgba, normals: tilted }).color, 9, 8)).toBeLessThan(red(run({ rgba }).color, 9, 8));
});

test('ambient is directionless, alpha is preserved and nearest ties select first', () => {
  const rgba = image(2, 1, [128, 0, 0, 91]);
  const normals = generateNormalPlane({ rgba, width: 2, height: 1, normal: { mode: 'flat', vector: [1, 0, 0] } });
  const result = run({ rgba, width: 2, normals, lamps: [], lighting: { ...options, ambient: 1, palettePolicy: 'nearest' }, palette: ['#7f0000', '#810000'] });
  expect(Array.from(result.color)).toEqual([127, 0, 0, 91, 127, 0, 0, 91]); expect(result.light[3]).toBe(91);
  expect(() => run({ lighting: { ...options, palettePolicy: 'nearest' } })).toThrow(/palette/i);
  expect(() => run({ lighting: { ...options, palettePolicy: 'nearest' }, palette: ['#fff8'] })).toThrow(/palette|opaque/i);
});

test('smooth cell sampling is finite and does not mutate retained inputs', () => {
  const rgba = image(9, 3), lamps = [lamp()], lighting = { ...options, cell: 3, smooth: true }, materials = new Uint8Array(81);
  const before = { rgba: rgba.slice(), lamps: structuredClone(lamps), lighting: structuredClone(lighting), materials: materials.slice() };
  const result = run({ rgba, width: 9, height: 3, lamps, lighting, materials });
  expect(result.color).toBeInstanceOf(Uint8ClampedArray); expect(Array.from(result.light).every(Number.isFinite)).toBe(true);
  expect({ rgba, lamps, lighting, materials }).toEqual(before);
});

test('rejects excess work and malformed planes before reading pixel data', () => {
  expect(() => applySurfaceLighting({ width: 1024, height: 1024, lamps: Array.from({ length: 64 }, (_, i) => lamp({ name: `l${i}` })), lighting: options, get rgba() { throw new Error('buffer read'); } })).toThrow(/work/i);
  expect(() => run({ normals: new Float32Array(27).fill(NaN) })).toThrow(/normal/i);
  expect(() => run({ materials: new Uint8Array(2) })).toThrow(/material/i);
  expect(() => run({ lighting: { ...options, sky: NaN } })).toThrow();
});
