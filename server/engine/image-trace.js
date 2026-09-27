import { openSync, closeSync, fstatSync, readFileSync, writeFileSync, mkdirSync, lstatSync, unlinkSync, rmdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { Project } from './project.js';
import { CanvasRenderer } from './canvas-renderer.js';
import { createPreview } from '../build/preview.js';

const MAX_PIXELS = 4_000_000;
const MAX_DIMENSION = 8192;
const MAX_SHAPES = 100_000;
const MAX_BYTES = 32 * 1024 * 1024;

function dimensions(width, height) {
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0 && n <= MAX_DIMENSION) || width * height > MAX_PIXELS) {
    throw new Error(`Image dimensions must be positive integers, at most ${MAX_DIMENSION} per side and ${MAX_PIXELS} pixels total.`);
  }
}

/** Lossless run tracing at supplied resolution; no palette/grid/anatomy inference. */
export function tracePixels(data, width, height, { name = 'image-trace', maxShapes = MAX_SHAPES } = {}) {
  dimensions(width, height);
  if (!(data instanceof Uint8Array) || data.length !== width * height * 4) throw new Error('Expected width × height × 4 RGBA bytes.');
  if (typeof name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name)) throw new Error('Trace name must be 1–64 letters, digits, underscores or hyphens, starting with a letter or digit.');
  if (!Number.isSafeInteger(maxShapes) || maxShapes < 1 || maxShapes > MAX_SHAPES) throw new Error(`Shape limit must be between 1 and ${MAX_SHAPES}.`);
  const rectangles = [];
  let previous = new Map();
  const rgba = (x, y) => {
    const i = (y * width + x) * 4;
    return `${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`;
  };
  for (let y = 0; y < height; y++) {
    const current = new Map();
    for (let x = 0; x < width;) {
      const i = (y * width + x) * 4;
      if (data[i + 3] === 0) { x++; continue; }
      const start = x, colorKey = rgba(x, y);
      while (++x < width && rgba(x, y) === colorKey) { /* maximal horizontal run */ }
      const w = x - start, key = `${start}:${w}:${colorKey}`;
      let rect = previous.get(key);
      if (rect) rect.h++;
      else {
        if (rectangles.length >= maxShapes) throw new Error(`Image exceeds the ${maxShapes} shape limit; use a smaller reference crop.`);
        const color = '#' + Array.from(data.subarray(i, i + (data[i + 3] === 255 ? 3 : 4)), n => n.toString(16).padStart(2, '0')).join('');
        rect = { x: start, y, w, h: 1, color };
        rectangles.push(rect);
      }
      current.set(key, rect);
    }
    previous = current;
  }
  const project = Project.create({ name, cellWidth: width, cellHeight: height, rows: 1, cols: 1 });
  const cell = project.cells.getCell('0,0');
  cell.name = 'reference';
  const operations = [
    { command: 'new', name, size: `${width}x${height}`, rows: 1, cols: 1 },
    { command: 'name', cell: '0,0', as: 'reference' },
  ];
  for (const [index, { color, ...geometry }] of rectangles.entries()) {
    const shapeName = `trace-${String(index + 1).padStart(6, '0')}`;
    const params = { ...geometry, filled: true };
    cell.draw('rect', params, color, shapeName);
    operations.push({ command: 'draw', type: 'rect', cell: '0,0', name: shapeName, ...params, color });
  }
  return { project, operations, shapeCount: rectangles.length };
}

