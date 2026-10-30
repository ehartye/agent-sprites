import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createCanvas } from 'canvas';
import { Project } from '../../server/engine/project.js';

const execFileAsync = promisify(execFile);
// SPRITE_PORT=1 guarantees that no sprite server is contacted: these commands are offline.
const cli = (...args) => execFileAsync('node', ['scripts/sprite.js', ...args], { env: { ...process.env, SPRITE_PORT: '1' } });
const failure = async (...args) => { try { await cli(...args); } catch (error) { return error; } throw new Error(`expected "${args.join(' ')}" to fail`); };

let dir, file, canvas, ctx;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sprite-verify-cli-'));
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
const addLonePixel = () => { ctx.fillStyle = '#ff0000'; ctx.fillRect(7, 6, 1, 1); save(); };

test('hygiene flags map onto the checks', async () => {
  addLonePixel();
  await expect(cli('verify', file, '--orphan-pixels', '--json')).rejects.toMatchObject({ code: 1 });
  const { stdout } = await cli('verify', file, '--orphan-pixels', '--allow-colors', '#ff0000', '--max-colors', '3', '--json');
  expect(JSON.parse(stdout)).toMatchObject({ ok: true, pixelHygiene: { maxColors: 3, allowColors: ['#ff0000'] } });
}, 30000);

test('a lone pixel fails with orphan-pixels only when the flag is given', async () => {
  addLonePixel();
  const failed = await failure('verify', file, '--orphan-pixels');
  expect(failed.code).toBe(1);
  expect(failed.stdout).toContain('orphan-pixels');
  expect(failed.stdout).toContain('FAIL');
  const passed = await cli('verify', file);
  expect(passed.stdout).toContain('PASS');
  expect(passed.stdout).not.toContain('orphan-pixels');
}, 30000);

test('without review or hygiene options the text output is the plain structural line', async () => {
  save();
  const { stdout } = await cli('verify', file);
  expect(stdout.split('\n')[0].trim()).toBe('PASS: 4 atlas frames (structural checks only)');
  expect(stdout).not.toContain('Review');
}, 30000);

test('--review --json prints a review object, exits 0 and adds no error', async () => {
  addLonePixel();
  const plain = JSON.parse((await cli('verify', file, '--json')).stdout);
  const { stdout } = await cli('verify', file, '--review', '--json');
  const report = JSON.parse(stdout);
  expect(report.review).toMatchObject({ atlas: { colors: 3 }, tags: [{ name: 'idle' }] });
  expect(report.ok).toBe(true);
  expect(report.errors).toEqual(plain.errors);
  expect(report.warnings).toEqual(plain.warnings);
  const { review, ...rest } = report;
  expect(rest).toEqual(plain);
}, 30000);

