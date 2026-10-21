import { createCanvas, Image } from 'canvas';
import fs from 'fs';
import { encodeSurfacePng, surfacePngDimensions } from './surface-png.js';
import { patternTest } from './patterns.js';
import { buildLayerTree, paintLayerTree } from '../web/public/js/shared/shape-layers.js';
import { snapParams, rasterShape, floodFill } from '../web/public/js/shared/raster.js';
import { hasSurfaceData, renderSurfaceCell, surfaceChannel, validateSurfaceScene } from '../web/public/js/shared/surface-raster.js';

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
    if (shape.visible === false) return;
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
    if (!opts.withReference || !cell.reference) return false;
    try {
      const img = new Image();
      img.src = fs.readFileSync(cell.reference.path); // sync load (node-canvas)
      ctx.save();
      ctx.globalAlpha = cell.reference.opacity ?? 0.35;
      ctx.drawImage(img, 0, 0, cell.width, cell.height);
      ctx.restore();
      return true;
    } catch {
      // missing/unreadable reference: render without it
      return false;
    }
  }

  /**
   * Erase shapes punch transparency through the shapes below them (by z), not
   * through the background or reference. Cells without one draw directly.
   */
  _drawShapes(ctx, shapes, width, height) {
    if (shapes.some(shape => Object.hasOwn(shape.params ?? {}, 'layers'))) {
      const tree = buildLayerTree(shapes, width, height);
      paintLayerTree(ctx, tree, { createCanvas, drawShape: (target, shape) => this._drawShape(target, shape) });
      return;
    }
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

  _validateCellLayers(cell) {
    const shapes = cell.shapes.listByZ();
    if (shapes.some(shape => Object.hasOwn(shape.params ?? {}, 'layers'))) buildLayerTree(shapes, cell.width, cell.height);
  }

  /** The exact pixels one shape paints in a width×height cell, as "x,y" keys. */
  shapeCoverage(shape, width, height) {
    const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
    this._drawShape(ctx, { type: shape.type, params: shape.params, color: '#ffffff', visible: true });
    const data = ctx.getImageData(0, 0, width, height).data, out = new Set();
    for (let i = 3; i < data.length; i += 4) if (data[i]) out.add(`${((i - 3) / 4) % width},${Math.floor((i - 3) / 4 / width)}`);
    return out;
  }

  renderCellChannels(cell, opts = {}) {
    surfaceChannel(opts.channel);
    const background = opts.background ?? this.background;
    const scene = {
      shapes: cell.shapes.listByZ(), width: cell.width, height: cell.height,
      lighting: cell.lighting, background,
      palette: this.palette, createCanvas, resolveColor: color => this._resolveColor(color),
      drawShape: (ctx, shape) => this._drawShape(ctx, shape),
    };
    const channels = renderSurfaceCell(scene);
    if (opts.withReference && cell.reference && (opts.channel ?? 'color') === 'color') {
      const canvas = createCanvas(cell.width, cell.height), ctx = canvas.getContext('2d');
      if (background.mode === 'chroma') { ctx.fillStyle = background.color; ctx.fillRect(0, 0, cell.width, cell.height); }
      if (this._drawReference(ctx, cell, opts)) {
        const art = background.mode === 'chroma' ? renderSurfaceCell({ ...scene, background: { mode: 'transparent' } }).color : channels.color;
        ctx.drawImage(this._canvasFromBytes(art, cell.width, cell.height), 0, 0);
        channels.color = new Uint8ClampedArray(ctx.getImageData(0, 0, cell.width, cell.height).data);
      }
    }
    return channels;
  }

  _canvasFromBytes(bytes, width, height) {
    const canvas = createCanvas(width, height), ctx = canvas.getContext('2d'), image = ctx.createImageData(width, height);
    image.data.set(bytes); ctx.putImageData(image, 0, 0); return canvas;
  }

  renderCellRaw(cell, opts = {}) {
    const channel = surfaceChannel(opts.channel), shapes = cell.shapes.listByZ();
    if (channel !== 'color' || hasSurfaceData(shapes, cell.lighting)) return this.renderCellChannels(cell, opts)[channel];
    this._validateCellLayers(cell);
    const canvas = createCanvas(cell.width, cell.height);
    const ctx = canvas.getContext('2d');
    const background = opts.background ?? this.background;
    if (background.mode === 'chroma') { ctx.fillStyle = background.color; ctx.fillRect(0, 0, cell.width, cell.height); }
    this._drawReference(ctx, cell, opts);
    this._drawShapes(ctx, shapes, cell.width, cell.height);
    return ctx.getImageData(0, 0, cell.width, cell.height).data;
  }

  _validateRenderCell(cell, opts = {}) {
    const channel = surfaceChannel(opts.channel), shapes = cell.shapes.listByZ();
    if (channel !== 'color' || hasSurfaceData(shapes, cell.lighting)) validateSurfaceScene({ shapes, width: cell.width, height: cell.height, lighting: cell.lighting, background: opts.background ?? this.background, palette: this.palette });
    else this._validateCellLayers(cell);
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

  _cellCanvas(cell, opts = {}) {
    const channel = surfaceChannel(opts.channel), shapes = cell.shapes.listByZ();
    if (channel !== 'color' || hasSurfaceData(shapes, cell.lighting)) return this._canvasFromBytes(this.renderCellRaw(cell, opts), cell.width, cell.height);
    this._validateCellLayers(cell);
    const canvas = createCanvas(cell.width, cell.height), ctx = canvas.getContext('2d'), background = opts.background ?? this.background;
    if (background.mode === 'chroma') { ctx.fillStyle = background.color; ctx.fillRect(0, 0, cell.width, cell.height); }
    this._drawReference(ctx, cell, opts);
    this._drawShapes(ctx, shapes, cell.width, cell.height);
    return canvas;
  }

  renderCell(cell, opts = {}) {
    if (surfaceChannel(opts.channel) === 'normal') {
      surfacePngDimensions(cell.width, cell.height, opts.scale ?? 1);
      return encodeSurfacePng(this.renderCellRaw(cell, opts), cell.width, cell.height, opts.scale ?? 1);
    }
    return this._finish(this._cellCanvas(cell, opts), opts.scale);
  }

  _normalBackground(width, height, background = this.background) {
    surfacePngDimensions(width, height);
    const rgba = new Uint8ClampedArray(width * height * 4);
    if (background.mode !== 'chroma') return rgba;
    const canvas = createCanvas(1, 1), ctx = canvas.getContext('2d'); ctx.fillStyle = background.color; ctx.fillRect(0, 0, 1, 1);
    const alpha = ctx.getImageData(0, 0, 1, 1).data[3];
    for (let p = 0; p < rgba.length; p += 4) if (alpha) rgba.set([128, 128, 255, alpha], p);
    return rgba;
  }

  _normalStack(cells, opts) {
    const { width, height } = cells[0];
    surfacePngDimensions(width, height, opts.scale ?? 1);
    const rgba = this._normalBackground(width, height);
    for (const cell of cells) {
      const source = this.renderCellRaw(cell, { ...opts, withReference: false, background: { mode: 'transparent' } });
      for (let y = 0; y < Math.min(height, cell.height); y++) for (let x = 0; x < Math.min(width, cell.width); x++) {
        const p = (y * width + x) * 4, s = (y * cell.width + x) * 4, sa = source[s + 3] / 255, da = rgba[p + 3] / 255, alpha = sa + da * (1 - sa);
        if (!sa) continue;
        for (let c = 0; c < 3; c++) rgba[p + c] = Math.round((source[s + c] * sa + rgba[p + c] * da * (1 - sa)) / alpha);
        const decode = value => value === 128 ? 0 : value / 127.5 - 1;
        const nx = decode(rgba[p]), ny = decode(rgba[p + 1]), nz = Math.max(0, decode(rgba[p + 2])), length = Math.hypot(nx, ny, nz);
        if (length) for (const [c, value] of [nx, ny, nz].entries()) rgba[p + c] = Math.round((value / length + 1) * 127.5);
        else rgba.set([128, 128, 255], p);
        rgba[p + 3] = Math.round(alpha * 255);
      }
    }
    return encodeSurfacePng(rgba, width, height, opts.scale ?? 1);
  }

  /** Composite cells as layers, first at the bottom; each keeps its own erasers. */
  renderStack(cells, opts = {}) {
    const channel = surfaceChannel(opts.channel);
    for (const cell of cells) this._validateRenderCell(cell, { ...opts, background: { mode: 'transparent' } });
    if (channel === 'normal') return this._normalStack(cells, opts);
    const { width, height } = cells[0];
    const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
    if (channel === 'color') this._applyBackground(ctx, width, height);
    for (const cell of cells) {
      const layer = this._cellCanvas(cell, { ...opts, withReference: false, background: { mode: 'transparent' } });
      ctx.drawImage(layer, 0, 0);
    }
    return this._finish(canvas, opts.scale);
  }

  renderCells(cells, opts = {}) {
    const channel = surfaceChannel(opts.channel);
    for (const cell of cells) this._validateRenderCell(cell, opts);
    const cols = opts.cols ?? cells.length;
    const rows = Math.ceil(cells.length / cols);
    const cellW = cells[0].width;
    const cellH = cells[0].height;
    const gap = opts.gap ?? 1;
    const w = cols * cellW + (cols - 1) * gap;
    const h = rows * cellH + (rows - 1) * gap;
    if (channel === 'normal') {
      surfacePngDimensions(w, h, opts.scale ?? 1);
      const rgba = this._normalBackground(w, h);
      cells.forEach((cell, i) => {
        const source = this.renderCellRaw(cell, { ...opts, withReference: false }), ox = (i % cols) * (cellW + gap), oy = Math.floor(i / cols) * (cellH + gap);
        for (let y = 0; y < cell.height && oy + y < h; y++) for (let x = 0; x < cell.width && ox + x < w; x++) {
          const s = (y * cell.width + x) * 4, p = ((oy + y) * w + ox + x) * 4;
          rgba.set(source.subarray(s, s + 4), p);
        }
      });
      return encodeSurfacePng(rgba, w, h, opts.scale ?? 1);
    }
    const canvas = createCanvas(w, h), ctx = canvas.getContext('2d');
    if (channel === 'color') this._applyBackground(ctx, w, h);
    cells.forEach((cell, i) => {
      const cellCanvas = this._cellCanvas(cell, { ...opts, withReference: false });
      ctx.drawImage(cellCanvas, (i % cols) * (cellW + gap), Math.floor(i / cols) * (cellH + gap));
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
