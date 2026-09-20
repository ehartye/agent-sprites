// Mirrors server/engine/patterns.js so the live view matches the export.
const PATTERNS = {
  checker: (x, y) => (x + y) % 2 === 0,
  stripes: (x, y) => y % 2 === 0,
  sparse: (x, y) => x % 2 === 0 && y % 2 === 0,
  scatter: (x, y) => ((x * 3 + y * 5) % 7) === 0,
};

/**
 * Animation preview — cycles through group cells at configurable FPS,
 * with onion skin overlay for editing context.
 */

const DEFAULT_PREVIEW_SIZE = 128;
const DEFAULT_FPS = 8;

export class AnimationPreview {
  constructor(opts = {}) {
    this._canvas = null;
    this._ctx = null;
    this._container = null;

    this._cells = {};
    this._cellW = 16;
    this._cellH = 16;
    this._palette = {};
    this._frames = [];
    this._currentFrame = 0;
    this._fps = DEFAULT_FPS;
    this._playing = false;
    this._intervalId = null;

    this._onionSkin = false;
    this._activeCell = null;

    this._onionCb = null;

    this._mountId = opts.mountId ?? 'anim-panel';
    this._size = opts.size ?? DEFAULT_PREVIEW_SIZE;
    this._showOnionSkin = opts.showOnionSkin ?? true;
    this._responsive = opts.responsive ?? false;
    this._title = opts.title ?? 'Animation';
  }

  init() {
    this._container = this._createUI();
    const mount = document.getElementById(this._mountId);
    if (!mount) return;
    mount.appendChild(this._container);
    if (this._responsive) this._attachResize();
  }

  /** Resize the canvas to fit the current mount (when responsive). */
  fitToMount() {
    if (!this._canvas) return;
    const mount = document.getElementById(this._mountId);
    if (!mount) return;
    const rect = mount.getBoundingClientRect();
    const reserved = 80; // rough space for controls + header
    const available = Math.max(64, Math.min(rect.width, rect.height - reserved));
    this._size = available;
    if (this._applyCanvasSize()) this._renderFrame();
  }

  /** Snap the canvas to an integer pixel scale of the cell dims. Returns true if it changed. */
  _applyCanvasSize() {
    const s = Math.max(1, Math.floor(this._size / Math.max(this._cellW, this._cellH)));
    const w = s * this._cellW, h = s * this._cellH;
    if (this._canvas.width === w && this._canvas.height === h) return false;
    this._canvas.width = w;
    this._canvas.height = h;
    this._canvas.style.width = `${w}px`;
    this._canvas.style.height = `${h}px`;
    return true;
  }

  _attachResize() {
    const ro = new ResizeObserver(() => this.fitToMount());
    const mount = document.getElementById(this._mountId);
    if (mount) ro.observe(mount);
    // Initial fit once layout settles.
    requestAnimationFrame(() => this.fitToMount());
  }

  setPalette(paletteMap) { this._palette = paletteMap; }
  setCellSize(w, h = w) {
    this._cellW = w;
    this._cellH = h;
    if (this._canvas) this._applyCanvasSize();
  }
  setCells(cells) { this._cells = cells || {}; }
  setActiveCell(ref) { this._activeCell = ref; }
  onOnionSkin(cb) { this._onionCb = cb; }

  /**
   * Set the group's cell refs to animate.
   * @param {string[]} frames - Array of cell ref strings
   */
  setFrames(frames) {
    this._frames = frames || [];
    this._currentFrame = 0;
    this._updateFrameCounter();
    this._renderFrame();
    this._container.classList.toggle('has-frames', this._frames.length > 0);
  }

  /* -- Playback controls -- */

  play() {
    if (this._frames.length === 0) return;
    this._playing = true;
    this._updatePlayState();
    this._startInterval();
  }

  pause() {
    this._playing = false;
    this._updatePlayState();
    this._stopInterval();
  }

  stop() {
    this._playing = false;
    this._currentFrame = 0;
    this._updatePlayState();
    this._stopInterval();
    this._updateFrameCounter();
    this._renderFrame();
  }

  /* -- Onion skin -- */

  /**
   * Get onion skin data for the editor overlay.
   * Returns { prev, next } where each is an array of shapes at 30% opacity,
   * or null if onion skin is off or cell isn't in the current group.
   */
  getOnionSkinData() {
    if (!this._onionSkin || this._frames.length < 2) return null;
    const idx = this._frames.indexOf(this._activeCell);
    if (idx === -1) return null;

    const prevRef = idx > 0 ? this._frames[idx - 1] : this._frames[this._frames.length - 1];
    const nextRef = idx < this._frames.length - 1 ? this._frames[idx + 1] : this._frames[0];

    return {
      prev: this._getCellShapes(prevRef),
      next: this._getCellShapes(nextRef),
    };
  }

