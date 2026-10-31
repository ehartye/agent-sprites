#!/usr/bin/env node
// Decoded-pixel check for a converted reference. Reads the PNG as 8-bit RGBA
// at its delivered size (no resize, no quantization), prints a JSON report and
// exits 1 when the stated contract is not met, 2 on bad usage.
// Usage: node check.mjs <converted.png> --grid WxH [--cell N] --max-colors N
//        --alpha opaque|binary|straight --dither none|ordered|diffusion
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const usage = 'Usage: check.mjs <converted.png> --grid WxH [--cell N] --max-colors N --alpha opaque|binary|straight --dither none|ordered|diffusion';
const usageError = message => { console.error(`${message}\n${usage}`); process.exit(2); };

const [file, ...rest] = process.argv.slice(2);
if (!file || file.startsWith('--')) usageError('Missing converted PNG path.');
const options = {};
for (let i = 0; i < rest.length; i += 2) {
  const key = rest[i];
  if (!['--grid', '--cell', '--max-colors', '--alpha', '--dither'].includes(key) || rest[i + 1] === undefined) usageError(`Unknown or incomplete option: ${key}`);
  options[key.slice(2)] = rest[i + 1];
}

// Sharp comes from the managed release; a checkout with installed dependencies works for development.
async function loadSharp() {
  try {
    const { resolveRuntime } = await import(pathToFileURL(join(pluginRoot, 'scripts', 'managed-runtime.js')).href);
    const runtime = resolveRuntime(pluginRoot);
    return createRequire(join(runtime.root, 'package.json'))('sharp');
  } catch (managed) {
    try { return createRequire(join(pluginRoot, 'package.json'))('sharp'); }
    catch { throw managed; }
  }
}

const problems = [];
const integer = text => /^[1-9][0-9]*$/.test(String(text));
const grid = /^([1-9][0-9]*)x([1-9][0-9]*)$/.exec(options.grid ?? '');
if (!grid) problems.push('grid is unstated or not WxH whole numbers (for example 32x32)');
const cell = options.cell ?? '1';
if (!integer(cell)) problems.push(`cell ${cell} is fractional or not a positive whole number of image pixels per grid pixel`);
if (!integer(options['max-colors'] ?? '')) problems.push('max-colors is unstated or not a positive whole number');
if (!['opaque', 'binary', 'straight'].includes(options.alpha)) problems.push('alpha policy is unstated (use opaque, binary or straight)');
if (!['none', 'ordered', 'diffusion'].includes(options.dither)) problems.push('dither policy is unstated (use none, ordered or diffusion)');

const sharp = await loadSharp();
const bytes = readFileSync(file);
const { data, info } = await sharp(bytes, { failOn: 'warning' }).toColourspace('srgb').ensureAlpha().raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
const { width, height } = info;

let visibleColours = new Set(), transparent = 0, semitransparent = 0, nonUniformCells = 0;
for (let i = 0; i < data.length; i += 4) {
  const a = data[i + 3];
  if (a === 0) { transparent++; continue; } // RGB under alpha 0 is invisible and not counted.
  if (a < 255) semitransparent++;
  visibleColours.add((data[i] << 24 | data[i + 1] << 16 | data[i + 2] << 8 | a) >>> 0);
}
const colours = visibleColours.size;

if (grid && integer(cell)) {
  const size = Number(cell), expectedW = Number(grid[1]) * size, expectedH = Number(grid[2]) * size;
  if (width !== expectedW || height !== expectedH) {
    problems.push(`image is ${width}x${height} but grid ${grid[1]}x${grid[2]} at ${size} px per cell needs ${expectedW}x${expectedH}` +
      (width % size || height % size ? ` (${width / size}x${height / size} cells is a fractional grid)` : ''));
  } else if (size > 1) {
    for (let cy = 0; cy < grid[2]; cy++) for (let cx = 0; cx < grid[1]; cx++) {
      const first = ((cy * size) * width + cx * size) * 4;
      scan: for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const at = (((cy * size + y) * width) + cx * size + x) * 4;
        for (let c = 0; c < 4; c++) if (data[at + c] !== data[first + c] && !(data[at + 3] === 0 && data[first + 3] === 0)) { nonUniformCells++; break scan; }
      }
    }
    if (nonUniformCells) problems.push(`${nonUniformCells} grid cells are not one flat colour; the image was resampled, not placed on the grid`);
  }
}
if (integer(options['max-colors'] ?? '') && colours > Number(options['max-colors'])) problems.push(`${colours} decoded colours exceed the budget of ${options['max-colors']}`);
if (options.alpha === 'opaque' && (transparent || semitransparent)) problems.push(`alpha policy opaque but ${transparent + semitransparent} pixels are not fully opaque`);
if (options.alpha === 'binary' && semitransparent) problems.push(`alpha policy binary but ${semitransparent} pixels are semitransparent`);

const report = {
  ok: problems.length === 0, file, sha256: createHash('sha256').update(bytes).digest('hex'),
  width, height, grid: options.grid ?? null, cell: Number(cell) || cell, decodedColours: colours,
  maxColours: Number(options['max-colors']) || null, alpha: options.alpha ?? null, dither: options.dither ?? null,
  transparentPixels: transparent, semitransparentPixels: semitransparent, problems,
};
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