function requireAbsent(path) {
  try { lstatSync(path); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error(`Trace output already exists: ${path}. Choose a new directory.`);
}

function rejectAnimatedPng(source) {
  // libvips reports APNG as a single ordinary PNG. Inspect chunk boundaries,
  // never a byte substring that might occur inside compressed image data.
  for (let offset = 8; offset < source.length;) {
    if (offset + 12 > source.length) throw new Error('Invalid PNG: truncated chunk.');
    const length = source.readUInt32BE(offset);
    const next = offset + 12 + length;
    if (next > source.length) throw new Error('Invalid PNG: truncated chunk data.');
    const type = source.toString('ascii', offset + 4, offset + 8);
    if (type === 'acTL') throw new Error('Animated PNG images are not supported; provide a static PNG or WebP.');
    if (type === 'IEND') return;
    offset = next;
  }
  throw new Error('Invalid PNG: missing end chunk.');
}

/** Offline import; verification precedes publication and never touches live sessions. */
export async function traceImageFile(input, { output, name = 'image-trace' } = {}) {
  if (typeof input !== 'string' || !input || typeof output !== 'string' || !output) throw new Error('Trace requires a local image path and an explicit output directory.');
  const destination = resolve(output);
  requireAbsent(destination);
  const fd = openSync(resolve(input), 'r');
  let source;
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error(`Trace input must be a regular file no larger than ${MAX_BYTES} bytes.`);
    source = readFileSync(fd);
    if (source.length > MAX_BYTES) throw new Error('Trace input grew beyond the byte limit.');
  } finally { closeSync(fd); }
  // Reject other formats before invoking their decoders (including SVG's renderer).
  const png = source.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = source.toString('ascii', 0, 4) === 'RIFF' && source.toString('ascii', 8, 12) === 'WEBP';
  if (!png && !webp) throw new Error('Trace supports only local static PNG and WebP images.');
  if (png) rejectAnimatedPng(source);
  const decoder = sharp(source, { limitInputPixels: MAX_PIXELS, failOn: 'warning' });
  const metadata = await decoder.metadata();
  if ((metadata.pages ?? 1) !== 1) throw new Error('Animated or multipage images are not supported; provide a static PNG or WebP.');
  dimensions(metadata.width, metadata.height);
  const { data, info } = await decoder.toColourspace('srgb').ensureAlpha().raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
  const { project, operations, shapeCount } = tracePixels(data, info.width, info.height, { name });
  const rendered = new CanvasRenderer(project.palette).renderCell(project.cells.getCell('0,0'));
  // Compare the actual encoded output, not an independently generated expectation.
  const actual = await sharp(rendered).ensureAlpha().raw().toBuffer();
  let differingPixels = 0, maxChannelDifference = 0;
  for (let i = 0; i < data.length; i += 4) {
    let differs = false;
    for (let channel = 0; channel < 4; channel++) {
      // Hidden RGB at alpha zero has no rendered representation.
      const expected = data[i + 3] === 0 && channel < 3 ? 0 : data[i + channel];
      const difference = Math.abs(expected - actual[i + channel]);
      maxChannelDifference = Math.max(maxChannelDifference, difference);
      differs ||= difference !== 0;
    }
    if (differs) differingPixels++;
  }
  if (differingPixels) throw new Error(`${differingPixels} rendered pixels differ from decoded source (maximum channel difference ${maxChannelDifference}); canvas alpha rounding can prevent an exact trace. No output published.`);
  const filenames = { project: `${name}.project.json`, sheet: `${name}.png`, atlas: `${name}.atlas.json`, operations: 'operations.json', verification: 'trace-verification.json', preview: 'preview.html' };
  const artifacts = Object.fromEntries(Object.entries(filenames).map(([key, file]) => [key, join(destination, file)]));
  const report = {
    ok: true, width: info.width, height: info.height, shapeCount, differingPixels, maxChannelDifference,
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    comparison: 'Decoded 8-bit sRGB RGBA at supplied dimensions; RGB at alpha zero ignored; no resizing, quantization or orientation transform.',
    artifacts,
  };
  const atlas = project.exportAseprite({ imageName: filenames.sheet });
  const json = value => JSON.stringify(value, null, 2) + '\n';
  const files = {
    project: json(project.toJSON()), sheet: rendered, atlas: json(atlas), operations: json(operations),
    verification: json({ ...report, artifacts: filenames }), preview: createPreview(atlas, rendered, name),
  };
  mkdirSync(dirname(destination), { recursive: true });
  // Exclusive directory creation also protects against concurrent traces.
  mkdirSync(destination);
  const created = [];
  try {
    for (const [key, contents] of Object.entries(files)) {
      const file = artifacts[key];
      const handle = openSync(file, 'wx');
      created.push(file);
      try { writeFileSync(handle, contents); }
      finally { closeSync(handle); }
    }
  } catch (error) {
    // Never recursively remove the destination: another process could have
    // added files. Only unlink files this call successfully opened exclusively.
    const cleanupErrors = [];
    for (const file of created.reverse()) {
      try { unlinkSync(file); } catch (cleanup) { if (cleanup.code !== 'ENOENT') cleanupErrors.push(cleanup.message); }
    }
    try { rmdirSync(destination); } catch (cleanup) { if (cleanup.code !== 'ENOENT') cleanupErrors.push(cleanup.message); }
    if (cleanupErrors.length) throw new Error(`${error.message}; incomplete trace cleanup at ${destination}: ${cleanupErrors.join('; ')}`, { cause: error });
    throw error;
  }
  return report;
}
