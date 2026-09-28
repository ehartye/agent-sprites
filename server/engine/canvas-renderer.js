import { createCanvas, Image } from 'canvas';
import fs from 'fs';
import { patternTest } from './patterns.js';
import { snapParams, rasterShape, floodFill } from '../web/public/js/shared/raster.js';

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
    const p = snapParams(shape.params);
    if (shape.type === 'fill') {
      this._floodFill(ctx, p.x, p.y, color);
      return;
    }
    // Two-color pattern fills: only the fill is patterned, never an outline.
    // The export rejects an unknown pattern name; the shared rules would draw it solid.
    const patterned = p.pattern && p.filled !== false && p.color2 != null;
    if (patterned) patternTest(p.pattern);
    const color2 = patterned ? this._resolveColor(p.color2) : null;
    rasterShape(shape.type, p, {
      px(x, y, second) {
        if (second) {
          ctx.fillStyle = color2;
          ctx.fillRect(x, y, 1, 1);
          ctx.fillStyle = color;
        } else {
          ctx.fillRect(x, y, 1, 1);
        }
      },
      rect(x, y, w, h) { ctx.fillRect(x, y, w, h); },
    });
  }

  _floodFill(ctx, startX, startY, fillColor) {
    const imgData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    // Parse the fill colour to RGBA through a 1×1 canvas.
    const tempCtx = createCanvas(1, 1).getContext('2d');
    tempCtx.fillStyle = fillColor;
    tempCtx.fillRect(0, 0, 1, 1);
    if (floodFill(imgData, startX, startY, [...tempCtx.getImageData(0, 0, 1, 1).data])) ctx.putImageData(imgData, 0, 0);
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

  /**
   * Erase shapes punch transparency through the shapes below them (by z), not
   * through the background or reference. Cells without one draw directly.
   */
  _drawShapes(ctx, shapes, width, height) {
    if (!shapes.some(shape => shape.params.erase)) {
      for (const shape of shapes) this._drawShape(ctx, shape);
      return;
    }
    const layer = createCanvas(width, height), lctx = layer.getContext('2d');
    for (const shape of shapes) {
      lctx.globalCompositeOperation = shape.params.erase ? 'destination-out' : 'source-over';
      this._drawShape(lctx, shape);
    }
    ctx.drawImage(layer, 0, 0);
  }

  /** The exact pixels one shape paints in a width×height cell, as "x,y" keys. */
  shapeCoverage(shape, width, height) {
    const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
    this._drawShape(ctx, { type: shape.type, params: shape.params, color: '#ffffff', visible: true });
    const data = ctx.getImageData(0, 0, width, height).data, out = new Set();
    for (let i = 3; i < data.length; i += 4) if (data[i]) out.add(`${((i - 3) / 4) % width},${Math.floor((i - 3) / 4 / width)}`);
    return out;
  }

  renderCellRaw(cell, opts = {}) {
    const canvas = createCanvas(cell.width, cell.height);
    const ctx = canvas.getContext('2d');
    this._applyBackground(ctx, cell.width, cell.height);
    this._drawReference(ctx, cell, opts);
    this._drawShapes(ctx, cell.shapes.listByZ(), cell.width, cell.height);
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
    this._drawShapes(ctx, cell.shapes.listByZ(), cell.width, cell.height);
    return this._finish(canvas, opts.scale);
  }

  /** Composite cells as layers, first at the bottom; each keeps its own erasers. */
  renderStack(cells, opts = {}) {
    const { width, height } = cells[0];
    const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
    this._applyBackground(ctx, width, height);
    for (const cell of cells) {
      const layer = createCanvas(width, height);
      this._drawShapes(layer.getContext('2d'), cell.shapes.listByZ(), width, height);
      ctx.drawImage(layer, 0, 0);
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
      this._drawShapes(cellCtx, cell.shapes.listByZ(), cellW, cellH);
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
