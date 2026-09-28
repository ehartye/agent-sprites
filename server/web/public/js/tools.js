/**
 * Drawing tool handlers — translates mouse events on the canvas into
 * WebSocket operations sent to the server.
 */
import { snapParams, rasterShape } from './shared/raster.js';

export const TOOLS = [
  { id: 'point',   label: 'Point',   icon: '.' },
  { id: 'line',    label: 'Line',    icon: '/' },
  { id: 'rect',    label: 'Rect',    icon: '#' },
  { id: 'circle',  label: 'Circle',  icon: 'O' },
  { id: 'ellipse', label: 'Ellipse', icon: 'E' },
  { id: 'fill',    label: 'Fill',    icon: '%' },
  // Deletes the shape under the cursor; distinct from drawing an erase shape.
  { id: 'erase',   label: 'Delete',  icon: 'X' },
  { id: 'select',  label: 'Select',  icon: '+' },
];

/**
 * How far (x, y) is from the pixels a shape paints, in Chebyshev pixels, capped
 * at 2: 0 = on a painted pixel, 1 = beside one. Uses the shared shape rules, so
 * selection follows exactly what the export draws. A flood fill is picked by its
 * seed pixel.
 */
function hitDistance(shape, x, y) {
  const p = snapParams(shape.params);
  if (shape.type === 'fill') return Math.min(2, Math.max(Math.abs(p.x - x), Math.abs(p.y - y)));
  let best = 2;
  rasterShape(shape.type, p, {
    px(px, py) { best = Math.min(best, Math.max(Math.abs(px - x), Math.abs(py - y))); },
    rect(rx, ry, w, h) {
      const dx = x < rx ? rx - x : x >= rx + w ? x - (rx + w - 1) : 0;
      const dy = y < ry ? ry - y : y >= ry + h ? y - (ry + h - 1) : 0;
      best = Math.min(best, Math.max(dx, dy));
    },
  });
  return best;
}

/**
 * Hit-test: the topmost shape that paints (x, y); failing that, the topmost one
 * painting a pixel beside it, so thin strokes stay easy to click.
 */
export function hitTestShapes(shapes, x, y) {
  if (!shapes) return null;
  // Iterate in reverse z-order (topmost first)
  const sorted = [...shapes].filter(s => s.visible !== false).sort((a, b) => b.zIndex - a.zIndex);
  let near = null;
  for (const shape of sorted) {
    const d = hitDistance(shape, x, y);
    if (d === 0) return shape;
    if (d === 1 && !near) near = shape;
  }
  return near;
}

export class ToolManager {
  constructor() {
    this._activeTool = 'point';
    this._sendFn = null;
    this._getCellRef = null;
    this._getColor = null;
    this._getShapes = null;
    this._selectedShape = null;

    // Multi-click tool state (line, rect, circle)
    this._startX = null;
    this._startY = null;
    this._dragShape = null;

    this._toolChangeCb = null;
    this._previewCb = null;
    this._selectionChangeCb = null;
    this._dragPreviewCb = null;
    this._selectedShapeData = null;
  }

  /**
   * Initialize tool buttons in the DOM.
   * @param {object} opts
   * @param {Function} opts.send - Send operation to server via WebSocket
   * @param {Function} opts.getCellRef - Returns current active cell ref string
   * @param {Function} opts.getColor - Returns current active color name
   */
  init({ send, getCellRef, getColor, getShapes }) {
    this._sendFn = send;
    this._getCellRef = getCellRef;
    this._getColor = getColor;
    this._getShapes = getShapes || (() => []);
    this._renderButtons();
  }

  get activeTool() { return this._activeTool; }

  setTool(toolId) {
    this._activeTool = toolId;
    this._selectedShape = null;
    this._selectedShapeData = null;
    if (this._selectionChangeCb) this._selectionChangeCb(null);
    if (this._dragPreviewCb) this._dragPreviewCb(null, 0, 0);
    this._resetDrag();
    this._updateButtonHighlight();
    if (this._toolChangeCb) this._toolChangeCb(toolId);
  }

  onToolChange(cb) { this._toolChangeCb = cb; }
  onPreview(cb) { this._previewCb = cb; }
  onSelectionChange(cb) { this._selectionChangeCb = cb; }
  onDragPreview(cb) { this._dragPreviewCb = cb; }

  /* -- Mouse event handlers (called by canvas-editor via app.js) -- */

  handleClick(x, y) {
    const tool = this._activeTool;
    const cell = this._getCellRef();
    const color = this._getColor();

    switch (tool) {
      case 'point':
        this._send({ action: 'draw', type: 'point', params: { cell, x, y, color } });
        break;

      case 'fill':
        this._send({ action: 'draw', type: 'fill', params: { cell, x, y, color } });
        break;

      case 'line':
        if (this._startX === null) {
          this._startX = x;
          this._startY = y;
        } else {
          this._send({
            action: 'draw', type: 'line',
            params: { cell, x1: this._startX, y1: this._startY, x2: x, y2: y, color },
          });
          this._resetDrag();
        }
        break;

      case 'rect':
        if (this._startX === null) {
          this._startX = x;
          this._startY = y;
        }
        break;

      case 'circle':
        if (this._startX === null) {
          this._startX = x;
          this._startY = y;
        }
        break;

      case 'ellipse':
        if (this._startX === null) {
          this._startX = x;
          this._startY = y;
        }
        break;

      case 'erase': {
        const eraseHit = hitTestShapes(this._getShapes(), x, y);
        if (eraseHit) {
          const ref = eraseHit.name || eraseHit.id;
          this._send({ action: 'delete_shape', params: { cell, name: ref } });
        }
        break;
      }

      case 'select': {
        const selectHit = hitTestShapes(this._getShapes(), x, y);
        if (selectHit) {
          this._selectedShape = selectHit.name || selectHit.id;
          this._selectedShapeData = selectHit;
          this._startX = x;
          this._startY = y;
          if (this._selectionChangeCb) this._selectionChangeCb(selectHit);
        } else {
          this._selectedShape = null;
          this._selectedShapeData = null;
          if (this._selectionChangeCb) this._selectionChangeCb(null);
          if (this._dragPreviewCb) this._dragPreviewCb(null, 0, 0);
        }
        break;
      }
    }
  }

