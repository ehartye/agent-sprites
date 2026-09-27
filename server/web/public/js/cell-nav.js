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
    const scale = 1;

    // Checkerboard background — one square per pixel, theme-aware
    const style = getComputedStyle(document.documentElement);
    const colorA = style.getPropertyValue('--checker-a').trim();
    const colorB = style.getPropertyValue('--checker-b').trim();
    for (let row = 0; row < cellH; row++) {
      for (let col = 0; col < cellW; col++) {
        ctx.fillStyle = ((row + col) % 2 === 0) ? colorA : colorB;
        ctx.fillRect(col * scale, row * scale, scale, scale);
      }
    }

    const cell = this._cells[ref];
    if (!cell || !cell.shapes || cell.shapes.length === 0) return;

    const sorted = [...cell.shapes]
      .filter(s => s.visible !== false)
      .sort((a, b) => a.zIndex - b.zIndex);

    for (const shape of sorted) {
      ctx.fillStyle = this._resolveColor(shape.color);
      const p = shape.params;

      switch (shape.type) {
        case 'point':
          ctx.fillRect(p.x * scale, p.y * scale, scale, scale);
          break;
        case 'line':
          this._thumbLine(ctx, scale, p.x1, p.y1, p.x2, p.y2);
          break;
        case 'rect':
          if (p.filled) {
            ctx.fillRect(p.x * scale, p.y * scale, p.w * scale, p.h * scale);
          } else {
            ctx.fillRect(p.x * scale, p.y * scale, p.w * scale, scale);
            ctx.fillRect(p.x * scale, (p.y + p.h - 1) * scale, p.w * scale, scale);
            ctx.fillRect(p.x * scale, p.y * scale, scale, p.h * scale);
            ctx.fillRect((p.x + p.w - 1) * scale, p.y * scale, scale, p.h * scale);
          }
          break;
        case 'circle':
          if (p.filled) {
            for (let y = -p.r; y <= p.r; y++) {
              for (let x = -p.r; x <= p.r; x++) {
                if (x * x + y * y <= p.r * p.r) {
                  ctx.fillRect((p.cx + x) * scale, (p.cy + y) * scale, scale, scale);
                }
              }
            }
          }
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
                  ctx.fillRect(x * scale, y * scale, scale, scale);
                }
              }
            }
          }
          for (let i = 0; i < pts.length - 1; i++) {
            this._thumbLine(ctx, scale, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
          }
          if (close && pts.length >= 3) {
            this._thumbLine(ctx, scale, pts[pts.length - 1].x, pts[pts.length - 1].y, pts[0].x, pts[0].y);
          }
          break;
        }
      }
    }
  }

  _resolveColor(ref) {
    if (!ref) return '#888';
    if (ref.startsWith('#')) return ref;
    return this._palette[ref] || '#888';
  }

  _thumbLine(ctx, scale, x1, y1, x2, y2) {
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
}
