import { renderCellNative } from './cell-raster.js';

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
    if (!rect.width || !rect.height) return; // Hidden tabs have no usable layout yet.
    const style = getComputedStyle(mount);
    const paddingX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const paddingY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const canvas = this._canvas.getBoundingClientRect();
    const container = this._container.getBoundingClientRect();
    const reservedY = Math.max(0, container.height - canvas.height);
    const reservedX = Math.max(0, container.width - canvas.width);
    const available = Math.max(1, Math.min(rect.width - paddingX - reservedX, rect.height - paddingY - reservedY));
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
  setCells(cells) { this._cells = cells || {}; if (this._canvas) this._renderFrame(); }
  setActiveCell(ref) { this._activeCell = ref; }
  onOnionSkin(cb) { this._onionCb = cb; }
  setFps(fps) {
    if (!Number.isFinite(fps) || fps <= 0) return;
    this._fps = fps;
    if (this._fpsLabel) this._fpsLabel.textContent = `${fps} FPS`;
    if (this._fpsSlider) this._fpsSlider.value = String(fps);
    if (this._playing) this._startInterval();
  }

  /**
   * Set the group's cell refs to animate.
   * @param {string[]} frames - Array of cell ref strings
   */
  setFrames(frames) {
    this._frames = frames || [];
    if (!this._frames.length) this.pause();
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
    this._fpsSlider = fpsSlider;
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
    const native = renderCellNative(shapes, this._cellW, this._cellH, ref => this._resolveColor(ref));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(native, 0, 0, this._canvas.width, this._canvas.height);
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