  handleMove(x, y) {
    if (this._startX === null) return;

    const tool = this._activeTool;
    if (tool === 'line' || tool === 'rect' || tool === 'circle' || tool === 'ellipse') {
      this._emitPreview(tool, x, y);
    } else if (tool === 'select' && this._selectedShapeData) {
      const dx = x - this._startX;
      const dy = y - this._startY;
      if (this._dragPreviewCb) this._dragPreviewCb(this._selectedShapeData, dx, dy);
    }
  }

  handleUp(x, y) {
    const tool = this._activeTool;
    const cell = this._getCellRef();
    const color = this._getColor();

    if (tool === 'rect' && this._startX !== null) {
      const rx = Math.min(this._startX, x);
      const ry = Math.min(this._startY, y);
      const w = Math.abs(x - this._startX) + 1;
      const h = Math.abs(y - this._startY) + 1;
      this._send({
        action: 'draw', type: 'rect',
        params: { cell, x: rx, y: ry, w, h, filled: true, color },
      });
      this._resetDrag();
    }

    if (tool === 'circle' && this._startX !== null) {
      const dx = x - this._startX;
      const dy = y - this._startY;
      const r = Math.round(Math.sqrt(dx * dx + dy * dy));
      this._send({
        action: 'draw', type: 'circle',
        params: { cell, cx: this._startX, cy: this._startY, r, filled: true, color },
      });
      this._resetDrag();
    }

    if (tool === 'ellipse' && this._startX !== null) {
      const rx = Math.abs(x - this._startX);
      const ry = Math.abs(y - this._startY);
      this._send({
        action: 'draw', type: 'ellipse',
        params: { cell, cx: this._startX, cy: this._startY, rx, ry, filled: true, color },
      });
      this._resetDrag();
    }

    if (tool === 'select' && this._startX !== null && this._selectedShape) {
      const dx = x - this._startX;
      const dy = y - this._startY;
      if (dx !== 0 || dy !== 0) {
        this._send({ action: 'move_shape', params: { cell, name: this._selectedShape, dx, dy } });
      }
      this._selectedShape = null;
      this._selectedShapeData = null;
      if (this._selectionChangeCb) this._selectionChangeCb(null);
      if (this._dragPreviewCb) this._dragPreviewCb(null, 0, 0);
      this._resetDrag();
    }
  }

  /* -- Internal -- */

  _send(msg) {
    if (this._sendFn) this._sendFn(msg);
  }

  _resetDrag() {
    this._startX = null;
    this._startY = null;
    this._dragShape = null;
    if (this._previewCb) this._previewCb(null);
  }

  _emitPreview(tool, x, y) {
    if (!this._previewCb) return;
    const color = this._getColor();

    switch (tool) {
      case 'line':
        this._previewCb({
          type: 'line',
          params: { x1: this._startX, y1: this._startY, x2: x, y2: y },
          color,
        });
        break;
      case 'rect': {
        const rx = Math.min(this._startX, x);
        const ry = Math.min(this._startY, y);
        const w = Math.abs(x - this._startX) + 1;
        const h = Math.abs(y - this._startY) + 1;
        this._previewCb({
          type: 'rect',
          params: { x: rx, y: ry, w, h, filled: true },
          color,
        });
        break;
      }
      case 'circle': {
        const dx = x - this._startX;
        const dy = y - this._startY;
        const r = Math.round(Math.sqrt(dx * dx + dy * dy));
        this._previewCb({
          type: 'circle',
          params: { cx: this._startX, cy: this._startY, r, filled: true },
          color,
        });
        break;
      }
      case 'ellipse': {
        const rx = Math.abs(x - this._startX);
        const ry = Math.abs(y - this._startY);
        this._previewCb({
          type: 'ellipse',
          params: { cx: this._startX, cy: this._startY, rx, ry, filled: true },
          color,
        });
        break;
      }
    }
  }

  _renderButtons() {
    const container = document.getElementById('tool-buttons');
    container.innerHTML = '';

    for (const tool of TOOLS) {
      const btn = document.createElement('button');
      btn.dataset.tool = tool.id;
      btn.textContent = tool.label;
      btn.title = tool.label;
      if (tool.id === this._activeTool) btn.classList.add('active');
      btn.addEventListener('click', () => this.setTool(tool.id));
      container.appendChild(btn);
    }
  }

  _updateButtonHighlight() {
    document.querySelectorAll('#tool-buttons button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === this._activeTool);
    });
  }
}
