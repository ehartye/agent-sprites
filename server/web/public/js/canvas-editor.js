import { paintShapes } from './erase-layer.js';
import { pen } from './cell-raster.js';
import { snapParams, rasterShape } from './shared/raster.js';

/**
 * Canvas editor — pixel grid with zoom, pan, and shape rendering.
 * Shapes are drawn with the shared rules in shared/raster.js, as the export draws them.
 */

const MIN_ZOOM = 0.125;
const MAX_ZOOM = 40;

export class CanvasEditor {
  constructor() {
    /** @type {HTMLCanvasElement} */
    this.canvas = null;
    /** @type {CanvasRenderingContext2D} */
    this.ctx = null;

    this.cellW = 16;
    this.cellH = 16;
    this.zoom = 16;
    this.panX = 0;
    this.panY = 0;

    this._shapes = [];
    this._background = { mode: 'transparent' };
    this._palette = {};

    this._isPanning = false;
    this._panStartX = 0;
    this._panStartY = 0;
    this._spaceHeld = false;

    this._pixelClickCb = null;
    this._pixelMoveCb = null;
    this._pixelUpCb = null;
    this._cursorMoveCb = null;
    this._zoomChangeCb = null;
    this._onionSkinData = null;
    this._selectedShape = null;
    this._dragPreview = null;
    this._isMouseDown = false;

    this._abortController = null;
  }

  init(container, cellW = 16, cellH = cellW) {
    this.cellW = cellW;
    this.cellH = cellH;
    this.canvas = document.getElementById('editor-canvas');
    this.ctx = this.canvas.getContext('2d');

    this._resize(container);
    this._bindEvents(container);
    this.render();
  }

