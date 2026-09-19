import { createCanvas, Image } from 'canvas';
import fs from 'fs';
import { patternTest } from './patterns.js';

export class CanvasRenderer {
  constructor(palette, opts = {}) {
    this.palette = palette;
    this.background = opts.background ?? { mode: 'transparent' };
  }

  _resolveColor(colorRef) {
    return this.palette.resolve(colorRef);
  }

  _applyBackground(ctx, width, height) {
    if (this.background.mode === 'chroma') {
      ctx.fillStyle = this.background.color;
      ctx.fillRect(0, 0, width, height);
    }
    // transparent = default canvas state (all zeros)
  }

  _drawShape(ctx, shape) {
    if (!shape.visible) return;
    const color = this._resolveColor(shape.color);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    // Snap to the pixel grid: fractional radii would produce invalid array
    // lengths and fractional endpoints would never terminate Bresenham.
    const p = {};
    for (const [k, v] of Object.entries(shape.params)) p[k] = typeof v === 'number' ? Math.round(v) : k === 'points' && Array.isArray(v) ? v.map(pt => ({ x: Math.round(pt.x), y: Math.round(pt.y) })) : v;
    // Two-color pattern fills: only the fill is patterned, never an outline.
    this._fill = p.pattern && p.filled !== false && p.color2 != null
      ? { test: patternTest(p.pattern), color, color2: this._resolveColor(p.color2) }
      : null;
    switch (shape.type) {
      case 'point':
        ctx.fillRect(p.x, p.y, 1, 1);
        break;
      case 'line':
        this._drawLine(ctx, p.x1, p.y1, p.x2, p.y2);
        break;
      case 'rect':
        if (p.filled && this._fill) {
          for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) this._px(ctx, x, y);
        } else if (p.filled) {
          ctx.fillRect(p.x, p.y, p.w, p.h);
        } else {
          // 1px outline
          ctx.fillRect(p.x, p.y, p.w, 1);           // top
          ctx.fillRect(p.x, p.y + p.h - 1, p.w, 1); // bottom
          ctx.fillRect(p.x, p.y, 1, p.h);            // left
          ctx.fillRect(p.x + p.w - 1, p.y, 1, p.h);  // right
        }
        break;
      case 'circle':
        this._drawCircle(ctx, p.cx, p.cy, p.r, p.filled);
        break;
      case 'ellipse':
        this._drawEllipse(ctx, p.cx, p.cy, p.rx, p.ry, p.filled);
        break;
      case 'fill':
        this._floodFill(ctx, p.x, p.y, color);
        break;
      case 'polygon':
        this._drawPolygon(ctx, p.points, p.filled, true);
        break;
      case 'polyline':
        this._drawPolygon(ctx, p.points, false, false);
        break;
    }
  }

  /** One fill pixel, honoring the active two-color pattern if any. */
  _px(ctx, x, y) {
    const f = this._fill;
    if (f && f.test(x, y)) {
      ctx.fillStyle = f.color2;
      ctx.fillRect(x, y, 1, 1);
      ctx.fillStyle = f.color;
    } else {
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Scanline even-odd fill + Bresenham outline. close=true joins last->first.
  _drawPolygon(ctx, points, filled, close) {
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
          for (let x = x0; x <= x1; x++) this._px(ctx, x, y);
        }
      }
    }
    for (let i = 0; i < points.length - 1; i++) {
      this._drawLine(ctx, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
    }
    if (close && points.length >= 3) {
      const last = points[points.length - 1];
      this._drawLine(ctx, last.x, last.y, points[0].x, points[0].y);
    }
  }

  // Bresenham's line for pixel-perfect lines. Endpoints are rounded first:
  // with a fractional endpoint the exact-equality stop test never fires.
  _drawLine(ctx, x1, y1, x2, y2) {
    x1 = Math.round(x1); y1 = Math.round(y1); x2 = Math.round(x2); y2 = Math.round(y2);
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;
    let x = x1, y = y1;
    while (true) {
      ctx.fillRect(x, y, 1, 1);
      if (x === x2 && y === y2) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  // Midpoint circle algorithm
  _drawCircle(ctx, cx, cy, r, filled) {
    if (filled) {
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          if (x * x + y * y <= r * r) {
            this._px(ctx, cx + x, cy + y);
          }
        }
      }
    } else {
      let x = r, y = 0, err = 1 - r;
      while (x >= y) {
        ctx.fillRect(cx + x, cy + y, 1, 1);
        ctx.fillRect(cx + y, cy + x, 1, 1);
        ctx.fillRect(cx - y, cy + x, 1, 1);
        ctx.fillRect(cx - x, cy + y, 1, 1);
        ctx.fillRect(cx - x, cy - y, 1, 1);
        ctx.fillRect(cx - y, cy - x, 1, 1);
        ctx.fillRect(cx + y, cy - x, 1, 1);
        ctx.fillRect(cx + x, cy - y, 1, 1);
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

  _drawEllipse(ctx, cx, cy, rx, ry, filled) {
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
          this._px(ctx, cx + x, cy + y);
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
        if (!drawn.has(key)) { drawn.add(key); ctx.fillRect(px, py, 1, 1); }
      }
    }
  }

  _floodFill(ctx, startX, startY, fillColor) {
    const canvas = ctx.canvas;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const w = canvas.width;
    const h = canvas.height;

    const idx = (startY * w + startX) * 4;
    const targetR = data[idx], targetG = data[idx + 1], targetB = data[idx + 2], targetA = data[idx + 3];

    // Parse fill color to RGBA
    const tempCanvas = createCanvas(1, 1);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.fillStyle = fillColor;
    tempCtx.fillRect(0, 0, 1, 1);
    const fc = tempCtx.getImageData(0, 0, 1, 1).data;
    const fillR = fc[0], fillG = fc[1], fillB = fc[2], fillA = fc[3];

    if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) return;

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
    ctx.putImageData(imgData, 0, 0);
  }

  /** Draw the cell's reference image (tracing underlay) scaled to the cell, if asked. */
  _drawReference(ctx, cell, opts) {
    if (!opts.withReference || !cell.reference) return;
    try {
      const img = new Image();
      img.src = fs.readFileSync(cell.reference.path); // sync load (node-canvas)
      ctx.save();
      ctx.globalAlpha = cell.reference.opacity ?? 0.35;
      ctx.drawImage(img, 0, 0, cell.width, cell.height);
      ctx.restore();
    } catch {
      // missing/unreadable reference: render without it
    }
  }

  renderCellRaw(cell, opts = {}) {
    const canvas = createCanvas(cell.width, cell.height);
    const ctx = canvas.getContext('2d');
    this._applyBackground(ctx, cell.width, cell.height);
    this._drawReference(ctx, cell, opts);
    for (const shape of cell.shapes.listByZ()) {
      this._drawShape(ctx, shape);
    }
    return ctx.getImageData(0, 0, cell.width, cell.height).data;
  }

  /** PNG-encode, optionally nearest-neighbor upscaled by an integer factor. */
  _finish(canvas, scale) {
    if (!scale || scale === 1) return canvas.toBuffer('image/png');
    const out = createCanvas(canvas.width * scale, canvas.height * scale);
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    return out.toBuffer('image/png');
  }

  renderCell(cell, opts = {}) {
    const canvas = createCanvas(cell.width, cell.height);
    const ctx = canvas.getContext('2d');
    this._applyBackground(ctx, cell.width, cell.height);
    this._drawReference(ctx, cell, opts);
    for (const shape of cell.shapes.listByZ()) {
      this._drawShape(ctx, shape);
    }
    return this._finish(canvas, opts.scale);
  }

  renderCells(cells, opts = {}) {
    const cols = opts.cols ?? cells.length;
    const rows = Math.ceil(cells.length / cols);
    const cellW = cells[0].width;
    const cellH = cells[0].height;
    const gap = opts.gap ?? 1;
    const w = cols * cellW + (cols - 1) * gap;
    const h = rows * cellH + (rows - 1) * gap;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    this._applyBackground(ctx, w, h);

    cells.forEach((cell, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = c * (cellW + gap);
      const y = r * (cellH + gap);
      const cellCanvas = createCanvas(cellW, cellH);
      const cellCtx = cellCanvas.getContext('2d');
      this._applyBackground(cellCtx, cellW, cellH);
      for (const shape of cell.shapes.listByZ()) {
        this._drawShape(cellCtx, shape);
      }
      ctx.drawImage(cellCanvas, x, y);
    });

    return this._finish(canvas, opts.scale);
  }

  renderSheet(cellManager, opts = {}) {
    const cells = [];
    for (let r = 0; r < cellManager.rows; r++) {
      for (let c = 0; c < cellManager.cols; c++) {
        cells.push(cellManager.getCell(`${r},${c}`));
      }
    }
    return this.renderCells(cells, { cols: cellManager.cols, ...opts });
  }
}
