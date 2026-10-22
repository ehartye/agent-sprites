import { renderCellNative } from './cell-raster.js';
import { ThumbnailCache } from './thumbnail-cache.js';
/**
 * Cell navigator — thumbnail strip at the bottom showing all cells.
 * Click to switch active cell, filter by group.
 */

export class CellNavigator {
  constructor({ cacheEntries, cacheBytes } = {}) {
    this._grid = { rows: 0, cols: 0 };
    this._cellW = 16;
    this._cellH = 16;
    this._palette = {};
    this._background = { mode: 'transparent' };
    this._cells = {};
    this._activeRef = '0,0';
    this._filter = null; // null = all, or array of cell refs

    this._selectCb = null;
    // Playback can repeat a ref. Each occurrence owns its display/visibility;
    // the raster cache remains shared by canonical cell ref.
    this._thumbs = new Set();
    this._thumbsByRef = new Map();
    this._visible = new Set();
    this._painted = new Set();
    this._timer = null;
    this._observer = null;
    this._observerActive = false;
    this._generation = 0;
    this._cache = new ThumbnailCache(cacheEntries, cacheBytes);
    this._cellIdentities = new Map();
    this._renderedRefs = [];
    this._strip = null;
    this._fallbackCleanup = null;
    this._checkerKey = null;
    this._paletteKey = '[]';
    this._backgroundKey = JSON.stringify(this._background);
  }

  /**
   * @param {object} opts
   * @param {Function} opts.onSelect - Called with cell ref string when clicked
   */
  init({ onSelect }) {
    this._selectCb = onSelect;
  }

  setGrid(rows, cols, cellW = 16, cellH = cellW) {
    if (rows !== this._grid.rows || cols !== this._grid.cols || cellW !== this._cellW || cellH !== this._cellH) this._stopObserving();
    if (cellW !== this._cellW || cellH !== this._cellH) this._invalidateAll();
    this._grid = { rows, cols };
    this._cellW = cellW;
    this._cellH = cellH;
  }

  setBackground(background) {
    const value = background ?? { mode: 'transparent' }, key = JSON.stringify(value);
    if (key !== this._backgroundKey) this._invalidateAll();
    this._backgroundKey = key;
    this._background = { ...value };
  }

  setPalette(paletteMap) {
    const palette = paletteMap || {};
    const key = JSON.stringify(Object.entries(palette).sort(([a], [b]) => a.localeCompare(b)));
    if (key !== this._paletteKey) this._invalidateAll();
    this._paletteKey = key;
    this._palette = { ...palette };
  }

  setCells(cells) {
    this._cells = cells || {};
    this._cancelWork();
    const identities = new Map();
    for (const [ref, cell] of Object.entries(this._cells)) {
      const previous = this._cellIdentities.get(ref);
      const shapes = Array.isArray(cell?.shapes) ? cell.shapes : null;
      const unchanged = previous && previous.lighting === cell?.lighting &&
        (previous.shapes === null ? shapes === null : shapes !== null && previous.shapes.length === shapes.length &&
          previous.shapes.every((shape, i) => shape === shapes[i]));
      if (unchanged) identities.set(ref, previous);
      else {
        this._invalidateRef(ref);
        // View filtering creates fresh cell/array wrappers. Only ordered shape
        // identities and lighting affect pixels; in-place edits use refresh().
        identities.set(ref, { shapes: shapes ? [...shapes] : null, lighting: cell?.lighting });
      }
    }
    for (const ref of this._cellIdentities.keys()) if (!identities.has(ref)) this._invalidateRef(ref);
    this._cellIdentities = identities;
    this._schedule();
  }

  setActive(ref) {
    this._activeRef = ref;
    this._updateHighlight();
    if (this._fallbackCleanup) this._updateFallback();
    this._schedule();
  }

  /**
   * Filter to show only specific cells (e.g., cells in a group).
   * Pass null to show all cells.
   * @param {string[]|null} refs
   */
  setFilter(refs) {
    const unchanged = (this._filter === null && refs === null) ||
      (this._filter && refs && this._filter.length === refs.length && this._filter.every((ref, i) => ref === refs[i]));
    if (unchanged && this._observerActive) return;
    this._filter = refs ? [...refs] : null;
    this.render();
  }

