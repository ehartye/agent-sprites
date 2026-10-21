import { flipSurface, rotateSurface } from '../web/public/js/shared/surface-model.js';
// Pure param transforms shared by Cell (per-shape, undoable) and
// CellManager (whole-cell). All mutate params in place.

function bbox(p) {
  if ('points' in p) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pt of p.points) {
      minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
    }
    return { minX, maxX, minY, maxY };
  }
  if ('x1' in p) {
    return {
      minX: Math.min(p.x1, p.x2), maxX: Math.max(p.x1, p.x2),
      minY: Math.min(p.y1, p.y2), maxY: Math.max(p.y1, p.y2),
    };
  }
  if ('cx' in p) {
    const rx = 'r' in p ? p.r : p.rx;
    const ry = 'r' in p ? p.r : p.ry;
    return { minX: p.cx - rx, maxX: p.cx + rx, minY: p.cy - ry, maxY: p.cy + ry };
  }
  if ('w' in p) {
    return { minX: p.x, maxX: p.x + p.w - 1, minY: p.y, maxY: p.y + p.h - 1 };
  }
  return { minX: p.x, maxX: p.x, minY: p.y, maxY: p.y };
}

/** Mirror sum m such that coord' = m - coord. about: 'self' | 'cell'.
 *  extent = cell dimension along the flip axis. */
export function mirrorSum(p, axis, about, extent) {
  if (about === 'cell') return extent - 1;
  const b = bbox(p);
  return axis === 'horizontal' ? b.minX + b.maxX : b.minY + b.maxY;
}

export function flipParams(p, axis, m) {
  const surface = Object.hasOwn(p, 'surface') ? flipSurface(p.surface, axis === 'horizontal' ? 'x' : axis === 'vertical' ? 'y' : axis, m) : undefined;
  if (axis === 'horizontal') {
    if ('points' in p) { for (const pt of p.points) pt.x = m - pt.x; }
    else if ('x1' in p) { p.x1 = m - p.x1; p.x2 = m - p.x2; }
    else if ('cx' in p) { p.cx = m - p.cx; }
    else if ('w' in p) { p.x = m - p.x - p.w + 1; }
    else { p.x = m - p.x; }
  } else if (axis === 'vertical') {
    if ('points' in p) { for (const pt of p.points) pt.y = m - pt.y; }
    else if ('y1' in p) { p.y1 = m - p.y1; p.y2 = m - p.y2; }
    else if ('cy' in p) { p.cy = m - p.cy; }
    else if ('h' in p) { p.y = m - p.y - p.h + 1; }
    else { p.y = m - p.y; }
  } else {
    throw new Error(`Unknown axis "${axis}" (use horizontal|vertical)`);
  }
  if (surface !== undefined) p.surface = surface;
}

/** Pivot point for rotation. about: 'self' (bbox center) | 'cell' (cell center). */
export function rotatePivot(p, about, cellWidth, cellHeight = cellWidth) {
  if (about === 'cell') {
    return [(cellWidth - 1) / 2, (cellHeight - 1) / 2];
  }
  const b = bbox(p);
  return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
}

/** Rotate shape params deg (90|180|270) clockwise (y-down) about pivot (px, py). */
export function rotateParams(p, deg, px, py) {
  if (deg !== 90 && deg !== 180 && deg !== 270) {
    throw new Error('Rotation must be 90, 180, or 270 degrees');
  }
  const surface = Object.hasOwn(p, 'surface') ? rotateSurface(p.surface, deg, px, py) : undefined;
  const rotRaw = (x, y) => {
    const dx = x - px, dy = y - py;
    if (deg === 90) return [px - dy, py + dx];
    if (deg === 180) return [px - dx, py - dy];
    return [px + dy, py - dx];
  };
  const rot = (x, y) => {
    const [a, b] = rotRaw(x, y);
    return [Math.round(a), Math.round(b)];
  };
  if ('points' in p) {
    for (const pt of p.points) [pt.x, pt.y] = rot(pt.x, pt.y);
  } else if ('x1' in p) {
    [p.x1, p.y1] = rot(p.x1, p.y1);
    [p.x2, p.y2] = rot(p.x2, p.y2);
  } else if ('cx' in p) {
    [p.cx, p.cy] = rot(p.cx, p.cy);
    if (deg !== 180 && 'rx' in p) { const t = p.rx; p.rx = p.ry; p.ry = t; }
  } else if ('w' in p) {
    const cx = p.x + (p.w - 1) / 2, cy = p.y + (p.h - 1) / 2;
    const [ncx, ncy] = rotRaw(cx, cy);
    if (deg !== 180) { const t = p.w; p.w = p.h; p.h = t; }
    p.x = Math.round(ncx - (p.w - 1) / 2);
    p.y = Math.round(ncy - (p.h - 1) / 2);
  } else {
    [p.x, p.y] = rot(p.x, p.y);
  }
  if (surface !== undefined) p.surface = surface;
}
