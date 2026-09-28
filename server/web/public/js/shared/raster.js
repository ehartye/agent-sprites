/**
 * The one set of shape rules for the export and every browser view. Shapes are
 * drawn onto a pen: `px(x, y, second)` paints one pixel (`second` is true where a
 * two-color pattern paints color2) and `rect(x, y, w, h)` paints a block. The
 * calls are the export's historical fillRect calls, in order, so translucent
 * overlaps blend exactly as before. The export and the browser both load this
 * file, so it must stay free of the DOM and of Node: pure functions only.
 */
import { PATTERNS } from './patterns.js';

/**
 * Snap to the pixel grid: fractional radii would produce invalid array lengths
 * and fractional endpoints would never terminate Bresenham.
 */
export function snapParams(params) {
  const p = {};
  for (const [k, v] of Object.entries(params)) p[k] = typeof v === 'number' ? Math.round(v) : k === 'points' && Array.isArray(v) ? v.map(pt => ({ x: Math.round(pt.x), y: Math.round(pt.y) })) : v;
  return p;
}

/** The pattern test for a shape's fill, or null. Unknown names draw solid. */
export function fillPattern(p) {
  return p.pattern && p.filled !== false && p.color2 != null ? PATTERNS[p.pattern] ?? null : null;
}

/** Rasterize one shape onto `pen`. `fill` (a flood) and unknown types draw nothing. */
export function rasterShape(type, p, pen) {
  const test = fillPattern(p);
  const fillPx = test ? (x, y) => pen.px(x, y, test(x, y)) : (x, y) => pen.px(x, y, false);
  switch (type) {
    case 'point':
      pen.px(p.x, p.y, false);
      break;
    case 'line':
      line(pen, p.x1, p.y1, p.x2, p.y2);
      break;
    case 'rect':
      if (p.filled && test) {
        for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) fillPx(x, y);
      } else if (p.filled) {
        pen.rect(p.x, p.y, p.w, p.h);
      } else {
        // 1px outline
        pen.rect(p.x, p.y, p.w, 1);           // top
        pen.rect(p.x, p.y + p.h - 1, p.w, 1); // bottom
        pen.rect(p.x, p.y, 1, p.h);           // left
        pen.rect(p.x + p.w - 1, p.y, 1, p.h); // right
      }
      break;
    case 'circle':
      circle(pen, fillPx, p.cx, p.cy, p.r, p.filled);
      break;
    case 'ellipse':
      ellipse(pen, fillPx, p.cx, p.cy, p.rx, p.ry, p.filled);
      break;
    case 'polygon':
      polygon(pen, fillPx, p.points, p.filled, true);
      break;
    case 'polyline':
      polygon(pen, fillPx, p.points, false, false);
      break;
  }
}

// Scanline even-odd fill + Bresenham outline. close=true joins last->first.
function polygon(pen, fillPx, points, filled, close) {
  if (!Array.isArray(points) || points.length < 2) return;
  if (filled && close && points.length >= 3) {
    let minY = Infinity, maxY = -Infinity;
    for (const pt of points) { minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y); }
    for (let y = minY; y <= maxY; y++) {
      const xs = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if (a.y === b.y) continue;
        if (y >= Math.min(a.y, b.y) && y < Math.max(a.y, b.y)) {
          xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
        }
      }
      xs.sort((m, n) => m - n);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const x0 = Math.ceil(xs[i]), x1 = Math.floor(xs[i + 1]);
        for (let x = x0; x <= x1; x++) fillPx(x, y);
      }
    }
  }
  for (let i = 0; i < points.length - 1; i++) {
    line(pen, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
  }
  if (close && points.length >= 3) {
    const last = points[points.length - 1];
    line(pen, last.x, last.y, points[0].x, points[0].y);
  }
}