  render() {
    const strip = document.getElementById('cell-strip');
    if (!strip) return;
    this._checkTheme();
    const refs = this._filter || this._allRefs();
    if (strip === this._strip && this._renderedCellW === this._cellW && this._renderedCellH === this._cellH &&
        refs.length === this._renderedRefs.length && refs.every((ref, i) => ref === this._renderedRefs[i]) &&
        strip.children.length === refs.length && this._observerActive) {
      this._updateLabels();
      this._schedule();
      return;
    }
    this._stopObserving();
    for (const thumb of this._thumbs) this._releaseDisplay(thumb);
    this._thumbs.clear();
    this._thumbsByRef.clear();
    this._visible.clear();
    this._painted.clear();
    strip.innerHTML = '';
    this._strip = strip;
    this._viewport = this._findViewport(strip);
    this._renderedRefs = [...refs];
    this._renderedCellW = this._cellW;
    this._renderedCellH = this._cellH;

    for (const ref of refs) {
      const thumb = document.createElement('div');
      thumb.className = 'cell-thumb';
      thumb.dataset.ref = ref;
      if (ref === this._activeRef) thumb.classList.add('active');

      // Thumbnail canvas for cell preview
      const canvas = document.createElement('canvas');
      const fit = 64 / Math.max(this._cellW, this._cellH);
      const scale = fit >= 1 ? Math.floor(fit) : fit;
      this._sizeCanvas(canvas);
      canvas.style.width = `${this._cellW * scale}px`;
      canvas.style.height = `${this._cellH * scale}px`;
      canvas.className = 'cell-thumb-canvas';
      thumb.appendChild(canvas);

      const label = document.createElement('span');
      label.className = 'label';
      const cell = this._cells[ref];
      label.textContent = cell?.name || ref;
      thumb.appendChild(label);

      thumb.addEventListener('click', () => {
        this.setActive(ref);
        if (this._selectCb) this._selectCb(ref);
      });

      strip.appendChild(thumb);
      this._thumbs.add(thumb);
      if (!this._thumbsByRef.has(ref)) this._thumbsByRef.set(ref, new Set());
      this._thumbsByRef.get(ref).add(thumb);
    }
    this._observerActive = true;
    if (typeof IntersectionObserver === 'function') {
      const generation = this._generation;
      this._observer = new IntersectionObserver(entries => {
        if (generation !== this._generation) return;
        for (const { target, isIntersecting } of entries) {
          if (!this._thumbs.has(target)) continue;
          if (isIntersecting) this._visible.add(target);
          else {
            this._visible.delete(target);
            this._releaseDisplay(target);
          }
        }
        this._schedule();
      }, { root: this._viewport });
      for (const thumb of this._thumbs) this._observer.observe(thumb);
    } else {
      const update = () => this._updateFallback();
      this._viewport.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
      this._fallbackCleanup = () => {
        this._viewport.removeEventListener('scroll', update);
        window.removeEventListener('resize', update);
      };
      update();
    }
  }

  _schedule() {
    if (this._timer !== null) return;
    if (!this._nextThumb()) return;
    const generation = this._generation;
    this._timer = setTimeout(() => {
      this._timer = null;
      if (generation !== this._generation) return;
      const thumb = this._nextThumb();
      if (thumb) {
        const ref = thumb.dataset.ref;
        let bitmap = this._cache.get(ref);
        const fresh = !bitmap;
        if (fresh) {
          bitmap = document.createElement('canvas');
          this._sizeCanvas(bitmap);
          this._renderThumb(bitmap, ref);
        }
        const canvas = thumb.querySelector('canvas');
        this._sizeCanvas(canvas);
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        if (fresh) this._cache.set(ref, bitmap);
        this._painted.add(thumb);
      }
      this._schedule();
    }, 0);
  }

  _nextThumb() {
    const needsPaint = thumb => this._thumbs.has(thumb) && !this._painted.has(thumb) && Array.isArray(this._cells[thumb.dataset.ref]?.shapes);
    for (const thumb of this._visible) if (thumb.dataset.ref === this._activeRef && needsPaint(thumb)) return thumb;
    for (const thumb of this._visible) if (needsPaint(thumb)) return thumb;
    return null;
  }

  _sizeCanvas(canvas) {
    const fit = 64 / Math.max(this._cellW, this._cellH);
    const scale = fit >= 1 ? Math.floor(fit) : fit;
    canvas.width = Math.max(1, Math.round(this._cellW * scale));
    canvas.height = Math.max(1, Math.round(this._cellH * scale));
  }

  _cancelWork() {
    clearTimeout(this._timer);
    this._timer = null;
  }

  _stopObserving() {
    this._cancelWork();
    this._generation++;
    this._observer?.disconnect();
    this._observer = null;
    this._observerActive = false;
    this._fallbackCleanup?.();
    this._fallbackCleanup = null;
    this._visible.clear();
  }

  _releaseDisplay(thumb) {
    const canvas = thumb.querySelector('canvas');
    if (canvas) canvas.width = canvas.height = 0;
    this._painted.delete(thumb);
  }

