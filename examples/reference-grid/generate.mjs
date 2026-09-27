import sharp from 'sharp';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SKIN_TONES, referenceSkinRole } from '../../server/engine/skin-tones.js';

// Reconstruct a known enlarged pixel grid. Sampling the most frequent color in
// each source block suppresses resampling fringes without shrinking drawn shapes.
export async function generateReferenceGrid(config, base = process.cwd()) {
  const { source, name, grid, head } = config;
  const tone = config.skinTone == null ? null : SKIN_TONES.find(tone => tone.id === config.skinTone);
  if (config.skinTone != null && !tone) throw new Error(`Unknown skin tone: ${config.skinTone}`);
  const isHex = value => typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value);
  if (typeof source !== 'string' || !source || typeof name !== 'string' || !name.trim()) throw new Error('source and name are required.');
  if (!isHex(config.background) || (config.outline !== undefined && !isHex(config.outline))) throw new Error('background and outline must be six-digit hex colors.');
  if (!grid || !Number.isFinite(grid.x) || !Number.isFinite(grid.y) || !Number.isFinite(grid.step) || grid.step < 1 || grid.step > 128 || !Number.isInteger(grid.offsetY ?? 0) || Math.abs(grid.offsetY ?? 0) > 16) throw new Error('grid needs finite x/y, step between 1 and 128, and integer offsetY between -16 and 16.');
  if (!Array.isArray(head?.top) || head.top.length !== 4 || head.top.some(y => !Number.isInteger(y) || y + (grid.offsetY ?? 0) < 0 || y + (grid.offsetY ?? 0) > 22)) throw new Error('head.top needs four integer positions whose shifted ten-row bands fit the cell.');
  const sourcePath = resolve(base, source);
  if (statSync(sourcePath).size > 32 * 1024 * 1024) throw new Error('Reference exceeds 32 MiB.');
  const bytes = readFileSync(sourcePath);
  const input = sharp(bytes, { limitInputPixels: 16000000 });
  const metadata = await input.metadata();
  if (!['png', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) > 1) throw new Error('Use a static PNG or WebP reference.');
  // libvips can report APNG as one page; inspect actual PNG chunk boundaries.
  if (metadata.format === 'png') for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length) throw new Error('Truncated PNG chunk.');
    const next = offset + 12 + bytes.readUInt32BE(offset);
    if (next > bytes.length) throw new Error('Truncated PNG chunk data.');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'acTL') throw new Error('Animated PNG is unsupported; use a static reference.');
    if (type === 'IEND') break;
    offset = next;
  }
  if (Math.abs(grid.x) > metadata.width || Math.abs(grid.y) > metadata.height) throw new Error('Grid origin is outside the supported image bounds.');
  const { data, info } = await input.toColourspace('srgb').ensureAlpha().raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
  for (let p = 3; p < data.length; p += 4) if (data[p] !== 255) throw new Error('This example requires an opaque reference with a flat background.');
  const W = 16, H = 32;
  const background = config.background;
  const outline = config.outline ?? '#673649';
  const rgba = hex => hex.match(/[a-f\d]{2}/gi).map(v => parseInt(v, 16));
  const bg = rgba(background);
  const operations = [{ command: 'new', name, size: `${W}x${H}`, rows: 2, cols: 4 }];
  const frames = [];
  function sample(gx, gy) {
    const counts = new Map();
    const x0 = Math.round(grid.x + gx * grid.step), x1 = Math.round(grid.x + (gx + 1) * grid.step);
    const y0 = Math.round(grid.y + gy * grid.step), y1 = Math.round(grid.y + (gy + 1) * grid.step);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (x < 0 || x >= info.width || y < 0 || y >= info.height) continue;
      const p = (y * info.width + x) * 4;
      const color = '#' + Array.from(data.subarray(p, p + 3), n => n.toString(16).padStart(2, '0')).join('');
      counts.set(color, (counts.get(color) ?? 0) + 1);
    }
    const color = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? background;
    return color;
  }
  for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
    const cell = `${row},${col}`, frameName = `${row === 0 ? 'front' : 'right'}-${col + 1}`;
    operations.push({ command: 'name', cell, as: frameName });
    const pixels = Array.from({ length: H }, () => Array(W).fill(null));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const sy = y - (grid.offsetY ?? 0);
      if (sy >= 0 && sy < H) pixels[y][x] = sample(col * W + x, row * H + sy);
    }
    // Only remove background-like colors connected to the cell exterior.
    // Pale skin may be close to the background but enclosed by the outline.
    const queue = [];
    const seen = new Set();
    for (let x = 0; x < W; x++) queue.push([x, 0], [x, H - 1]);
    for (let y = 0; y < H; y++) queue.push([0, y], [W - 1, y]);
    while (queue.length) {
      const [x, y] = queue.pop(), key = `${x},${y}`;
      if (x < 0 || x >= W || y < 0 || y >= H || seen.has(key)) continue;
      seen.add(key);
      const color = pixels[y][x];
      if (color && rgba(color).reduce((sum, c, i) => sum + (c - bg[i]) ** 2, 0) >= 40 ** 2) continue;
      pixels[y][x] = null;
      queue.push([x-1,y], [x+1,y], [x,y-1], [x,y+1]);
    }
    const top = head.top[col] + (grid.offsetY ?? 0);
    const occupied = [];
    for (let y = top; y < top + 10; y++) for (let x = 0; x < W; x++) if (pixels[y][x]) occupied.push(x);
    const width = Math.max(...occupied) - Math.min(...occupied) + 1;
    if (width !== 10) throw new Error(`${frameName}: measured head width ${width}; adjust grid calibration to reach 10.`);
    // Preserve the silhouette, repairing its contour in place (no dilation).
    const edge = (x, y) => [[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dy]) => !pixels[y + dy]?.[x + dx]);
    const edges = pixels.map((line, y) => line.map((color, x) => !!color && edge(x, y)));
    const parts = { head: [], body: [] };
    const skin = { highlight: [], base: [], shadow: [], outline: [] };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!pixels[y][x]) continue;
      const part = y >= top && y < top + 10 ? 'head' : 'body';
      const shapeName = `${part}-${x}-${y}`;
      parts[part].push(shapeName);
      const role = tone ? (edges[y][x] ? 'outline' : referenceSkinRole(pixels[y][x])) : null;
      if (role) skin[role].push(shapeName);
      operations.push({ command: 'draw', type: 'point', cell, name: shapeName, x, y, color: role ? tone.colors[role] : edges[y][x] ? outline : pixels[y][x] });
    }
    for (const [part, shapes] of Object.entries(parts)) operations.push({ command: 'shape-group', sub: 'create', cell, name: part, shapes });
    if (tone) for (const [role, shapes] of Object.entries(skin)) if (shapes.length) operations.push({ command: 'shape-group', sub: 'create', cell, name: `skin-${role}`, shapes });
    frames.push({ name: frameName, headWidth: width, headTop: top });
  }
  return { operations, report: { cellWidth: W, cellHeight: H, frames, method: 'Calibrated modal block sampling, transparent background, contour repair; not an exact full-resolution trace.' } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: node generate.mjs reference.json [operations.json]');
  const path = resolve(process.argv[2]);
  const result = await generateReferenceGrid(JSON.parse(readFileSync(path, 'utf8')), dirname(path));
  if (process.argv[3]) writeFileSync(resolve(process.argv[3]), JSON.stringify(result.operations, null, 2), { flag: 'wx' });
  else process.stdout.write(JSON.stringify(result.operations));
  process.stderr.write(JSON.stringify(result.report) + '\n');
}
