import { createCanvas, loadImage } from 'canvas';

/** Decode a PNG file into straight RGBA bytes: { data, width, height }. */
export async function readImagePixels(pngPath) {
  const image = await loadImage(pngPath);
  const canvas = createCanvas(image.width, image.height), ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  return { data: ctx.getImageData(0, 0, image.width, image.height).data, width: image.width, height: image.height };
}

/**
 * Port of pxstep.py (skills/sprite-craft/references/scale-and-proportion.md, section 8).
 * Counts same-colour runs along every row and column (alpha 0 is transparent and breaks a run), then returns the
 * largest k in 12..1 for which at least `coverage` of the runs are multiples of k.
 * crop is [x0, y0, x1, y1] like PIL Image.crop: x0,y0 inclusive, x1,y1 exclusive, in whole pixels inside the image.
 * Returns { k, runs: [{ length, count }] sorted by length, coverage }. Unlike pxstep.py, an image with no opaque runs gives k 1.
 */
export function pixelStep({ data, width, height }, { crop, coverage = 0.9 } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || !data || data.length < width * height * 4)
    throw new Error('pixelStep needs RGBA data with positive integer width and height.');
  if (typeof coverage !== 'number' || !(coverage > 0 && coverage <= 1)) throw new Error('coverage must be a number above 0 and at most 1.');
  let [x0, y0, x1, y1] = [0, 0, width, height];
  if (crop !== undefined) {
    if (!Array.isArray(crop) || crop.length !== 4 || !crop.every(Number.isInteger)) throw new Error('crop must be four whole numbers [x0, y0, x1, y1].');
    [x0, y0, x1, y1] = crop;
    if (x0 < 0 || y0 < 0 || x1 > width || y1 > height || x1 <= x0 || y1 <= y0)
      throw new Error(`crop [${crop.join(', ')}] is outside the ${width} x ${height} image (x1 and y1 are exclusive).`);
  }
  const counts = new Map();
  const count = n => counts.set(n, (counts.get(n) ?? 0) + 1);
  const key = (x, y) => {
    const i = (y * width + x) * 4;
    return data[i + 3] ? (data[i] * 256 + data[i + 1]) * 65536 + data[i + 2] * 256 + data[i + 3] : null;
  };
  for (const horizontal of [true, false]) {
    for (let a = horizontal ? y0 : x0; a < (horizontal ? y1 : x1); a++) {
      let n = 0, prev = null;
      for (let b = horizontal ? x0 : y0; b < (horizontal ? x1 : y1); b++) {
        const p = horizontal ? key(b, a) : key(a, b);
        if (p !== null && p === prev) n++;
        else { if (prev !== null) count(n); n = 1; prev = p; }
      }
      if (prev !== null) count(n);
    }
  }
  const runs = [...counts].map(([length, count]) => ({ length, count })).sort((a, b) => a.length - b.length);
  const total = runs.reduce((sum, r) => sum + r.count, 0);
  let k = 1;
  if (total) for (let c = 12; c >= 1; c--) {
    if (runs.reduce((sum, r) => sum + (r.length % c === 0 ? r.count : 0), 0) >= coverage * total) { k = c; break; }
  }
  return { k, runs, coverage };
}
