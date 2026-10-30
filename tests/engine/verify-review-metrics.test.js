import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas } from 'canvas';
import { Project } from '../../server/engine/project.js';
import { verifyAtlasFile } from '../../server/engine/atlas-verifier.js';
import { contrastRatio, grayLevel, parseHex } from '../../server/engine/verify-review.js';

// Report of the 0.96.2 verifier (commit 5d21af5) for the atlas pin() generates, paths normalised.
const REPORT_0_96_2 = "{\"ok\":true,\"frameCount\":8,\"dimensions\":{\"width\":24,\"height\":8},\"tags\":[\"walk\",\"still\"],\"errors\":[],\"warnings\":[{\"code\":\"empty-frame\",\"path\":\"frames[2]\",\"message\":\"Frame 2 is fully transparent; confirm this is intentional.\"},{\"code\":\"empty-frame\",\"path\":\"frames[6]\",\"message\":\"Frame 6 is fully transparent; confirm this is intentional.\"}],\"artifacts\":{\"atlas\":\"<atlas>\",\"image\":\"<image>\"}}";

let dir, file, canvas, ctx;
const save = () => writeFileSync(join(dir, 'pin.png'), canvas.toBuffer('image/png'));
const fill = (color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
// three 8x8 cells; 'walk' = frames 3..5 (cell 0, cell 1, cell 0 again), 'still' = frame 6 (cell 2)
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sprite-review-'));
  file = join(dir, 'pin.atlas.json');
  const project = Project.create({ name: 'pin', cellSize: 8, rows: 1, cols: 3, palette: 'pico8' });
  project.cells.getCell('0,0').name = 'idle';
  writeFileSync(file, JSON.stringify(project.exportAseprite({ imageName: 'pin.png', groups: { walk: ['0,0', '0,1', '0,0'], still: ['0,2'] }, fpsMap: { walk: 4 } })));
  canvas = createCanvas(24, 8); ctx = canvas.getContext('2d');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const pin = () => { fill('#ff004d', 1, 1, 5, 5); fill('#29adff', 3, 3, 2, 2); fill('#29adff', 9, 1, 4, 4); fill('#ffec27', 10, 2, 2, 2); save(); };
const normal = (r) => ({ ...r, artifacts: { atlas: '<atlas>', image: '<image>' } });

test('without review the report equals the stored 0.96.2 report', async () => {
  pin();
  const r = await verifyAtlasFile(file);
  expect(r.review).toBeUndefined();
  expect(normal(r)).toEqual(JSON.parse(REPORT_0_96_2));
});

test('review adds no error or warning and leaves ok unchanged', async () => {
  pin();
  const plain = await verifyAtlasFile(file);
  const r = await verifyAtlasFile(file, { review: true, pairs: [['#000000', '#ffffff']], minContrast: 4.5 });
  expect(r.review).toBeDefined();
  const { review, ...rest } = r;
  expect(rest).toEqual(plain);
  expect(r.ok).toBe(true);
});

test('review reports colour counts per distinct frame rectangle and per tag', async () => {
  pin();
  const { review } = await verifyAtlasFile(file, { review: true });
  // cell 0 has red + blue, cell 1 has blue + yellow, cell 2 is empty; aliases reuse rectangles and are reported once
  expect(review.frames.map((f) => [f.rect.x, f.colors])).toEqual([[0, 2], [8, 2], [16, 0]]);
  const walk = review.tags.find((t) => t.name === 'walk'), still = review.tags.find((t) => t.name === 'still');
  expect(walk).toMatchObject({ from: 3, to: 5, rects: 2, colors: 3 }); // union is 3, not 2 or 4
  expect(still).toMatchObject({ rects: 1, colors: 0, ladder: { levels: 0, lowest: null, highest: null, spread: 0 } });
  expect(review.atlas.colors).toBe(3);
  expect(review.pairs).toBeUndefined();
  expect(review.minContrast).toBeUndefined();
});

test.each([
  [['#000000', '#ffffff'], 2],
  [['#000000', '#404040', '#808080', '#c0c0c0', '#ffffff'], 5],
])('value ladder counts distinct gray levels: %j', async (grays, levels) => {
  grays.forEach((g, i) => fill(g, i, 0, 1, 1));
  fill(grays[0], 6, 0, 1, 1); // a repeated colour does not add a level
  save();
  const { review } = await verifyAtlasFile(file, { review: true });
  expect(review.frames[0].colors).toBe(levels);
  expect(review.frames[0].ladder).toEqual({ levels, lowest: 0, highest: 255, spread: 255 });
});

test('different colours with the same gray level share a rung; luma is Rec. 709 of gamma-encoded RGB', async () => {
  expect(grayLevel(parseHex('#ffffff'))).toBe(255);
  expect(grayLevel(parseHex('#ff0000'))).toBe(54);
  expect(grayLevel(parseHex('#00ff00'))).toBe(182);
  expect(grayLevel(parseHex('#0000ff'))).toBe(18);
  fill('#808080', 0, 0, 1, 1); fill('#808081', 1, 0, 1, 1); // both gray 128
  save();
  const { review } = await verifyAtlasFile(file, { review: true });
  expect(review.frames[0]).toMatchObject({ colors: 2, ladder: { levels: 1, lowest: 128, highest: 128, spread: 0 } });
});

test('tag figures are the union of its rectangles, not an average of frames', async () => {
  fill('#000000', 0, 0, 2, 2); fill('#ffffff', 8, 0, 2, 2); save(); // cell 0 is black only, cell 1 is white only
  const { review } = await verifyAtlasFile(file, { review: true });
  expect(review.frames.slice(0, 2).map((f) => f.ladder)).toEqual([
    { levels: 1, lowest: 0, highest: 0, spread: 0 }, { levels: 1, lowest: 255, highest: 255, spread: 0 },
  ]);
  expect(review.tags.find((t) => t.name === 'walk')).toMatchObject({ colors: 2, ladder: { levels: 2, lowest: 0, highest: 255, spread: 255 } });
});

test('contrast ratio is the WCAG ratio rounded to two decimals; black on white is exactly 21', async () => {
  fill('#000000', 0, 0, 2, 2); fill('#ffffff', 2, 0, 2, 2); save();
  const { review } = await verifyAtlasFile(file, { review: true, pairs: [['#000000', '#ffffff'], ['#ffffff', '#000'], ['#777', '#FFFFFF']] });
  expect(review.pairs[0]).toEqual({ foreground: '#000000', background: '#ffffff', ratio: 21, present: true });
  expect(review.pairs[1]).toMatchObject({ foreground: '#ffffff', background: '#000000', ratio: 21 });
  expect(review.pairs[2]).toMatchObject({ foreground: '#777777', ratio: 4.48, present: false }); // the well-known 4.48 for #777 on white
  expect(contrastRatio(0, 0xffffff)).toBeCloseTo(21, 10);
});

test('a pair with a colour absent from the atlas is listed with present false', async () => {
  fill('#000000', 0, 0, 2, 2); save();
  const { review } = await verifyAtlasFile(file, { review: true, pairs: [['#000000', '#ffffff'], ['#112233', '#000000']] });
  expect(review.pairs.map((p) => p.present)).toEqual([false, false]);
  expect(review.pairs).toHaveLength(2);
});

test('minContrast marks pairs below it with belowMin and only then', async () => {
  fill('#000000', 0, 0, 1, 1); fill('#ffffff', 1, 0, 1, 1); fill('#777777', 2, 0, 1, 1); fill('#888888', 3, 0, 1, 1); save();
  const r = await verifyAtlasFile(file, { review: true, minContrast: 4.5, pairs: [['#777777', '#888888'], ['#000000', '#ffffff']] });
  expect(r.review.minContrast).toBe(4.5);
  expect(r.review.pairs.map((p) => p.belowMin)).toEqual([true, false]);
  expect(r.ok).toBe(true);
  const none = await verifyAtlasFile(file, { review: true, pairs: [['#777777', '#888888']] });
  expect(none.review.pairs[0]).not.toHaveProperty('belowMin');
});

test('belowMin compares the unrounded ratio', async () => {
  fill('#777777', 0, 0, 1, 1); fill('#ffffff', 1, 0, 1, 1); save();
  const exact = contrastRatio(0x777777, 0xffffff); // 4.4781..., shown as 4.48
  const lo = await verifyAtlasFile(file, { review: true, minContrast: 4.4780, pairs: [['#777777', '#ffffff']] });
  expect(lo.review.pairs[0]).toMatchObject({ ratio: 4.48, present: true, belowMin: false });
  const hi = await verifyAtlasFile(file, { review: true, minContrast: 4.48, pairs: [['#777777', '#ffffff']] });
  expect(exact).toBeLessThan(4.48);
  expect(hi.review.pairs[0].belowMin).toBe(true);
});

test.each([
  ['pairs', { pairs: 'black:white' }],
  ['pairs', { pairs: [['#000000']] }],
  ['pairs', { pairs: [['#000000', 'white']] }],
  ['pairs', { pairs: [['#00000g', '#ffffff']] }],
  ['min-contrast', { minContrast: 0 }],
  ['min-contrast', { minContrast: -1 }],
  ['min-contrast', { minContrast: '4.5' }],
])('an invalid review option is an error naming %s', async (code, options) => {
  pin();
  const r = await verifyAtlasFile(file, { review: true, ...options });
  expect(r.ok).toBe(false);
  expect(r.errors).toHaveLength(1);
  expect(r.errors[0].code).toBe(code);
  expect(r.errors[0].message).toContain(code);
  expect(r.review).toBeUndefined();
});
