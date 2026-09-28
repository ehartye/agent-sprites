import { renderCellNative } from './cell-raster.js';
/**
 * Cell navigator — thumbnail strip at the bottom showing all cells.
 * Click to switch active cell, filter by group.
 */

export class CellNavigator {
  constructor() {
    this._grid = { rows: 0, cols: 0 };
    this._cellW = 16;
    this._cellH = 16;
    this._palette = {};
    this._cells = {};
    this._activeRef = '0,0';
    this._filter = null; // null = all, or array of cell refs

    this._selectCb = null;
  }

  /**
   * @param {object} opts
   * @param {Function} opts.onSelect - Called with cell ref string when clicked
   */
  init({ onSelect }) {
    this._selectCb = onSelect;
  }

  setGrid(rows, cols, cellW = 16, cellH = cellW) {
    this._grid = { rows, cols };
    this._cellW = cellW;
    this._cellH = cellH;
  }

  setPalette(paletteMap) {
    this._palette = paletteMap;
  }

  setCells(cells) {
    this._cells = cells || {};
  }

  setActive(ref) {
    this._activeRef = ref;
    this._updateHighlight();
  }

  /**
   * Filter to show only specific cells (e.g., cells in a group).
   * Pass null to show all cells.
   * @param {string[]|null} refs
   */
  setFilter(refs) {
    this._filter = refs;
    this.render();
  }

  render() {
    const strip = document.getElementById('cell-strip');
    strip.innerHTML = '';

    const refs = this._filter || this._allRefs();

    for (const ref of refs) {
      const thumb = document.createElement('div');
      thumb.className = 'cell-thumb';
      thumb.dataset.ref = ref;
      if (ref === this._activeRef) thumb.classList.add('active');

      // Thumbnail canvas for cell preview
      const canvas = document.createElement('canvas');
      const fit = 64 / Math.max(this._cellW, this._cellH);
      const scale = fit >= 1 ? Math.floor(fit) : fit;
      canvas.width = Math.max(1, Math.round(this._cellW * scale));
      canvas.height = Math.max(1, Math.round(this._cellH * scale));
      canvas.style.width = `${this._cellW * scale}px`;
      canvas.style.height = `${this._cellH * scale}px`;
      canvas.className = 'cell-thumb-canvas';
      this._renderThumb(canvas, ref);
      thumb.appendChild(canvas);

      const label = document.createElement('span');
      label.className = 'label';
      const cell = this._cells[ref];
      label.textContent = cell?.name || ref;
      thumb.appendChild(label);

      thumb.addEventListener('click', () => {
        this._activeRef = ref;
        this._updateHighlight();
        if (this._selectCb) this._selectCb(ref);
      });

      strip.appendChild(thumb);
    }
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
    if (!cell || !cell.shapes || cell.shapes.length === 0) return;

    const sorted = [...cell.shapes]
      .filter(s => s.visible !== false)
      .sort((a, b) => a.zIndex - b.zIndex);
    const native = renderCellNative(sorted, cellW, cellH, r => this._resolveColor(r));
    ctx.imageSmoothingEnabled = canvas.width < cellW;
    ctx.drawImage(native, 0, 0, cellW, cellH);
  }

  _resolveColor(ref) {
    if (!ref) return '#888';
    if (ref.startsWith('#')) return ref;
    return this._palette[ref] || '#888';
  }
}