// Bresenham's line for pixel-perfect lines. Endpoints are rounded first:
// with a fractional endpoint the exact-equality stop test never fires.
function line(pen, x1, y1, x2, y2) {
  x1 = Math.round(x1); y1 = Math.round(y1); x2 = Math.round(x2); y2 = Math.round(y2);
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;
  let x = x1, y = y1;
  while (true) {
    pen.px(x, y, false);
    if (x === x2 && y === y2) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

// Filled: half-pixel threshold for r >= 2 (rows 3,5,7,7,7,5,3 at r=3 instead of a
// plus-tipped blob); r=1 keeps its classic five-pixel plus. Outline: midpoint circle.
function circle(pen, fillPx, cx, cy, r, filled) {
  if (filled) {
    const limit = r >= 2 ? (r + 0.5) * (r + 0.5) : r * r;
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= limit) fillPx(cx + x, cy + y);
      }
    }
  } else {
    let x = r, y = 0, err = 1 - r;
    while (x >= y) {
      pen.px(cx + x, cy + y, false);
      pen.px(cx + y, cy + x, false);
      pen.px(cx - y, cy + x, false);
      pen.px(cx - x, cy + y, false);
      pen.px(cx - x, cy - y, false);
      pen.px(cx - y, cy - x, false);
      pen.px(cx + y, cy - x, false);
      pen.px(cx + x, cy - y, false);
      y++;
      if (err < 0) {
        err += 2 * y + 1;
      } else {
        x--;
        err += 2 * (y - x) + 1;
      }
    }
  }
}

function ellipse(pen, fillPx, cx, cy, rx, ry, filled) {
  if (rx <= 0 || ry <= 0) return;
  if (filled) {
    // Trim 1px tips at cardinal extremes. Row trim active when ry >= 2;
    // column trim independently active when rx >= 2.
    const trimRow = ry >= 2;
    const trimCol = rx >= 2;
    const colHeight = new Array(2 * rx + 1).fill(0);
    const rowWidth = new Array(2 * ry + 1).fill(0);
    const inEllipse = (x, y) => (x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1;
    if (trimRow || trimCol) {
      for (let y = -ry; y <= ry; y++)
        for (let x = -rx; x <= rx; x++)
          if (inEllipse(x, y)) { rowWidth[y + ry]++; colHeight[x + rx]++; }
    }
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        if (!inEllipse(x, y)) continue;
        if (trimRow && (y === -ry || y === ry) && rowWidth[y + ry] === 1) continue;
        if (trimCol && (x === -rx || x === rx) && colHeight[x + rx] === 1) continue;
        fillPx(cx + x, cy + y);
      }
    }
  } else {
    const steps = Math.max(rx, ry) * 4;
    const drawn = new Set();
    for (let i = 0; i < steps; i++) {
      const angle = (2 * Math.PI * i) / steps;
      const px = Math.round(cx + rx * Math.cos(angle));
      const py = Math.round(cy + ry * Math.sin(angle));
      const key = `${px},${py}`;
      if (!drawn.has(key)) { drawn.add(key); pen.px(px, py, false); }
    }
  }
}

/**
 * 4-connected flood fill in place over ImageData-shaped `{data, width, height}`:
 * replaces the start pixel's exact RGBA with `rgba` ([r, g, b, a], 0–255).
 * Returns false when there was nothing to change.
 */
export function floodFill(imageData, startX, startY, rgba) {
  const { data, width: w, height: h } = imageData;
  const idx = (startY * w + startX) * 4;
  const targetR = data[idx], targetG = data[idx + 1], targetB = data[idx + 2], targetA = data[idx + 3];
  const [fillR, fillG, fillB, fillA] = rgba;
  if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) return false;
  const match = (i) =>
    data[i] === targetR && data[i + 1] === targetG &&
    data[i + 2] === targetB && data[i + 3] === targetA;
  const stack = [[startX, startY]];
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    const i = (y * w + x) * 4;
    if (x < 0 || x >= w || y < 0 || y >= h || !match(i)) continue;
    data[i] = fillR; data[i + 1] = fillG; data[i + 2] = fillB; data[i + 3] = fillA;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return true;
}