  destroy() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  }

  /* -- Public API -- */

  setCell(cellData) {
    this._shapes = cellData
      ? (cellData.shapes || []).filter(s => s.visible !== false).sort((a, b) => a.zIndex - b.zIndex)
      : [];
    this.render();
  }

  setCellSize(w, h = w) {
    this.cellW = w;
    this.cellH = h;
    this.render();
  }

  /** Tracing reference underlay: refInfo = { opacity } from cell data, or null. */
  setReference(refInfo, cellRef) {
    const request = this._refRequest = (this._refRequest ?? 0) + 1;
    this._refImage = null;
    this.render();
    if (!refInfo) {
      this._refImage = null;
      this.render();
      return;
    }
    this._refOpacity = refInfo.opacity ?? 0.35;
    const img = new window.Image();
    img.onload = () => { if (request !== this._refRequest) return; this._refImage = img; this.render(); };
    img.onerror = () => { if (request !== this._refRequest) return; this._refImage = null; this.render(); };
    img.src = `/api/cell/reference-image?cell=${encodeURIComponent(cellRef)}&t=${Date.now()}`;
  }

  setPalette(paletteMap) {
    this._palette = paletteMap;
  }

  setBackground(bg) {
    this._background = bg || { mode: 'transparent' };
    this.render();
  }

  setZoom(level) {
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level));
    if (this._zoomChangeCb) this._zoomChangeCb(this.zoom);
    this.render();
  }

  onPixelClick(cb) { this._pixelClickCb = cb; }
  onPixelMove(cb) { this._pixelMoveCb = cb; }
  onPixelUp(cb) { this._pixelUpCb = cb; }
  onCursorMove(cb) { this._cursorMoveCb = cb; }
  onZoomChange(cb) { this._zoomChangeCb = cb; }

  setSelectedShape(shape) {
    this._selectedShape = shape;
    this.render();
  }

  setDragPreview(shape, dx, dy) {
    this._dragPreview = shape ? { shape, dx, dy } : null;
    this.render();
  }

  /**
   * Set onion skin overlay data. Pass null to clear.
   * @param {{ prev: object[], next: object[] }|null} data
   */
  setOnionSkin(data) {
    this._onionSkinData = data;
    this.render();
  }

  /* -- Rendering -- */

  render() {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const z = this.zoom;
    const gridW = this.cellW * z;
    const gridH = this.cellH * z;

    ctx.clearRect(0, 0, cw, ch);

    // Offset to center the grid
    const ox = Math.floor((cw - gridW) / 2) + this.panX;
    const oy = Math.floor((ch - gridH) / 2) + this.panY;

    // Background
    this._renderBackground(ctx, ox, oy, gridW, gridH);

    // Tracing reference underlay (below shapes, never exported)
    if (this._refImage) {
      ctx.save();
      ctx.globalAlpha = this._refOpacity;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this._refImage, ox, oy, gridW, gridH);
      ctx.restore();
    }

    // Onion skin (rendered before main shapes at 30% opacity)
    if (this._onionSkinData) {
      this._renderOnionSkin(ctx, ox, oy, z);
    }

    // Shapes — pass 1: full extent at reduced opacity (shows overhang dimmed)
    ctx.save();
    ctx.globalAlpha = 0.35;
    this._renderShapes(ctx, ox, oy, z);
    ctx.restore();

    // Shapes — pass 2: clipped to grid at full opacity (overwrites in-bounds pixels)
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, gridW, gridH);
    ctx.clip();
    this._renderShapes(ctx, ox, oy, z);
    ctx.restore();

    // Drag preview ghost
    if (this._dragPreview) this._renderDragPreview(ctx, ox, oy, z);

    // Selection highlight
    if (this._selectedShape) this._renderSelectionHighlight(ctx, ox, oy, z);

    // Grid
    this._renderGrid(ctx, ox, oy, z);
  }

  _renderBackground(ctx, ox, oy, gridW, gridH) {
    if (this._background.mode === 'chroma') {
      ctx.fillStyle = this._background.color;
      ctx.fillRect(ox, oy, gridW, gridH);
    } else {
      // Checkerboard for transparent — read colors from CSS theme variables
      const style = getComputedStyle(document.documentElement);
      const colorA = style.getPropertyValue('--checker-a').trim();
      const colorB = style.getPropertyValue('--checker-b').trim();
      const tileSize = Math.max(4, this.zoom);
      for (let y = 0; y < gridH; y += tileSize) {
        for (let x = 0; x < gridW; x += tileSize) {
          const dark = ((Math.floor(x / tileSize) + Math.floor(y / tileSize)) % 2) === 0;
          ctx.fillStyle = dark ? colorA : colorB;
          const w = Math.min(tileSize, gridW - x);
          const h = Math.min(tileSize, gridH - y);
          ctx.fillRect(ox + x, oy + y, w, h);
        }
      }
    }
  }

  _renderOnionSkin(ctx, ox, oy, z) {
    const { prev, next } = this._onionSkinData;
    // Neighbouring frames: previous blue, next red, at 30% opacity. Painted like
    // the frame itself, so their erase shapes show as holes, not filled blobs.
    for (const [shapes, tint] of [[prev, '#4488ff'], [next, '#ff4444']]) {
      if (!shapes?.length) continue;
      ctx.globalAlpha = 0.3;
      paintShapes(ctx, shapes, (c, shape) => { c.fillStyle = tint; this._renderOneShape(c, ox, oy, z, shape); });
      ctx.globalAlpha = 1;
    }
  }

  /** Paint one shape through the shared rules; the caller sets fillStyle. color2 null paints one colour. */
  _renderOneShape(ctx, ox, oy, z, shape, color2 = null) {
    rasterShape(shape.type, snapParams(shape.params), pen(ctx, ox, oy, z, color2));
  }

  _color2(shape) {
    return shape.params?.color2 != null ? this._resolveColor(shape.params.color2) : null;
  }

  _renderShapes(ctx, ox, oy, z) {
    if (z < 1) {
      // Fit large traces using nearest-neighbor sampling of the native raster.
      // Fractional fillRect edges would otherwise introduce seams between runs.
      const native = document.createElement('canvas');
      native.width = this.cellW; native.height = this.cellH;
      this._renderShapes(native.getContext('2d'), 0, 0, 1);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(native, ox, oy, this.cellW * z, this.cellH * z);
      return;
    }
    paintShapes(ctx, this._shapes, (ctx, shape) => {
      ctx.fillStyle = this._resolveColor(shape.color);
      if (shape.type === 'fill') {
        // The flood is computed by the export; the editor marks its seed pixel.
        ctx.globalAlpha = 0.5;
        ctx.fillRect(ox + shape.params.x * z, oy + shape.params.y * z, z, z);
        ctx.globalAlpha = 1;
        return;
      }
      this._renderOneShape(ctx, ox, oy, z, shape, this._color2(shape));
    });
  }

  _renderGrid(ctx, ox, oy, z) {
    if (z < 4) return;
    const gridW = this.cellW * z;
    const gridH = this.cellH * z;
    const style = getComputedStyle(document.documentElement);
    const gridColor = style.getPropertyValue('--grid-line').trim();
    const highlightColor = style.getPropertyValue('--grid-highlight').trim();

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let i = 0; i <= this.cellW; i++) {
      if (i > 0 && i < this.cellW && i % 8 === 0) continue;
      const pos = i * z;
      ctx.moveTo(ox + pos + 0.5, oy);
      ctx.lineTo(ox + pos + 0.5, oy + gridH);
    }
    for (let i = 0; i <= this.cellH; i++) {
      if (i > 0 && i < this.cellH && i % 8 === 0) continue;
      const pos = i * z;
      ctx.moveTo(ox, oy + pos + 0.5);
      ctx.lineTo(ox + gridW, oy + pos + 0.5);
    }
    ctx.stroke();

    // Quadrant boundaries every 8 pixels
    ctx.strokeStyle = highlightColor;
    ctx.beginPath();
    for (let i = 8; i < this.cellW; i += 8) {
      const pos = i * z;
      ctx.moveTo(ox + pos + 0.5, oy);
      ctx.lineTo(ox + pos + 0.5, oy + gridH);
    }
    for (let i = 8; i < this.cellH; i += 8) {
      const pos = i * z;
      ctx.moveTo(ox, oy + pos + 0.5);
      ctx.lineTo(ox + gridW, oy + pos + 0.5);
    }
    ctx.stroke();
  }

  _renderDragPreview(ctx, ox, oy, z) {
    const { shape, dx, dy } = this._dragPreview;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = this._resolveColor(shape.color);
    this._renderOneShape(ctx, ox, oy, z, movedShape(shape, dx, dy), this._color2(shape));
    ctx.restore();
  }

  _renderSelectionHighlight(ctx, ox, oy, z) {
    const s = this._selectedShape;
    const p = s.params;
    let bx, by, bw, bh;
    switch (s.type) {
      case 'point':
        bx = p.x; by = p.y; bw = 1; bh = 1;
        break;
      case 'rect':
        bx = p.x; by = p.y; bw = p.w; bh = p.h;
        break;
      case 'circle':
        bx = p.cx - p.r; by = p.cy - p.r;
        bw = p.r * 2 + 1; bh = p.r * 2 + 1;
        break;
      case 'ellipse':
        bx = p.cx - p.rx; by = p.cy - p.ry;
        bw = p.rx * 2 + 1; bh = p.ry * 2 + 1;
        break;
      case 'line':
        bx = Math.min(p.x1, p.x2); by = Math.min(p.y1, p.y2);
        bw = Math.abs(p.x2 - p.x1) + 1; bh = Math.abs(p.y2 - p.y1) + 1;
        break;
      case 'polygon':
      case 'polyline': {
        const xs = (p.points || []).map(pt => pt.x);
        const ys = (p.points || []).map(pt => pt.y);
        if (xs.length === 0) return;
        bx = Math.min(...xs); by = Math.min(...ys);
        bw = Math.max(...xs) - bx + 1; bh = Math.max(...ys) - by + 1;
        break;
      }
      default:
        return;
    }
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 80, 0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(ox + bx * z - 1, oy + by * z - 1, bw * z + 2, bh * z + 2);
    ctx.restore();
  }

  /* -- Color resolution -- */

  _resolveColor(ref) {
    if (!ref) return '#ff00ff';
    if (ref.startsWith('#')) return ref;
    return this._palette[ref] || '#ff00ff';
  }

  /* -- Coordinate mapping -- */

  _canvasToPixel(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    const gridW = this.cellW * this.zoom;
    const gridH = this.cellH * this.zoom;
    const ox = Math.floor((this.canvas.width - gridW) / 2) + this.panX;
    const oy = Math.floor((this.canvas.height - gridH) / 2) + this.panY;
    const px = Math.floor((cx - ox) / this.zoom);
    const py = Math.floor((cy - oy) / this.zoom);
    return { x: px, y: py, inBounds: px >= 0 && px < this.cellW && py >= 0 && py < this.cellH };
  }

  /* -- Resize -- */

  _resize(container) {
    const w = container.clientWidth;
    const h = container.clientHeight;
    this.canvas.width = w;
    this.canvas.height = h;
    this.render();
  }

  /* -- Events -- */

  _bindEvents(container) {
    this._abortController = new AbortController();
    const sig = { signal: this._abortController.signal };

    window.addEventListener('resize', () => this._resize(container), sig);

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (this._spaceHeld && e.button === 0)) {
        this._isPanning = true;
        this._panStartX = e.clientX - this.panX;
        this._panStartY = e.clientY - this.panY;
        e.preventDefault();
        return;
      }
      if (e.button === 0 && !this._spaceHeld) {
        const px = this._canvasToPixel(e.clientX, e.clientY);
        if (px.inBounds && this._pixelClickCb) {
          this._isMouseDown = true;
          this._pixelClickCb(px.x, px.y, e);
        }
      }
    }, sig);

    this.canvas.addEventListener('mousemove', (e) => {
      if (this._isPanning) {
        this.panX = e.clientX - this._panStartX;
        this.panY = e.clientY - this._panStartY;
        this.render();
        return;
      }
      const px = this._canvasToPixel(e.clientX, e.clientY);
      if (this._cursorMoveCb) this._cursorMoveCb(px.x, px.y, px.inBounds);
      if (px.inBounds && this._pixelMoveCb) this._pixelMoveCb(px.x, px.y, e);
    }, sig);

    // Window-level mouseup so drag-release outside canvas is captured
    window.addEventListener('mouseup', (e) => {
      if (this._isPanning) {
        this._isPanning = false;
        return;
      }
      if (e.button === 0 && this._isMouseDown) {
        this._isMouseDown = false;
        if (this._pixelUpCb) {
          const px = this._canvasToPixel(e.clientX, e.clientY);
          const x = Math.max(0, Math.min(this.cellW - 1, px.x));
          const y = Math.max(0, Math.min(this.cellH - 1, px.y));
          this._pixelUpCb(x, y, e);
        }
      }
    }, sig);

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -1 : 1;
      this.setZoom(this.zoom + delta * Math.max(1, Math.floor(this.zoom / 8)));
    }, { passive: false, signal: this._abortController.signal });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault(), sig);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat) {
        this._spaceHeld = true;
        this.canvas.style.cursor = 'grab';
      }
    }, sig);
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this._spaceHeld = false;
        this.canvas.style.cursor = 'crosshair';
      }
    }, sig);
  }
}

/** A copy of shape offset by (dx, dy), for the drag ghost. */
function movedShape(shape, dx, dy) {
  const p = { ...shape.params };
  for (const [kx, ky] of [['x', 'y'], ['cx', 'cy'], ['x1', 'y1'], ['x2', 'y2']]) {
    if (typeof p[kx] === 'number') p[kx] += dx;
    if (typeof p[ky] === 'number') p[ky] += dy;
  }
  if (Array.isArray(p.points)) p.points = p.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
  return { ...shape, params: p };
}