  _invalidateRef(ref) {
    this._cache.delete(ref);
    for (const thumb of this._thumbsByRef.get(ref) || []) this._releaseDisplay(thumb);
  }

  _invalidateAll() {
    this._cancelWork();
    this._cache.clear();
    for (const thumb of this._painted) this._releaseDisplay(thumb);
  }

  _checkTheme() {
    const style = getComputedStyle(document.documentElement);
    const key = JSON.stringify([document.documentElement.getAttribute('data-theme'), style.getPropertyValue('--checker-a'), style.getPropertyValue('--checker-b')]);
    if (key !== this._checkerKey) this._invalidateAll();
    this._checkerKey = key;
  }

  _updateLabels() {
    for (const thumb of this._thumbs) {
      const ref = thumb.dataset.ref;
      thumb.querySelector('.label').textContent = this._cells[ref]?.name || ref;
    }
  }

  _updateFallback() {
    const bounds = this._viewport.getBoundingClientRect();
    const thumbs = [...this._thumbs];
    let visible;
    if (bounds.width > 0 && bounds.height > 0) {
      visible = thumbs.filter(thumb => {
        const rect = thumb.getBoundingClientRect();
        return rect.right > bounds.left && rect.left < bounds.right && rect.bottom > bounds.top && rect.top < bounds.bottom;
      });
    } else {
      // Hidden/no-layout surfaces must not turn missing observer support into
      // an eager full-project render. Selection still gets a deterministic slot.
      visible = [...thumbs.filter(thumb => thumb.dataset.ref === this._activeRef), ...thumbs.filter(thumb => thumb.dataset.ref !== this._activeRef)].slice(0, 8);
    }
    const next = new Set(visible);
    for (const thumb of this._visible) if (!next.has(thumb)) this._releaseDisplay(thumb);
    this._visible = next;
    this._schedule();
  }

  _findViewport(strip) {
    for (let element = strip; element; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (/(auto|scroll|hidden|clip)/.test(`${style.overflowX} ${style.overflow}`)) return element;
    }
    return strip;
  }

  /**
   * Invalidate changed cells and update labels in place. Only visible, loaded
   * previews are scheduled; offscreen cells stay invalid until they are needed.
   */
  refresh(refs) {
    this._checkTheme();
    for (const ref of refs) this._invalidateRef(ref);
    const strip = document.getElementById('cell-strip');
    if (!strip?.children.length) { this.render(); return; }
    for (const ref of refs) {
      for (const thumb of this._thumbsByRef.get(ref) || []) thumb.querySelector('.label').textContent = this._cells[ref]?.name || ref;
    }
    this._schedule();
  }

  _allRefs() {
    const refs = [];
    for (let r = 0; r < this._grid.rows; r++) {
      for (let c = 0; c < this._grid.cols; c++) {
        refs.push(`${r},${c}`);
      }
    }
    return refs;
  }

  _updateHighlight() {
    document.querySelectorAll('#cell-strip .cell-thumb').forEach((el) => {
      el.classList.toggle('active', el.dataset.ref === this._activeRef);
    });
  }

  /**
   * Render a small preview of the cell's shapes into a thumbnail canvas.
   */
  _renderThumb(canvas, ref) {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cellW = this._cellW;
    const cellH = this._cellH;
    // Rounded bitmap dimensions can have slightly different X/Y ratios when
    // reducing a narrow cell. Map both axes fully; CSS retains the source ratio.
    ctx.setTransform(canvas.width / cellW, 0, 0, canvas.height / cellH, 0, 0);

    // Checkerboard background — one square per pixel, theme-aware
    const style = getComputedStyle(document.documentElement);
    const colorA = style.getPropertyValue('--checker-a').trim();
    const colorB = style.getPropertyValue('--checker-b').trim();
    for (let row = 0; row < cellH; row++) {
      for (let col = 0; col < cellW; col++) {
        ctx.fillStyle = ((row + col) % 2 === 0) ? colorA : colorB;
        ctx.fillRect(col, row, 1, 1);
      }
    }

    const cell = this._cells[ref];
    if (!cell || !cell.shapes) return;

    const sorted = [...cell.shapes]
      .filter(s => s.visible !== false || s.params?.layers?.length)
      .sort((a, b) => a.zIndex - b.zIndex);
    const native = renderCellNative(sorted, cellW, cellH, r => this._resolveColor(r), { lighting: cell.lighting, background: this._background, palette: this._palette });
    ctx.imageSmoothingEnabled = canvas.width < cellW;
    ctx.drawImage(native, 0, 0, cellW, cellH);
  }

  _resolveColor(ref) {
    if (!ref) return '#888';
    if (ref.startsWith('#')) return ref;
    return this._palette[ref] || '#888';
  }
}
