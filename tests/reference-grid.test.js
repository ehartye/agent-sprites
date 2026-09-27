import { test, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { generateReferenceGrid } from '../examples/reference-grid/generate.mjs';

const dirs = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
async function fixture(width = 10) {
  const dir = mkdtempSync(join(tmpdir(), 'reference-grid-')); dirs.push(dir);
  const data = Buffer.alloc(64 * 64 * 3, 240);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
    for (let y = 2; y < 12; y++) for (let x = 2; x < 2 + width; x++) {
      const edge = y === 2 || y === 11 || x === 2 || x === 1 + width;
      // Deliberately near-background skin enclosed in a dark contour.
      data.set(edge ? [70, 30, 50] : [239, 220, 220], ((row * 32 + y) * 64 + col * 16 + x) * 3);
    }
  }
  const source = join(dir, 'reference.png');
  await sharp(data, { raw: { width: 64, height: 64, channels: 3 } }).resize(256, 256, { kernel: 'nearest' }).png().toFile(source);
  return { source, name: 'test', background: '#f0f0f0', outline: '#461e32', grid: { x: 0, y: 0, step: 4 }, head: { top: [2,2,2,2] } };
}

test('reconstructs enlarged cells, keeps enclosed pale skin and ten-pixel heads, removes exterior background', async () => {
  const { operations, report } = await generateReferenceGrid(await fixture());
  expect(report.frames).toHaveLength(8);
  expect(report.frames.every(frame => frame.headWidth === 10)).toBe(true);
  const points = operations.filter(op => op.command === 'draw' && op.cell === '0,0');
  expect(points).toHaveLength(100);
  expect(points.find(p => p.x === 5 && p.y === 5).color).toBe('#efdcdc');
  expect(points.filter(p => p.x === 3 || p.x === 12 || p.y === 2 || p.y === 11).every(p => p.color === '#461e32')).toBe(true);
  expect(operations.filter(op => op.command === 'shape-group')).toHaveLength(16);
});

test('centers heads by translating the whole pose, preserving colors and editable groups', async () => {
  const config = await fixture();
  const original = await generateReferenceGrid({ ...config, centerHeads: false, skinTone: 'peach' });
  const centered = await generateReferenceGrid({ ...config, skinTone: 'peach' });
  for (const frame of centered.report.frames) expect(frame).toMatchObject({ headLeft: 3, headWidth: 10, shiftX: 1 });
  const oldPoints = original.operations.filter(op => op.command === 'draw');
  const newPoints = centered.operations.filter(op => op.command === 'draw');
  expect(newPoints.map(({ x, name, ...point }) => ({ ...point, x: x - 1 }))).toEqual(oldPoints.map(({ name, ...point }) => point));
  for (const op of centered.operations.filter(op => op.command === 'shape-group')) {
    expect(op.shapes.every(name => newPoints.some(point => point.cell === op.cell && point.name === name))).toBe(true);
  }
});

test('refuses centering that would clip a limb at the frame edge', async () => {
  const config = await fixture();
  const { data, info } = await sharp(config.source).raw().toBuffer({ resolveWithObject: true });
  for (let y = 80; y < 84; y++) for (let x = 60; x < 64; x++) data.set([70,30,50], (y * info.width + x) * 3);
  await sharp(data, { raw: info }).png().toFile(config.source);
  await expect(generateReferenceGrid(config)).rejects.toThrow('clip');
});

test('rejects wrong head calibration instead of silently scaling', async () => {
  await expect(generateReferenceGrid(await fixture(9))).rejects.toThrow('head width 9');
});

test('rejects unbounded sampling and invalid color configuration', async () => {
  const config = await fixture();
  await expect(generateReferenceGrid({ ...config, grid: { ...config.grid, step: Infinity } })).rejects.toThrow('grid');
  await expect(generateReferenceGrid({ ...config, background: 'pink' })).rejects.toThrow('hex');
});

test('rejects APNG before sampling even if the decoder reports one page', async () => {
  const config = await fixture();
  writeFileSync(config.source, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAAACAAAAAgAAAAAAAAAAAAEACgAA6FTcAAAAABVJREFUeJxj/M/A8J+BgYGBCUSAMAAfFwICAkezFAAAABpmY1RMAAAAAQAAAAIAAAACAAAAAAAAAAAAAQAKAABzJzbUAAAAGWZkQVQAAAACeJxjZGD4/5+BgYGBCUSAMAAdGQICRW6eVwAAAABJRU5ErkJggg==', 'base64'));
  await expect(generateReferenceGrid(config)).rejects.toThrow('Animated PNG');
});