  _getCellShapes(ref) {
    const cell = this._cells[ref];
    if (!cell || !cell.shapes) return [];
    return cell.shapes.filter(s => s.visible !== false);
  }

  /* -- Internal: UI creation -- */

  _createUI() {
    const container = document.createElement('div');
    container.id = 'animation-preview';

    const header = document.createElement('div');
    header.className = 'anim-header';
    header.textContent = this._title;
    container.appendChild(header);

    this._canvas = document.createElement('canvas');
    this._canvas.className = 'anim-canvas';
    this._ctx = this._canvas.getContext('2d');
    this._applyCanvasSize();
    container.appendChild(this._canvas);

    // Controls
    const controls = document.createElement('div');
    controls.className = 'anim-controls';

    const playBtn = document.createElement('button');
    playBtn.textContent = 'Play';
    playBtn.className = 'anim-btn anim-play';
    playBtn.addEventListener('click', () => this._playing ? this.pause() : this.play());
    controls.appendChild(playBtn);
    this._playBtn = playBtn;

    const stopBtn = document.createElement('button');
    stopBtn.textContent = 'Stop';
    stopBtn.className = 'anim-btn';
    stopBtn.addEventListener('click', () => this.stop());
    controls.appendChild(stopBtn);

    container.appendChild(controls);

    // Frame counter
    const frameInfo = document.createElement('div');
    frameInfo.className = 'anim-frame-info';
    frameInfo.textContent = '— / —';
    container.appendChild(frameInfo);
    this._frameInfo = frameInfo;

    // FPS slider
    const fpsRow = document.createElement('div');
    fpsRow.className = 'anim-fps-row';

    const fpsLabel = document.createElement('span');
    fpsLabel.className = 'anim-fps-label';
    fpsLabel.textContent = `${this._fps} FPS`;
    this._fpsLabel = fpsLabel;

    const fpsSlider = document.createElement('input');
    fpsSlider.type = 'range';
    fpsSlider.min = '1';
    fpsSlider.max = '30';
    fpsSlider.value = String(this._fps);
    fpsSlider.className = 'anim-fps-slider';
    fpsSlider.addEventListener('input', () => {
      this._fps = parseInt(fpsSlider.value, 10);
      this._fpsLabel.textContent = `${this._fps} FPS`;
      if (this._playing) {
        this._stopInterval();
        this._startInterval();
      }
    });

    fpsRow.appendChild(fpsLabel);
    fpsRow.appendChild(fpsSlider);
    container.appendChild(fpsRow);

    // Onion skin toggle (optional)
    if (!this._showOnionSkin) return container;
    const onionRow = document.createElement('div');
    onionRow.className = 'anim-onion-row';

    const onionCheck = document.createElement('input');
    onionCheck.type = 'checkbox';
    onionCheck.id = 'onion-skin-toggle';
    onionCheck.addEventListener('change', () => {
      this._onionSkin = onionCheck.checked;
      if (this._onionCb) this._onionCb(this.getOnionSkinData());
    });

    const onionLabel = document.createElement('label');
    onionLabel.htmlFor = 'onion-skin-toggle';
    onionLabel.textContent = 'Onion Skin';

    onionRow.appendChild(onionCheck);
    onionRow.appendChild(onionLabel);
    container.appendChild(onionRow);

    return container;
  }

  /* -- Internal: rendering -- */

  _renderFrame() {
    const ctx = this._ctx;
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

    // Checkerboard background — one square per pixel, matching the cell grid
    const style = getComputedStyle(document.documentElement);
    const colorA = style.getPropertyValue('--checker-a').trim();
    const colorB = style.getPropertyValue('--checker-b').trim();
    const tileSize = this._canvas.width / this._cellW;
    for (let row = 0; row < this._cellH; row++) {
      for (let col = 0; col < this._cellW; col++) {
        ctx.fillStyle = ((row + col) % 2 === 0) ? colorA : colorB;
        ctx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);
      }
    }

    if (this._frames.length === 0) return;

    const ref = this._frames[this._currentFrame];
    const shapes = this._getCellShapes(ref);
    const scale = this._canvas.width / this._cellW;

