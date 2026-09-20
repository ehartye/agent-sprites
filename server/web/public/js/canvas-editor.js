// Mirrors server/engine/patterns.js so the live view matches the export.
const PATTERNS = {
  checker: (x, y) => (x + y) % 2 === 0,
  stripes: (x, y) => y % 2 === 0,
  sparse: (x, y) => x % 2 === 0 && y % 2 === 0,
  scatter: (x, y) => ((x * 3 + y * 5) % 7) === 0,
};

/**
 * Canvas editor — pixel grid with zoom, pan, and shape rendering.
 * Mirrors server-side CanvasRenderer drawing logic for client-side preview.
 */

const MIN_ZOOM = 2;
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
    if (!refInfo) {
      this._refImage = null;
      this.render();
      return;
    }
    this._refOpacity = refInfo.opacity ?? 0.35;
    const img = new window.Image();
    img.onload = () => { this._refImage = img; this.render(); };
    img.onerror = () => { this._refImage = null; this.render(); };
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
    // Previous frame: blue-tinted at 30% opacity
    if (prev && prev.length > 0) {
      ctx.globalAlpha = 0.3;
      for (const shape of prev) {
        ctx.fillStyle = '#4488ff';
        this._renderOneShape(ctx, ox, oy, z, shape);
      }
      ctx.globalAlpha = 1;
    }
    // Next frame: red-tinted at 30% opacity
    if (next && next.length > 0) {
      ctx.globalAlpha = 0.3;
      for (const shape of next) {
        ctx.fillStyle = '#ff4444';
        this._renderOneShape(ctx, ox, oy, z, shape);
      }
      ctx.globalAlpha = 1;
    }
  }

  /** Render a single shape without setting fillStyle (caller sets it). */
  _renderOneShape(ctx, ox, oy, z, shape) {
    const p = shape.params;
    this._setFill(ctx, p);
    switch (shape.type) {
      case 'point':
        ctx.fillRect(ox + p.x * z, oy + p.y * z, z, z);
        break;
      case 'line':
        this._drawLine(ctx, ox, oy, z, p.x1, p.y1, p.x2, p.y2);
        break;
      case 'rect':
        if (p.filled && this._fill) {
          for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) this._fillPx(ctx, ox, oy, z, x, y);
        } else if (p.filled) {
          ctx.fillRect(ox + p.x * z, oy + p.y * z, p.w * z, p.h * z);
        } else {
          ctx.fillRect(ox + p.x * z, oy + p.y * z, p.w * z, z);
          ctx.fillRect(ox + p.x * z, oy + (p.y + p.h - 1) * z, p.w * z, z);
          ctx.fillRect(ox + p.x * z, oy + p.y * z, z, p.h * z);
          ctx.fillRect(ox + (p.x + p.w - 1) * z, oy + p.y * z, z, p.h * z);
        }
        break;
      case 'circle':
        if (p.filled) this._fillCircle(ctx, ox, oy, z, p.cx, p.cy, p.r);
        break;
      case 'ellipse':
        this._drawEllipse(ctx, ox, oy, z, p.cx, p.cy, p.rx, p.ry, p.filled);
        break;
      case 'polygon':
        this._drawPolygon(ctx, ox, oy, z, p.points, p.filled, true);
        break;
      case 'polyline':
        this._drawPolygon(ctx, ox, oy, z, p.points, false, false);
        break;
    }
  }

  _renderShapes(ctx, ox, oy, z) {
    for (const shape of this._shapes) {
      const color = this._resolveColor(shape.color);
      ctx.fillStyle = color;

      const p = shape.params;
      this._setFill(ctx, p);
      switch (shape.type) {
        case 'point':
          ctx.fillRect(ox + p.x * z, oy + p.y * z, z, z);
          break;
        case 'line':
          this._drawLine(ctx, ox, oy, z, p.x1, p.y1, p.x2, p.y2);
          break;
        case 'rect':
          if (p.filled && this._fill) {
            for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) this._fillPx(ctx, ox, oy, z, x, y);
          } else if (p.filled) {
            ctx.fillRect(ox + p.x * z, oy + p.y * z, p.w * z, p.h * z);
          } else {
            ctx.fillRect(ox + p.x * z, oy + p.y * z, p.w * z, z);
            ctx.fillRect(ox + p.x * z, oy + (p.y + p.h - 1) * z, p.w * z, z);
            ctx.fillRect(ox + p.x * z, oy + p.y * z, z, p.h * z);
            ctx.fillRect(ox + (p.x + p.w - 1) * z, oy + p.y * z, z, p.h * z);
          }
          break;
        case 'circle':
          this._drawCircle(ctx, ox, oy, z, p.cx, p.cy, p.r, p.filled);
          break;
        case 'ellipse':
          this._drawEllipse(ctx, ox, oy, z, p.cx, p.cy, p.rx, p.ry, p.filled);
          break;
        case 'fill':
          // Fill is computed server-side; we just render the resulting pixel data
          // For preview, we show a single pixel marker
          ctx.globalAlpha = 0.5;
          ctx.fillRect(ox + p.x * z, oy + p.y * z, z, z);
          ctx.globalAlpha = 1;
          break;
        case 'polygon':
          this._drawPolygon(ctx, ox, oy, z, p.points, p.filled, true);
          break;
        case 'polyline':
          this._drawPolygon(ctx, ox, oy, z, p.points, false, false);
          break;
      }
    }
  }

  /** Arm a two-color pattern fill for the shape about to be drawn (fill only, never outlines). */
  _setFill(ctx, p) {
    this._fill = p && p.pattern && p.filled !== false && p.color2 != null && PATTERNS[p.pattern]
      ? { test: PATTERNS[p.pattern], base: ctx.fillStyle, color2: this._resolveColor(p.color2) }
      : null;
  }

  /** One logical fill pixel at (px, py), honoring the armed pattern. */
  _fillPx(ctx, ox, oy, z, px, py) {
    const f = this._fill;
    if (f && f.test(px, py)) {
      ctx.fillStyle = f.color2;
      ctx.fillRect(ox + px * z, oy + py * z, z, z);
      ctx.fillStyle = f.base;
    } else {
      ctx.fillRect(ox + px * z, oy + py * z, z, z);
    }
  }

  // Scanline even-odd fill + Bresenham outline; mirrors the server renderer.
  _drawPolygon(ctx, ox, oy, z, points, filled, close) {
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
          for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++) {
            this._fillPx(ctx, ox, oy, z, x, y);
          }
        }
      }
    }
    for (let i = 0; i < points.length - 1; i++) {
      this._drawLine(ctx, ox, oy, z, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
    }
    if (close && points.length >= 3) {
      const last = points[points.length - 1];
      this._drawLine(ctx, ox, oy, z, last.x, last.y, points[0].x, points[0].y);
    }
  }

  _drawLine(ctx, ox, oy, z, x1, y1, x2, y2) {
    // round first: a fractional endpoint never satisfies the exact stop test
    x1 = Math.round(x1); y1 = Math.round(y1); x2 = Math.round(x2); y2 = Math.round(y2);
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;
    let x = x1, y = y1;
    while (true) {
      ctx.fillRect(ox + x * z, oy + y * z, z, z);
      if (x === x2 && y === y2) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  /** Filled circle with the export's half-pixel threshold: rows 3,5,7,7,7,5,3 at r=3, no nubs. */
  _fillCircle(ctx, ox, oy, z, cx, cy, r) {
    const limit = r >= 2 ? (r + 0.5) * (r + 0.5) : r * r;
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= limit) this._fillPx(ctx, ox, oy, z, cx + x, cy + y);
      }
    }
  }

  _drawCircle(ctx, ox, oy, z, cx, cy, r, filled) {
    if (filled) {
      this._fillCircle(ctx, ox, oy, z, cx, cy, r);
    } else {
      let x = r, y = 0, err = 1 - r;
      while (x >= y) {
        const pts = [
          [cx + x, cy + y], [cx + y, cy + x],
          [cx - y, cy + x], [cx - x, cy + y],
          [cx - x, cy - y], [cx - y, cy - x],
          [cx + y, cy - x], [cx + x, cy - y],
        ];
        for (const [px, py] of pts) {
          ctx.fillRect(ox + px * z, oy + py * z, z, z);
        }
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

  _drawEllipse(ctx, ox, oy, z, cx, cy, rx, ry, filled) {
    if (rx <= 0 || ry <= 0) return;
    if (filled) {
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
          this._fillPx(ctx, ox, oy, z, cx + x, cy + y);
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
        if (!drawn.has(key)) { drawn.add(key); ctx.fillRect(ox + px * z, oy + py * z, z, z); }
      }
    }
  }

  _renderGrid(ctx, ox, oy, z) {
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
    const p = shape.params;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = this._resolveColor(shape.color);
    this._setFill(ctx, shape.params);
    switch (shape.type) {
      case 'point':
        ctx.fillRect(ox + (p.x + dx) * z, oy + (p.y + dy) * z, z, z);
        break;
      case 'rect':
        if (p.filled) {
          ctx.fillRect(ox + (p.x + dx) * z, oy + (p.y + dy) * z, p.w * z, p.h * z);
        } else {
          ctx.fillRect(ox + (p.x + dx) * z, oy + (p.y + dy) * z, p.w * z, z);
          ctx.fillRect(ox + (p.x + dx) * z, oy + (p.y + p.h - 1 + dy) * z, p.w * z, z);
          ctx.fillRect(ox + (p.x + dx) * z, oy + (p.y + dy) * z, z, p.h * z);
          ctx.fillRect(ox + (p.x + p.w - 1 + dx) * z, oy + (p.y + dy) * z, z, p.h * z);
        }
        break;
      case 'circle':
        this._drawCircle(ctx, ox, oy, z, p.cx + dx, p.cy + dy, p.r, p.filled);
        break;
      case 'ellipse':
        this._drawEllipse(ctx, ox, oy, z, p.cx + dx, p.cy + dy, p.rx, p.ry, p.filled);
        break;
      case 'line':
        this._drawLine(ctx, ox, oy, z, p.x1 + dx, p.y1 + dy, p.x2 + dx, p.y2 + dy);
        break;
      case 'polygon':
      case 'polyline': {
        const moved = (p.points || []).map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
        this._drawPolygon(ctx, ox, oy, z, moved, p.filled, shape.type === 'polygon');
        break;
      }
    }
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
