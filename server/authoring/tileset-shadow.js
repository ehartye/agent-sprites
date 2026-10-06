// Contact shadows and edge shading for the `tileset` recipe.
//
//   @shadow <name> w=<n> h=<n> [x= y=] [color=#hex]
//       one stepped silhouette (a lens: wide in the middle rows, shorter above and below) on the pixel grid.
//       The silhouette is centred in the cell unless x= / y= place its top-left. Hard alpha, one flat colour: the
//       game draws it at one opacity, so overlapping shadows never darken beyond that colour and every edge stays
//       on the grid (no blur, no dither).
//   @shade <prefix> n=<rows> w=<cols> [e=<cols>] [color=#hex]
//       the occlusion bands on a ground tile next to something tall. Light is top left, so a tall neighbour to the
//       north or west casts onto this tile (n rows along the top, w columns down the left) and a neighbour to the
//       east touches it with a thin contact line (e columns down the right). A caster to the north-west only
//       (diagonal) leaves a chamfered corner block.
//       Frames: <prefix>_<mask>, mask bits N=1 E=4 W=64 NW=128 (a set bit means that neighbour casts), so there are
//       nine masks (the NW bit is dropped when N or W is set, as the shadow is already there).
export const SHADE_BITS = {n: 1, e: 4, w: 64, nw: 128};
export const SHADE_MASKS = [1, 4, 5, 64, 65, 68, 69, 128, 132];
export const DEFAULT_SHADOW_COLOR = '#1b2040';
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Row widths of a stepped lens: the same silhouette idea as an ellipse, snapped to the pixel grid and kept symmetric. */
export function lensRows(w, h) {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) throw Error('A shadow needs a positive integer w and h.');
  return Array.from({length: h}, (_, k) => {
    const t = h === 1 ? 0 : (k + 0.5 - h / 2) / (h / 2), full = Math.sqrt(Math.max(0, 1 - t * t));
    let width = Math.max(1, Math.round(w * full));
    if ((w - width) % 2) width += width < w ? 1 : -1;       // keep it centred on the pixel grid
    return Math.min(w, Math.max(1, width));
  });
}

/** A w-by-h block of colours for one shadow lens (null = transparent). */
export function shadowPixels({w, h, color = DEFAULT_SHADOW_COLOR}) {
  if (!HEX.test(color)) throw Error('A shadow colour is #rrggbb.');
  const rows = lensRows(w, h);
  return rows.map(width => { const left = (w - width) / 2; return Array.from({length: w}, (_, x) => (x >= left && x < left + width ? color.toLowerCase() : null)); });
}

export function normalizeShadeMask(mask) {
  let m = mask & (SHADE_BITS.n | SHADE_BITS.e | SHADE_BITS.w | SHADE_BITS.nw);
  if (m & (SHADE_BITS.n | SHADE_BITS.w)) m &= ~SHADE_BITS.nw;
  return m;
}

/** [{name, mask, pixels}] for the nine shade masks on a size x size tile. */
export function shadeTiles({prefix, size = 16, n, w, e = 0, color = DEFAULT_SHADOW_COLOR}) {
  if (!HEX.test(color)) throw Error('A shade colour is #rrggbb.');
  for (const [k, v] of Object.entries({n, w, e})) if (!Number.isInteger(v) || v < 0 || v > size / 2) throw Error(`Shade ${k}= must be an integer from 0 to ${size / 2}.`);
  if (n < 1 || w < 1) throw Error('Shade n= and w= must be at least 1.');
  const c = color.toLowerCase();
  return SHADE_MASKS.map(mask => {
    const g = Array.from({length: size}, () => Array(size).fill(null));
    const rect = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = c; };
    if (mask & SHADE_BITS.n) rect(0, 0, size - 1, n - 1);
    if (mask & SHADE_BITS.w) rect(0, 0, w - 1, size - 1);
    if (mask & SHADE_BITS.e && e > 0) rect(size - e, 0, size - 1, size - 1);
    if (mask & SHADE_BITS.nw) { rect(0, 0, w - 1, n - 1); if (w > 1 && n > 1) g[n - 1][w - 1] = null; }
    return {name: `${prefix}_${mask}`, mask, pixels: g};
  });
}
