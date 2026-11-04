import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

export function readCensusPalette(path, extra = []) {
  const bytes = readFileSync(path);
  if (bytes.length > 1048576) throw new Error('Palette exceeds 1 MiB.');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  let colors;
  switch (extname(path).toLowerCase()) {
    case '.json': {
      const parsed = JSON.parse(text);
      colors = Array.isArray(parsed) ? parsed : parsed?.colors;
      if (!Array.isArray(colors)) throw new Error('Palette JSON must be an array or {colors: [...]} .');
      colors = colors.map(c => typeof c === 'string' ? c : c?.color);
      break;
    }
    case '.hex':
      colors = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(s => s.startsWith('#') ? s : `#${s}`);
      break;
    case '.gpl': {
      const lines = text.split(/\r?\n/);
      if (lines.shift()?.trim() !== 'GIMP Palette') throw new Error('GPL requires GIMP Palette header.');
      colors = lines.map(s => s.trim()).filter(s => s && !s.startsWith('#') && !/^(Name|Columns):/.test(s)).map(line => {
        const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)(?:\s+.*)?$/);
        if (!match || match.slice(1).some(v => Number(v) > 255)) throw new Error('Invalid GPL RGB row.');
        return '#' + match.slice(1).map(v => Number(v).toString(16).padStart(2, '0')).join('');
      });
      break;
    }
    default: throw new Error('Palette file must be .json, .hex or .gpl.');
  }
  if (!colors.length || colors.length > 4096 || !Array.isArray(extra) || extra.length > 4096
      || [...colors, ...extra].some(c => typeof c !== 'string' || !/^#[0-9a-f]{6}$/i.test(c)))
    throw new Error('Palette and extras require nonempty #RRGGBB colors (at most 4096 each).');
  return [...new Set([...colors, ...extra].map(c => c.toLowerCase()))].sort();
}

/** Coordinates are packed-frame-local. RGB membership includes all alpha > 0; alpha is not a palette channel. */
export function censusFrames(data, width, frames, colors, maskName) {
  const allowed = new Set(colors);
  const mask = maskName === undefined ? null : frames.find(f => f.filename === maskName);
  if (maskName !== undefined && !mask) throw new Error(`Mask frame not found: ${maskName}`);
  const sameRect = (a, b) => ['x', 'y', 'w', 'h'].every(k => a[k] === b[k]);
  const geometry = f => JSON.stringify([Boolean(f.rotated), f.sourceSize.w, f.sourceSize.h,
    f.spriteSourceSize.x, f.spriteSourceSize.y, f.spriteSourceSize.w, f.spriteSourceSize.h]);
  const offset = (r, x, y) => ((r.y + y) * width + r.x + x) * 4;
  let exclusions;
  if (mask) {
    exclusions = new Uint8Array(mask.frame.w * mask.frame.h);
    for (let y = 0; y < mask.frame.h; y++) for (let x = 0; x < mask.frame.w; x++) {
      const i = offset(mask.frame, x, y), [r, g, b, a] = data.subarray(i, i + 4);
      if (!a) continue;
      if (a !== 255 || !((r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255)))
        throw new Error('Mask must contain only transparent, opaque black (include) or opaque white (exclude) pixels.');
      exclusions[y * mask.frame.w + x] = r === 255 ? 1 : 0;
    }
  }
  const rows = [];
  for (const frame of frames) {
    if (mask && sameRect(frame.frame, mask.frame)) {
      if (geometry(frame) !== geometry(mask)) throw new Error(`Mask rectangle alias ${frame.filename} has inconsistent geometry.`);
      continue;
    }
    const rect = frame.frame;
    if (mask && (rect.w !== mask.frame.w || rect.h !== mask.frame.h || geometry(frame) !== geometry(mask)))
      throw new Error(`Mask geometry does not match frame ${frame.filename}; no scaling or implicit trim alignment.`);
    let checkedPixels = 0, maskedPixels = 0, transparentPixels = 0, offPalettePixels = 0;
    const counts = new Map();
    for (let y = 0; y < rect.h; y++) for (let x = 0; x < rect.w; x++) {
      const i = offset(rect, x, y), a = data[i + 3];
      if (exclusions?.[y * rect.w + x]) { maskedPixels++; continue; }
      if (!a) { transparentPixels++; continue; }
      checkedPixels++;
      const color = '#' + [...data.subarray(i, i + 3)].map(v => v.toString(16).padStart(2, '0')).join('');
      if (allowed.has(color)) continue;
      offPalettePixels++;
      if (!counts.has(color)) counts.set(color, { color, pixels: 0, samples: [] });
      const entry = counts.get(color); entry.pixels++;
      if (entry.samples.length < 16) entry.samples.push({ x, y, alpha: a });
    }
    const outside = [...counts.values()].sort((a, b) => a.color.localeCompare(b.color));
    rows.push({ filename: frame.filename, checkedPixels, maskedPixels, transparentPixels, offPalettePixels,
      offPaletteColors: outside.length, colors: outside.map(c => ({ ...c, samplesTruncated: c.pixels > c.samples.length })) });
  }
  if (!rows.length) throw new Error('Mask excludes every atlas frame; no artwork remains to check.');
  return rows;
}
