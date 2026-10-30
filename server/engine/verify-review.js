// Advisory review numbers for verify --review: colour count, value ladder and declared-pair contrast.
// Colors are packed 0xRRGGBB; counts are Maps of packed color to opaque pixel count (see countOpaqueColors).

/** Parse #rgb or #rrggbb (any case) to a packed color, or null. */
export function parseHex(s) {
  const m = typeof s === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
  return parseInt(h, 16);
}
export const toHex = c => '#' + c.toString(16).padStart(6, '0');

/** Gray level 0..255: Rec. 709 luma of the gamma-encoded RGB, rounded. */
export const grayLevel = c => Math.round(0.2126 * (c >> 16) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255));

// WCAG 2.2 relative luminance. The captured SC 1.4.3 text gives the weights but not the linearisation
// threshold; this uses the 0.04045 of the sRGB standard that WCAG 2.2 adopted (older 2.0 text said 0.03928,
// which gives the same result for every 8-bit channel value).
const linear = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const relativeLuminance = c => 0.2126 * linear(c >> 16) + 0.7152 * linear((c >> 8) & 255) + 0.0722 * linear(c & 255);
/** Unrounded WCAG contrast ratio (L1+0.05)/(L2+0.05) with L1 the lighter. */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Merge several color-count Maps into one (the union of their pixels). */
export function mergeCounts(maps) {
  const out = new Map();
  for (const m of maps) for (const [c, n] of m) out.set(c, (out.get(c) ?? 0) + n);
  return out;
}

/** Colour count and value ladder of one color-count Map; an all-transparent area has null lowest and highest. */
export function colorMetrics(counts) {
  const levels = new Set();
  for (const c of counts.keys()) levels.add(grayLevel(c));
  const lowest = levels.size ? Math.min(...levels) : null, highest = levels.size ? Math.max(...levels) : null;
  return { colors: counts.size, ladder: { levels: levels.size, lowest, highest, spread: levels.size ? highest - lowest : 0 } };
}

/**
 * review = { atlas, frames, tags, pairs? }. rects: Map of "x,y,w,h" to { count Map, path, filename };
 * tags: [{ name, from, to }] over frameKeys, the rectangle key of every atlas frame in order.
 * Pairs are [[fg, bg], ...] of packed colors; `present` needs both colors among the atlas's opaque pixels.
 */
export function buildReview(rects, frameKeys, tags, { pairs, minContrast } = {}) {
  const frames = [...rects].map(([key, r]) => { const [x, y, w, h] = key.split(',').map(Number); return { path: r.path, frame: r.filename, rect: { x, y, w, h }, ...colorMetrics(r.counts) }; });
  const all = mergeCounts([...rects.values()].map(r => r.counts));
  const review = { atlas: colorMetrics(all), frames, tags: tags.map(t => {
    const keys = [...new Set(frameKeys.slice(t.from, t.to + 1))];
    return { name: t.name, from: t.from, to: t.to, rects: keys.length, ...colorMetrics(mergeCounts(keys.map(k => rects.get(k).counts))) };
  }) };
  if (minContrast !== undefined) review.minContrast = minContrast;
  if (pairs) review.pairs = pairs.map(([fg, bg]) => {
    const ratio = Math.round(contrastRatio(fg, bg) * 100) / 100;
    return { foreground: toHex(fg), background: toHex(bg), ratio, present: all.has(fg) && all.has(bg),
      ...(minContrast !== undefined ? { belowMin: contrastRatio(fg, bg) < minContrast } : {}) };
  });
  return review;
}
