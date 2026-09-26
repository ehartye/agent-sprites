import { test, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { tracePixels, traceImageFile } from '../../server/engine/image-trace.js';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';
import { Project } from '../../server/engine/project.js';

vi.mock('node:fs', async importOriginal => {
  const original = await importOriginal();
  return { ...original, writeFileSync: vi.fn(original.writeFileSync) };
});

const dirs = [];
function temp() { const dir = mkdtempSync(join(tmpdir(), 'sprite-trace-')); dirs.push(dir); return dir; }
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const red = [255, 0, 0, 255], blue = [0, 0, 255, 255], clear = [90, 40, 20, 0];

test('merges matching runs vertically without filling transparent gaps; editable round trip preserves pixels', () => {
  const data = Buffer.from([red, red, clear, blue, red, red, clear, blue].flat());
  const { project, operations, shapeCount } = tracePixels(data, 4, 2, { name: 'baseline' });
  expect(shapeCount).toBe(2);
  const reloaded = Project.fromJSON(project.toJSON());
  const shapes = reloaded.cells.getCell('0,0').shapes.listByZ();
  expect(shapes.map(s => s.params)).toEqual([
    { x: 0, y: 0, w: 2, h: 2, filled: true },
    { x: 3, y: 0, w: 1, h: 2, filled: true },
  ]);
  expect(new Set(shapes.map(s => s.name)).size).toBe(2);
  const expected = Buffer.from(data); expected.fill(0, 8, 12); expected.fill(0, 24, 28);
  expect(Buffer.from(new CanvasRenderer(reloaded.palette).renderCellRaw(reloaded.cells.getCell('0,0')))).toEqual(expected);
  expect(operations[0]).toMatchObject({ command: 'new', name: 'baseline', size: '4x2', rows: 1, cols: 1 });
  reloaded.cells.getCell('0,0').recolorShape(shapes[0].name, '#00ff00');
  expect(Array.from(new CanvasRenderer(reloaded.palette).renderCellRaw(reloaded.cells.getCell('0,0')).slice(0, 4))).toEqual([0, 255, 0, 255]);
});

test('only merges immediately adjacent identical runs and preserves alpha in shape colors', () => {
  const { project, shapeCount } = tracePixels(Buffer.from([red, clear, red, [1, 2, 3, 128]].flat()), 1, 4);
  expect(shapeCount).toBe(3);
  expect(project.cells.getCell('0,0').shapes.listByZ().at(-1).color).toBe('#01020380');
});

test('rejects invalid dimensions, buffers, names and excessive shape counts', () => {
  expect(() => tracePixels(Buffer.alloc(4), 0, 1)).toThrow(/dimensions/i);
  expect(() => tracePixels(Buffer.alloc(4), 2, 1)).toThrow(/RGBA/i);
  expect(() => tracePixels(Buffer.alloc(4), 1, 1, { name: '../escape' })).toThrow(/name/i);
  expect(() => tracePixels(Buffer.from([...red, ...blue]), 2, 1, { maxShapes: 1 })).toThrow(/shape limit/i);
  expect(() => tracePixels(Buffer.alloc(0), 8193, 1)).toThrow(/dimensions/i);
});

test.each(['png', 'webp'])('local %s trace produces a pixel-exact portable project, PNG and replayable operations', async format => {
  const dir = temp(), input = join(dir, `input.${format}`), output = join(dir, 'output');
  const rgba = Buffer.from([red, blue, red, blue].flat());
  await sharp(rgba, { raw: { width: 2, height: 2, channels: 4 } }).toFormat(format, { lossless: true }).toFile(input);
  const report = await traceImageFile(input, { output, name: 'baseline' });
  expect(report).toMatchObject({ ok: true, width: 2, height: 2, shapeCount: 2, differingPixels: 0 });
  const project = Project.load(report.artifacts.project);
  const rendered = new CanvasRenderer(project.palette).renderCell(project.cells.getCell('0,0'));
  expect(await sharp(rendered).ensureAlpha().raw().toBuffer()).toEqual(rgba);
  expect(await sharp(readFileSync(report.artifacts.sheet)).ensureAlpha().raw().toBuffer()).toEqual(rgba);
  expect(JSON.parse(readFileSync(report.artifacts.operations)).filter(op => op.command === 'draw')).toHaveLength(2);
  expect(readFileSync(report.artifacts.preview, 'utf8')).toContain('data:image/png;base64,');
  await expect(traceImageFile(input, { output })).rejects.toThrow(/exist/i);
  expect(readFileSync(report.artifacts.sheet)).toEqual(rendered);
});

test('does not publish when the renderer cannot preserve semitransparent RGB', async () => {
  const dir = temp(), input = join(dir, 'alpha.png'), output = join(dir, 'output');
  await sharp(Buffer.from([1, 2, 3, 1]), { raw: { width: 1, height: 1, channels: 4 } }).png().toFile(input);
  await expect(traceImageFile(input, { output })).rejects.toThrow(/pixel.*differ/i);
  expect(existsSync(output)).toBe(false);
});

test('rejects animation instead of silently tracing the first frame', async () => {
  const dir = temp(), input = join(dir, 'animated.webp'), output = join(dir, 'output');
  await sharp(Buffer.from([...red, ...blue]), { raw: { width: 1, height: 2, channels: 4, pageHeight: 1 } }).webp({ lossless: true, delay: [100, 100] }).toFile(input);
  expect((await sharp(readFileSync(input)).metadata()).pages).toBe(2);
  await expect(traceImageFile(input, { output })).rejects.toThrow(/Animated/);
  expect(existsSync(output)).toBe(false);
});

test('rejects APNG even when the decoder reports only its first frame', async () => {
  const dir = temp(), input = join(dir, 'animated.png'), output = join(dir, 'output');
  // Two 2×2 opaque frames (red then blue), generated with Pillow; no external artwork.
  writeFileSync(input, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAAACAAAAAgAAAAAAAAAAAAEACgAA6FTcAAAAABVJREFUeJxj/M/A8J+BgYGBCUSAMAAfFwICAkezFAAAABpmY1RMAAAAAQAAAAIAAAACAAAAAAAAAAAAAQAKAABzJzbUAAAAGWZkQVQAAAACeJxjZGD4/5+BgYGBCUSAMAAdGQICRW6eVwAAAABJRU5ErkJggg==', 'base64'));
  await expect(traceImageFile(input, { output })).rejects.toThrow(/Animated/);
  expect(existsSync(output)).toBe(false);
});

test('transparent and exactly representable alpha pixels retain their rendered appearance', async () => {
  const dir = temp(), input = join(dir, 'alpha.png'), output = join(dir, 'output');
  await sharp(Buffer.from([255, 0, 0, 128, ...clear]), { raw: { width: 2, height: 1, channels: 4 } }).png().toFile(input);
  const report = await traceImageFile(input, { output });
  expect(report).toMatchObject({ differingPixels: 0, shapeCount: 1 });
  expect(await sharp(readFileSync(report.artifacts.sheet)).ensureAlpha().raw().toBuffer()).toEqual(Buffer.from([255, 0, 0, 128, 0, 0, 0, 0]));
});

test('rejects unsupported or corrupt inputs without creating output or changing source', async () => {
  const dir = temp(), input = join(dir, 'input.svg'), output = join(dir, 'output');
  const source = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>';
  writeFileSync(input, source);
  await expect(traceImageFile(input, { output })).rejects.toThrow(/PNG.*WebP/);
  expect(existsSync(output)).toBe(false);
  expect(readFileSync(input, 'utf8')).toBe(source);
  await expect(traceImageFile(input, { output: input })).rejects.toThrow(/exist/i);
});

test('failed publication cleans only its created output so a retry can succeed', async () => {
  const dir = temp(), input = join(dir, 'reference.png'), output = join(dir, 'output');
  await sharp(Buffer.from(red), { raw: { width: 1, height: 1, channels: 4 } }).png().toFile(input);
  const original = await vi.importActual('node:fs');
  let calls = 0;
  vi.mocked(writeFileSync).mockImplementation((path, contents, options) => {
    if (++calls === 4) {
      original.writeFileSync(path, 'partial', options);
      throw Object.assign(new Error('Disk full'), { code: 'ENOSPC' });
    }
    return original.writeFileSync(path, contents, options);
  });
  try {
    await expect(traceImageFile(input, { output })).rejects.toThrow(/Disk full/);
    expect(existsSync(output)).toBe(false);
    expect(existsSync(input)).toBe(true);
  } finally { vi.mocked(writeFileSync).mockImplementation(original.writeFileSync); }
  expect((await traceImageFile(input, { output })).ok).toBe(true);
});

test('publication cleanup preserves unrelated files added to its directory', async () => {
  const dir = temp(), input = join(dir, 'reference.png'), output = join(dir, 'output');
  await sharp(Buffer.from(red), { raw: { width: 1, height: 1, channels: 4 } }).png().toFile(input);
  const original = await vi.importActual('node:fs');
  const foreign = join(output, 'user-file.txt');
  vi.mocked(writeFileSync).mockImplementationOnce(() => {
    original.writeFileSync(foreign, 'keep');
    throw new Error('Disk full');
  });
  await expect(traceImageFile(input, { output })).rejects.toThrow(/incomplete trace cleanup/);
  expect(readFileSync(foreign, 'utf8')).toBe('keep');
  expect(existsSync(join(output, 'image-trace.project.json'))).toBe(false);
});
