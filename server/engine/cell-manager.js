import { Cell } from './cell.js';
import { rotateParams, flipParams } from './transform.js';
import { transformLayerCell } from './shape-layers.js';
import { translateParams } from '../web/public/js/shared/shape-layers.js';

export class CellManager {
  constructor(cellSize, rows, cols) {
    // cellSize: number (square) or { w, h }
    const { w, h } = cellSize && typeof cellSize === 'object' ? { w: cellSize.w, h: cellSize.h ?? cellSize.w } : { w: cellSize, h: cellSize };
    if (![rows,cols,w,h].every(n=>Number.isSafeInteger(n)&&n>0)) throw new Error('Grid and cell dimensions must be positive safe integers');
    if (![rows*cols,w*cols,h*rows,w*cols*h*rows].every(Number.isSafeInteger)) throw new Error('Grid dimensions and pixel count must be exactly representable as safe integers');
    this.cellWidth = w;
    this.cellHeight = h;
    this.rows = rows;
    this.cols = cols;
    this._grid = [];
    for (let r = 0; r < rows; r++) {
      this._grid[r] = [];
      for (let c = 0; c < cols; c++) {
        this._grid[r][c] = new Cell({ w, h });
      }
    }
  }

  _parseCoord(ref) {
    const match = ref.match(/^(\d+),(\d+)$/);
    if (match) {
      const r = parseInt(match[1], 10);
      const c = parseInt(match[2], 10);
      return { r, c };
    }
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this._grid[r][c].name === ref) return { r, c };
      }
    }
    throw new Error(`Cell "${ref}" not found`);
  }

  /** "R,C" for a coordinate or cell name, bounds-checked. */
  resolveRef(ref) {
    const { r, c } = this._parseCoord(ref);
    this.getCell(`${r},${c}`);
    return `${r},${c}`;
  }

  getCell(ref) {
    const { r, c } = this._parseCoord(ref);
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) {
      throw new Error(`Cell ${r},${c} out of bounds (grid is ${this.rows}x${this.cols})`);
    }
    const cell = this._grid[r][c];
    cell.surfaceContext = this.surfaceContext;
    return cell;
  }

  copyCell(fromRef, toRef) {
    const src = this.getCell(fromRef);
    const { r, c } = this._parseCoord(toRef);
    const dest = new Cell({ w: this.cellWidth, h: this.cellHeight }, { reference: src.reference, lighting: src.lighting });
    dest.surfaceContext = this.surfaceContext;
    for (const shape of src.shapes.listByZ()) {
      const clone = shape.clone();
      dest.shapes.add(clone);
      // Reserve both primitive and retained root-surface paint order.
      dest._reserveShapeZ(clone);
    }
    this._grid[r][c] = dest;
  }

  shiftCell(ref, dx, dy) {
    const cell = this.getCell(ref);
    if (cell.shapes.listByZ().some(shape => Object.hasOwn(shape.params, 'layers') || Object.hasOwn(shape.params, 'surface'))) {
      return transformLayerCell(cell, p => {
        Object.assign(p, translateParams(p, dx, dy));
      });
    }
    for (const shape of cell.shapes.listByZ()) {
      const p = shape.mutableParams();
      if ('x' in p) { p.x += dx; p.y += dy; }
      if ('x1' in p) { p.x1 += dx; p.y1 += dy; }
      if ('x2' in p) { p.x2 += dx; p.y2 += dy; }
      if ('cx' in p) { p.cx += dx; p.cy += dy; }
      if ('points' in p) {
        for (const pt of p.points) { pt.x += dx; pt.y += dy; }
      }
    }
  }

  mirrorCell(ref, axis) {
    const cell = this.getCell(ref);
    const max = (axis === 'horizontal' ? this.cellWidth : this.cellHeight) - 1;
    if (cell.lighting || cell.shapes.listByZ().some(shape => Object.hasOwn(shape.params, 'layers') || Object.hasOwn(shape.params, 'surface'))) {
      const options = cell.lighting ? { lighting: { ...cell.lighting, skyDir: cell.lighting.skyDir.map((value,index)=>index === (axis === 'horizontal' ? 0 : 1) ? -value : value) } } : {};
      return transformLayerCell(cell, p => flipParams(p, axis, max), options);
    }
    for (const shape of cell.shapes.listByZ()) {
      const p = shape.mutableParams();
      if (axis === 'horizontal') {
        if ('points' in p) { for (const pt of p.points) pt.x = max - pt.x; }
        else if ('x1' in p) { p.x1 = max - p.x1; p.x2 = max - p.x2; }
        else if ('cx' in p) { p.cx = max - p.cx; }
        else if ('x' in p && 'w' in p) { p.x = max - p.x - p.w + 1; }
        else if ('x' in p) { p.x = max - p.x; }
      } else {
        if ('points' in p) { for (const pt of p.points) pt.y = max - pt.y; }
        else if ('y1' in p) { p.y1 = max - p.y1; p.y2 = max - p.y2; }
        else if ('cy' in p) { p.cy = max - p.cy; }
        else if ('y' in p && 'h' in p) { p.y = max - p.y - p.h + 1; }
        else if ('y' in p) { p.y = max - p.y; }
      }
    }
  }

  rotateCell(ref, deg) {
    const cell = this.getCell(ref);
    const px = (this.cellWidth - 1) / 2;
    const py = (this.cellHeight - 1) / 2;
    if (cell.lighting || cell.shapes.listByZ().some(shape => Object.hasOwn(shape.params, 'layers') || Object.hasOwn(shape.params, 'surface'))) {
      if (![90,180,270].includes(deg)) throw new Error('Rotation must be 90, 180, or 270 degrees');
      const [x,y] = cell.lighting?.skyDir ?? [0,-1];
      const options = cell.lighting ? { lighting: { ...cell.lighting, skyDir: deg === 90 ? [-y,x] : deg === 180 ? [-x,-y] : [y,-x] } } : {};
      return transformLayerCell(cell, p => rotateParams(p, deg, px, py), options);
    }
    for (const shape of cell.shapes.listByZ()) {
      rotateParams(shape.mutableParams(), deg, px, py);
    }
  }

  listCells() {
    const result = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this._grid[r][c];
        result.push({
          coord: `${r},${c}`,
          name: cell.name,
          shapeCount: cell.shapes.listByZ().length,
        });
      }
    }
    return result;
  }

  toJSON() {
    const cells = {};
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this._grid[r][c];
        if (cell.shapes.listByZ().length > 0 || cell.name || cell.lighting !== undefined || cell.reference) {
          cells[`${r},${c}`] = cell.toJSON();
        }
      }
    }
    return { rows: this.rows, cols: this.cols, cells };
  }

  static fromJSON(json, cellSize, options) {
    const cm = new CellManager(cellSize, json.rows, json.cols);
    for (const [coord, cellData] of Object.entries(json.cells)) {
      const { r, c } = cm._parseCoord(coord);
      cm._grid[r][c] = Cell.fromJSON(cellData, { w: cm.cellWidth, h: cm.cellHeight }, options);
    }
    return cm;
  }
}
