// A tiny deterministic software rasteriser for creature frames. Shapes are
// sampled at pixel centres, so every edge is hard alpha. A shading pass lights
// each part from the top left and a selective outline closes the silhouette.
// The result is turned into ordinary named `rect` operations by `toOperations`.

/** A material is four hex steps, light to dark: [hi, mid, lo, out]. */
export const mat = (hi, mid, lo, out, extra = {}) => ({ hi, mid, lo, out, ...extra });
export const flat = (color, extra = {}) => ({ hi: color, mid: color, lo: color, out: color, flat: true, ...extra });

const inPoly = (pts, x, y) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const segDist = (x, y, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
};

export class Raster {
  /** `pad` extra columns each side give shapes room before the frame is recentred and cropped. */
  constructor(w, h, pad = 0) {
    this.w = w + 2 * pad; this.h = h; this.ox = pad; w = this.w;
    this.inst = new Int32Array(w * h).fill(-1);    // owning part instance (shading + occlusion order)
    this.pmat = new Array(w * h).fill(null);       // material that colours the pixel
    this.parts = [];                                // instance -> { name, mat, order }
    this.current = -1;
  }
  /** Start a part. Everything painted until the next `begin` belongs to it. */
  begin(name, material) {
    this.parts.push({ name, mat: material, order: this.parts.length });
    this.current = this.parts.length - 1;
    return this.current;
  }
  at(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : this.inst[y * this.w + x]; }
  put(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.inst[y * this.w + x] = this.current; this.pmat[y * this.w + x] = this.parts[this.current].mat;
  }
  scan(test, x0, y0, x1, y1) {
    const ox = this.ox;
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.h - 1, Math.ceil(y1)); y++)
      for (let x = Math.max(0, Math.floor(x0 + ox)); x <= Math.min(this.w - 1, Math.ceil(x1 + ox)); x++)
        if (test(x - ox + 0.5, y + 0.5)) this.put(x, y);
  }
  ellipse(cx, cy, rx, ry) {
    this.scan((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, cx - rx, cy - ry, cx + rx, cy + ry);
  }
  rect(x, y, w, h) { this.scan(() => true, x, y, x + w - 1, y + h - 1); }
  poly(pts) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    this.scan((x, y) => inPoly(pts, x, y), Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
  }
  /** A capsule: a line with round caps and a width (taper with w2). */
  line(ax, ay, bx, by, w, w2 = w) {
    const r = Math.max(w, w2) / 2;
    this.scan((x, y) => {
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
      return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= (w + (w2 - w) * t) / 2;
    }, Math.min(ax, bx) - r, Math.min(ay, by) - r, Math.max(ax, bx) + r, Math.max(ay, by) + r);
  }
  /** Polyline of capsules, e.g. a bent leg or a curled tail. */
  path(pts, w, w2 = w) {
    const total = pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0) || 1;
    let run = 0;
    for (let i = 1; i < pts.length; i++) {
      const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      this.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], w + (w2 - w) * run / total, w + (w2 - w) * (run + len) / total);
      run += len;
    }
  }
  dot(x, y, material) {
    this.begin('detail', material); this.parts[this.current].detail = true; this.put(Math.round(x) + this.ox, Math.round(y));
  }
  /** Recolour pixels of the current host part only (belly, patches). The host still shades them. */
  decal(host, material, shape) {
    const saved = this.current, before = this.put; this.current = host;
    this.put = (x, y) => { if (this.at(x, y) === host) this.pmat[y * this.w + x] = material; };
    shape(); this.put = before; this.current = saved;
  }
  /** Erase pixels of the host only (notches, hollows). */
  cut(host, shape) {
    const saved = this.current, before = this.put; this.current = host;
    this.put = (x, y) => { if (this.at(x, y) === host) { this.inst[y * this.w + x] = -1; this.pmat[y * this.w + x] = null; } };
    shape(); this.put = before; this.current = saved;
  }
  /** Shade, outline and flatten to a map of pixels: { x, y, color, part }. */
  resolve({ outline = 'selective' } = {}) {
    const { w, h } = this, out = new Array(w * h).fill(null), name = i => this.parts[i]?.name;
    const order = i => this.parts[i].order;
    const behind = (x, y, k) => { const n = this.at(x, y); return n < 0 || (n !== k && order(n) < order(k)); };
    const front = (x, y, k) => { const n = this.at(x, y); return n >= 0 && n !== k && order(n) > order(k) && !this.parts[n].detail; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = this.inst[y * w + x]; if (k < 0) continue;
      const m = this.pmat[y * w + x];
      let color = m.mid;
      if (!m.flat) {
        const lit = behind(x, y - 1, k) || behind(x - 1, y, k);
        const shaded = behind(x, y + 1, k) || behind(x + 1, y, k) || front(x - 1, y, k) || front(x, y - 1, k) || front(x - 1, y - 1, k);
        color = lit && !shaded ? m.hi : shaded && !lit ? m.lo : m.mid;
        // Parts only one pixel thick keep their base tone: no room for a gradient.
        if (lit && shaded) color = m.mid;
      }
      out[y * w + x] = { x, y, color, part: name(k) };
    }
    const nb = [[0, 1, 'down'], [1, 0, 'right'], [0, -1, 'up'], [-1, 0, 'left']];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (out[y * w + x]) continue;
      let pick = null;
      for (const [dx, dy, side] of nb) {
        const k = this.at(x + dx, y + dy); if (k < 0) continue;
        const m = this.pmat[(y + dy) * w + x + dx]; if (m.noOutline) continue;
        // The neighbour below or to the right means this pixel sits on a lit (top/left) edge.
        const litEdge = outline === 'selective' && (side === 'down' || side === 'right');
        const color = litEdge ? m.lo : m.out;
        if (!pick || (!litEdge && pick.lit)) pick = { color, lit: litEdge, part: name(k) };
      }
      if (pick) out[y * w + x] = { x, y, color: pick.color, part: pick.part, outline: true };
    }
    return out;
  }
}

