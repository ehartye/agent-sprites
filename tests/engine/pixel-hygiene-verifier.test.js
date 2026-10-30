import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas } from 'canvas';
import { Project } from '../../server/engine/project.js';
import { verifyAtlasFile, countOpaqueColors } from '../../server/engine/atlas-verifier.js';

let dir, file, canvas, ctx;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sprite-hygiene-'));
  file = join(dir, 'actor.atlas.json');
  const project = Project.create({ name: 'actor', cellSize: 8, rows: 1, cols: 2, palette: 'pico8' });
  project.cells.getCell('0,0').name = 'front';
  writeFileSync(file, JSON.stringify(project.exportAseprite({ imageName: 'actor.png', groups: { idle: ['0,0'] } })));
  canvas = createCanvas(16, 8); ctx = canvas.getContext('2d');
  ctx.fillStyle = '#39283f'; ctx.fillRect(1, 1, 5, 5);
  ctx.fillStyle = '#efac83'; ctx.fillRect(2, 2, 3, 3);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const save = () => writeFileSync(join(dir, 'actor.png'), canvas.toBuffer('image/png'));

test('pixel hygiene is opt-in: a clean two-color sprite passes with every check on', async () => {
  save();
  expect((await verifyAtlasFile(file)).ok).toBe(true);
  const r = await verifyAtlasFile(file, { orphanPixels: true, maxColors: 2, minColorPixels: 4 });
  expect(r.ok).toBe(true);
  expect(r.pixelHygiene).toMatchObject({ orphanPixels: true, maxColors: 2, minColorPixels: 4 });
});

test('orphan pixels are reported once per packed rectangle; diagonal contact is not an orphan', async () => {
  ctx.fillStyle = '#ff0000'; ctx.fillRect(7, 6, 1, 1); // lone pixel inside frame 0 (cell is 8x8)
  save();
  expect((await verifyAtlasFile(file)).ok).toBe(true);
  const r = await verifyAtlasFile(file, { orphanPixels: true });
  expect(r.ok).toBe(false);
  const o = r.errors.filter((e) => e.code === 'orphan-pixels');
  expect(o).toHaveLength(1);
  expect(o[0]).toMatchObject({ count: 1, pixels: [{ x: 7, y: 6 }] });
  // a second pixel touching the first diagonally makes both parts of one run
  ctx.fillRect(6, 5, 1, 1); save();
  expect((await verifyAtlasFile(file, { orphanPixels: true })).ok).toBe(true);
});

test('allowed colors may stay lone (eye highlights); the palette budget and rare colors fail', async () => {
  ctx.fillStyle = '#fffaf0'; ctx.fillRect(3, 3, 1, 1); save();
  const strict = await verifyAtlasFile(file, { orphanPixels: true });
  expect(strict.errors.some((e) => e.code === 'orphan-pixels')).toBe(true);
  expect((await verifyAtlasFile(file, { orphanPixels: true, allowColors: ['#FFFAF0'] })).ok).toBe(true);
  const over = await verifyAtlasFile(file, { maxColors: 2 });
  expect(over.errors.find((e) => e.code === 'palette-budget')).toMatchObject({ colors: 3, max: 2 });
  const rare = await verifyAtlasFile(file, { minColorPixels: 4 });
  expect(rare.errors.find((e) => e.code === 'rare-colors').rare).toEqual([{ color: '#fffaf0', pixels: 1 }]);
  expect((await verifyAtlasFile(file, { minColorPixels: 4, allowColors: ['#fffaf0'] })).ok).toBe(true);
});

test('translucent pixels are ignored and bad option values are rejected', async () => {
  ctx.fillStyle = 'rgba(255,0,0,0.5)'; ctx.fillRect(7, 6, 1, 1); save();
  expect((await verifyAtlasFile(file, { orphanPixels: true, maxColors: 2 })).ok).toBe(true);
  expect((await verifyAtlasFile(file, { maxColors: 0 })).errors[0].code).toBe('max-colors');
  expect((await verifyAtlasFile(file, { allowColors: ['red'] })).errors[0].code).toBe('allow-colors');
});

test('countOpaqueColors counts only fully opaque pixels, keyed by packed RGB', async () => {
  ctx.fillStyle = 'rgba(255,0,0,0.5)'; ctx.fillRect(7, 6, 1, 1);
  const c = countOpaqueColors(ctx.getImageData(0, 0, 8, 8).data);
  expect(c).toEqual(new Map([[0x39283f, 16], [0xefac83, 9]]));
});