test('--review prints the numbers in text and declared pairs with their ratio', async () => {
  save();
  const { stdout } = await cli('verify', file, '--review', '--pairs', '#000000:#ffffff,#39283f:#123456', '--min-contrast', '4.5');
  expect(stdout).toContain('Review (advisory');
  expect(stdout).toContain('atlas: 2 colors');
  expect(stdout).toContain('tag idle');
  expect(stdout).toMatch(/pair #000000:#ffffff: contrast 21:1, present false, belowMin false/);
  expect(stdout).toMatch(/pair #39283f:#123456: contrast [\d.]+:1, present false, belowMin true/);
  const withoutReview = await cli('verify', file, '--pairs', '#000000:#ffffff');
  expect(withoutReview.stdout).not.toContain('Review');
}, 30000);

test('--pairs-file is read by the CLI and the engine receives the pairs', async () => {
  save();
  const pairsFile = join(dir, 'pairs.json');
  writeFileSync(pairsFile, JSON.stringify([['#39283f', '#efac83']]));
  const { stdout } = await cli('verify', file, '--review', '--pairs-file', pairsFile, '--json');
  expect(JSON.parse(stdout).review.pairs).toEqual([expect.objectContaining({ foreground: '#39283f', background: '#efac83', present: true })]);
  writeFileSync(pairsFile, '{not json');
  const bad = await failure('verify', file, '--review', '--pairs-file', pairsFile);
  expect(bad.code).toBe(1);
  expect(bad.stderr).toContain('--pairs-file');
}, 30000);

test('--pairs together with --pairs-file exits non-zero and names both options', async () => {
  save();
  const pairsFile = join(dir, 'pairs.json');
  writeFileSync(pairsFile, '[]');
  const error = await failure('verify', file, '--review', '--pairs', '#000:#fff', '--pairs-file', pairsFile);
  expect(error.code).toBe(1);
  expect(error.stderr).toContain('--pairs');
  expect(error.stderr).toContain('--pairs-file');
  expect(error.stdout).toBe('');
}, 30000);

test.each([
  ['--max-colors', 'many'],
  ['--min-color-pixels', 'x'],
  ['--min-contrast', 'high'],
])('%s with a non-numeric value exits non-zero and names the option', async (option, value) => {
  save();
  const error = await failure('verify', file, option, value);
  expect(error.code).toBe(1);
  expect(error.stderr).toContain(option);
}, 30000);

test('values the engine rejects exit 1 and name the option in the report', async () => {
  save();
  const { code, stdout } = await failure('verify', file, '--max-colors', '0', '--json');
  expect(code).toBe(1);
  expect(JSON.parse(stdout).errors[0].code).toBe('max-colors');
  const pairs = await failure('verify', file, '--review', '--pairs', 'red:blue', '--json');
  expect(JSON.parse(pairs.stdout).errors[0].code).toBe('pairs');
  const malformed = await failure('verify', file, '--review', '--pairs', '#000000', '--json');
  expect(malformed.stderr).toContain('--pairs');
}, 30000);

test('pixel-step prints the step and the runs for a generated PNG', async () => {
  const sprite = createCanvas(8, 8), c = sprite.getContext('2d');
  c.fillStyle = '#ff0000'; c.fillRect(0, 0, 8, 4);
  c.fillStyle = '#0000ff'; c.fillRect(0, 4, 8, 4);
  const png = join(dir, 'scaled.png');
  writeFileSync(png, sprite.toBuffer('image/png'));
  const text = await cli('pixel-step', png);
  expect(text.stdout).toContain('Pixel step: 4');
  expect(text.stdout).toMatch(/Runs \(length x count\): 4 x \d+, 8 x \d+/);
  const json = JSON.parse((await cli('pixel-step', png, '--json')).stdout);
  expect(json).toMatchObject({ k: 4, coverage: 0.9 });
  expect(json.runs).toEqual(expect.arrayContaining([expect.objectContaining({ length: 4 }), expect.objectContaining({ length: 8 })]));
  const cropped = JSON.parse((await cli('pixel-step', png, '--crop', '0,0,8,4', '--json')).stdout);
  expect(cropped.k).toBe(4);
}, 30000);

test('pixel-step on a missing file, a bad crop or a bad coverage exits non-zero with a message', async () => {
  const missing = await failure('pixel-step', join(dir, 'missing.png'));
  expect(missing.code).toBe(1);
  expect(missing.stderr).toContain('missing.png');
  save();
  const png = join(dir, 'actor.png');
  expect((await failure('pixel-step', png, '--crop', '0,0,99,99')).stderr).toContain('crop');
  expect((await failure('pixel-step', png, '--crop', 'a,b')).stderr).toContain('--crop');
  expect((await failure('pixel-step', png, '--coverage', 'lots')).stderr).toContain('--coverage');
  expect((await failure('pixel-step', png, '--coverage', '2')).stderr).toContain('coverage');
}, 30000);

test('--help lists pixel-step and the new verify options', async () => {
  const { stdout } = await cli('--help');
  for (const text of ['pixel-step', '--orphan-pixels', '--max-colors', '--min-color-pixels', '--allow-colors', '--review', '--pairs-file', '--min-contrast']) expect(stdout).toContain(text);
}, 30000);