    for (const shape of shapes) {
      ctx.fillStyle = this._resolveColor(shape.color);
      const p = shape.params;
      this._fill = p.pattern && p.filled !== false && p.color2 != null && PATTERNS[p.pattern]
        ? { test: PATTERNS[p.pattern], base: ctx.fillStyle, color2: this._resolveColor(p.color2) }
        : null;

      switch (shape.type) {
        case 'point':
          ctx.fillRect(p.x * scale, p.y * scale, scale, scale);
          break;
        case 'line':
          this._drawLine(ctx, scale, p.x1, p.y1, p.x2, p.y2);
          break;
        case 'rect':
          if (p.filled && this._fill) {
            for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) this._fillPx(ctx, scale, x, y);
          } else if (p.filled) {
            ctx.fillRect(p.x * scale, p.y * scale, p.w * scale, p.h * scale);
          } else {
            ctx.fillRect(p.x * scale, p.y * scale, p.w * scale, scale);
            ctx.fillRect(p.x * scale, (p.y + p.h - 1) * scale, p.w * scale, scale);
            ctx.fillRect(p.x * scale, p.y * scale, scale, p.h * scale);
            ctx.fillRect((p.x + p.w - 1) * scale, p.y * scale, scale, p.h * scale);
          }
          break;
        case 'circle':
          if (p.filled) this._fillCircle(ctx, scale, p.cx, p.cy, p.r);
          break;
        case 'ellipse':
          if (p.filled) this._fillEllipse(ctx, scale, p.cx, p.cy, p.rx, p.ry);
          break;
        case 'polygon':
        case 'polyline': {
          const pts = p.points || [];
          const close = shape.type === 'polygon';
          if (close && p.filled && pts.length >= 3) {
            let minY = Infinity, maxY = -Infinity;
            for (const pt of pts) { minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y); }
            for (let y = minY; y <= maxY; y++) {
              const xs = [];
              for (let i = 0; i < pts.length; i++) {
                const a = pts[i], b = pts[(i + 1) % pts.length];
                if (a.y === b.y) continue;
                if (y >= Math.min(a.y, b.y) && y < Math.max(a.y, b.y)) {
                  xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
                }
              }
              xs.sort((m, n) => m - n);
              for (let i = 0; i + 1 < xs.length; i += 2) {
                for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++) {
                  this._fillPx(ctx, scale, x, y);
                }
              }
            }
          }
          for (let i = 0; i < pts.length - 1; i++) {
            this._drawLine(ctx, scale, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
          }
          if (close && pts.length >= 3) {
            this._drawLine(ctx, scale, pts[pts.length - 1].x, pts[pts.length - 1].y, pts[0].x, pts[0].y);
          }
          break;
        }
      }
    }
  }

  /** Filled circle with the export's half-pixel threshold (rows 3,5,7,7,7,5,3 at r=3). */
  _fillCircle(ctx, scale, cx, cy, r) {
    const limit = r >= 2 ? (r + 0.5) * (r + 0.5) : r * r;
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= limit) this._fillPx(ctx, scale, cx + x, cy + y);
      }
    }
  }

  /** One logical fill pixel, honoring the armed two-color pattern. */
  _fillPx(ctx, scale, px, py) {
    const f = this._fill;
    if (f && f.test(px, py)) {
      ctx.fillStyle = f.color2;
      ctx.fillRect(px * scale, py * scale, scale, scale);
      ctx.fillStyle = f.base;
    } else {
      ctx.fillRect(px * scale, py * scale, scale, scale);
    }
  }

  /**
   * Filled ellipse rasterizer with N/S 1px tip trim. Matches the server
   * renderer so preview = export.
   */
  _fillEllipse(ctx, scale, cx, cy, rx, ry) {
    if (rx <= 0 || ry <= 0) return;
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
        this._fillPx(ctx, scale, cx + x, cy + y);
      }
    }
  }

  _drawLine(ctx, scale, x1, y1, x2, y2) {
    // round first: a fractional endpoint never satisfies the exact stop test
    x1 = Math.round(x1); y1 = Math.round(y1); x2 = Math.round(x2); y2 = Math.round(y2);
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;
    let x = x1, y = y1;
    while (true) {
      ctx.fillRect(x * scale, y * scale, scale, scale);
      if (x === x2 && y === y2) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  _resolveColor(ref) {
    if (!ref) return '#ff00ff';
    if (ref.startsWith('#')) return ref;
    return this._palette[ref] || '#ff00ff';
  }

  /* -- Internal: playback -- */

  _startInterval() {
    this._stopInterval();
    this._intervalId = setInterval(() => {
      this._currentFrame = (this._currentFrame + 1) % this._frames.length;
      this._updateFrameCounter();
      this._renderFrame();
    }, 1000 / this._fps);
  }

  _stopInterval() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  _updatePlayState() {
    if (this._playBtn) {
      this._playBtn.textContent = this._playing ? 'Pause' : 'Play';
    }
  }

  _updateFrameCounter() {
    if (this._frameInfo) {
      if (this._frames.length === 0) {
        this._frameInfo.textContent = '— / —';
      } else {
        this._frameInfo.textContent = `${this._currentFrame + 1} / ${this._frames.length}`;
      }
    }
  }
}
