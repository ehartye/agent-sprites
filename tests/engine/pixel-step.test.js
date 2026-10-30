import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas } from 'canvas';
import { pixelStep, readImagePixels } from '../../server/engine/pixel-step.js';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sprite-step-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

// 12 x 12 native crop whose rows and columns hold runs of 1 and 2 pixels.
const PATTERN = 'ABBABA', COLORS = { A: '#ff004d', B: '#29adff' };
const source = (x, y) => COLORS[PATTERN[(x + y) % PATTERN.length]];
// Paints each source pixel as a block from floor(i * scale) to floor((i + 1) * scale), so 1.5 gives blocks of 1 and 2.
function png(scale, name = `scale-${scale}.png`) {
  const size = Math.floor(12 * scale), canvas = createCanvas(size, size), ctx = canvas.getContext('2d');
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    const [px, py] = [Math.floor(x * scale), Math.floor(y * scale)];
    ctx.fillStyle = source(x, y);
    ctx.fillRect(px, py, Math.floor((x + 1) * scale) - px, Math.floor((y + 1) * scale) - py);
  }
  const file = join(dir, name);
  writeFileSync(file, canvas.toBuffer('image/png'));
  return file;
}

test('a native-scale crop has a step of 1', async () => {
  const result = pixelStep(await readImagePixels(png(1)), { crop: [0, 0, 12, 12] });
  expect(result.k).toBe(1);
  expect(result.coverage).toBe(0.9);
  expect(result.runs.map(r => r.length)).toEqual([1, 2]);
});

test('the same crop scaled by 2 has a step of 2', async () => {
  const result = pixelStep(await readImagePixels(png(2)), { crop: [0, 0, 24, 24] });
  expect(result.k).toBe(2);
  expect(result.runs.map(r => r.length)).toEqual([2, 4]);
});

test('the same crop scaled by 1.5 has a step of 1 with run lengths 1, 2 and 3', async () => {
  const result = pixelStep(await readImagePixels(png(1.5)), { crop: [0, 0, 18, 18] });
  expect(result.k).toBe(1);
  expect(result.runs.map(r => r.length)).toEqual([1, 2, 3]);
});

test('transparent pixels break runs and are not counted', () => {
  const data = new Uint8ClampedArray(4 * 4);
  [0, 1, 3].forEach(x => data.set([255, 0, 0, 255], x * 4));
  const { runs } = pixelStep({ data, width: 4, height: 1 });
  expect(runs).toEqual([{ length: 1, count: 4 }, { length: 2, count: 1 }]); // row runs 2 and 1, plus three single-pixel columns
});

test('crop and coverage are honoured and a crop outside the image is an error', async () => {
  const pixels = await readImagePixels(png(2));
  expect(pixelStep(pixels, { crop: [0, 0, 2, 2] }).k).toBe(2);
  expect(() => pixelStep(pixels, { crop: [0, 0, 25, 24] })).toThrow(/outside the 24 x 24 image/);
  expect(() => pixelStep(pixels, { crop: [-1, 0, 4, 4] })).toThrow(/outside/);
  expect(() => pixelStep(pixels, { crop: [4, 4, 4, 8] })).toThrow(/outside/);
  expect(() => pixelStep(pixels, { crop: [0, 0, 4] })).toThrow(/four whole numbers/);
  expect(() => pixelStep(pixels, { coverage: 0 })).toThrow(/coverage/);
});

test('a fully transparent image has no runs and a step of 1', () => {
  expect(pixelStep({ data: new Uint8ClampedArray(16), width: 2, height: 2 })).toEqual({ k: 1, runs: [], coverage: 0.9 });
});