/** Mirror resolved pixels left-right inside a width. */
export const mirrorPixels = (pixels, w) => pixels.map(p => p && { ...p, x: w - 1 - p.x });

/** Merge pixels into named rect operations: horizontal runs, then identical stacked runs. */
export function toOperations(pixels, w, h, cell) {
  const grid = new Array(w * h).fill(null);
  for (const p of pixels) if (p) grid[p.y * w + p.x] = p;
  const keyOf = p => `${p.part}|${p.color}`;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const runs = [];
    for (let x = 0; x < w;) {
      const p = grid[y * w + x];
      if (!p) { x++; continue; }
      let e = x; while (e + 1 < w && grid[y * w + e + 1] && keyOf(grid[y * w + e + 1]) === keyOf(p)) e++;
      runs.push({ x, w: e - x + 1, y, h: 1, part: p.part, color: p.color }); x = e + 1;
    }
    rows.push(runs);
  }
  const rects = [], open = new Map();
  for (let y = 0; y < h; y++) {
    const next = new Map();
    for (const r of rows[y]) {
      const key = `${r.x}|${r.w}|${r.part}|${r.color}`, prev = open.get(key);
      if (prev) { prev.h++; next.set(key, prev); } else { const rr = { ...r }; rects.push(rr); next.set(key, rr); }
    }
    open.clear(); for (const [k, v] of next) open.set(k, v);
  }
  const counts = {}, ops = [], names = {};
  for (const r of rects) {
    counts[r.part] = (counts[r.part] ?? 0) + 1;
    const name = `${r.part}_${counts[r.part]}`;
    (names[r.part] ??= []).push(name);
    ops.push({ command: 'draw', cell, type: 'rect', name, color: r.color, filled: true, x: r.x, y: r.y, w: r.w, h: r.h });
  }
  return { ops, groups: names };
}

export function boundsOf(pixels) {
  const b = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const p of pixels) if (p) { b.left = Math.min(b.left, p.x); b.right = Math.max(b.right, p.x); b.top = Math.min(b.top, p.y); b.bottom = Math.max(b.bottom, p.y); }
  return b;
}

/** Two-bone inverse kinematics. The joint bows toward `hint` (a direction vector). */
export function ik([hx, hy], [fx, fy], l1, l2, hint) {
  let dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy) || 0.001;
  const maxReach = l1 + l2 - 0.01;
  if (d > maxReach) { fx = hx + dx / d * maxReach; fy = hy + dy / d * maxReach; dx = fx - hx; dy = fy - hy; d = maxReach; }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const mx = hx + dx * a / d, my = hy + dy * a / d, nx = -dy / d, ny = dx / d;
  const sign = (nx * hint[0] + ny * hint[1]) >= 0 ? 1 : -1;
  return [[hx, hy], [mx + sign * hh * nx, my + sign * hh * ny], [fx, fy]];
}
export { segDist };
