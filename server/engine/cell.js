import { Shape } from './shape.js';
import { ShapeRegistry } from './shape-registry.js';
import { flipParams, mirrorSum, rotateParams, rotatePivot } from './transform.js';

export class Cell {
  constructor(size, opts = {}) {
    // size: number (square) or { w, h }
    const { w, h } = typeof size === 'object' ? { w: size.w, h: size.h ?? size.w } : { w: size, h: size };
    this.width = w;
    this.height = h;
    this.name = opts.name ?? null;
    this.reference = opts.reference ?? null; // { path, opacity } tracing underlay; never exported
    this.shapes = new ShapeRegistry();
    this._undoStack = [];
    this._redoStack = [];
    this._maxUndo = opts.maxUndo ?? 50;
    this._nextZ = 0;
  }

  _exec(command) {
    command.execute();
    this._undoStack.push(command);
    if (this._undoStack.length > this._maxUndo) this._undoStack.shift();
    this._redoStack.length = 0;
  }

  draw(type, params, color, shapeName = null) {
    const shape = new Shape(type, params, color, {
      name: shapeName,
      zIndex: this._nextZ++,
    });
    this._exec({
      execute: () => this.shapes.add(shape),
      undo: () => this.shapes.remove(shape.id),
    });
    return shape;
  }

  moveShape(ref, dx, dy) {
    const shape = this.shapes.get(ref);
    if (!shape) throw new Error(`Shape "${ref}" not found`);
    const oldParams = structuredClone(shape.params);
    const applyMove = () => {
      if ('x' in shape.params) shape.params.x += dx;
      if ('y' in shape.params) shape.params.y += dy;
      if ('x1' in shape.params) { shape.params.x1 += dx; shape.params.y1 += dy; }
      if ('x2' in shape.params) { shape.params.x2 += dx; shape.params.y2 += dy; }
      if ('cx' in shape.params) { shape.params.cx += dx; shape.params.cy += dy; }
      if ('points' in shape.params) {
        for (const pt of shape.params.points) { pt.x += dx; pt.y += dy; }
      }
    };
    this._exec({
      execute: applyMove,
      undo: () => { Object.assign(shape.params, oldParams); },
    });
  }

  recolorShape(ref, color, color2) {
    const shape = this.shapes.get(ref);
    if (!shape) throw new Error(`Shape "${ref}" not found`);
    const oldColor = shape.color;
    const oldColor2 = shape.params.color2;
    this._exec({
      execute: () => { shape.color = color; if (color2 != null) shape.params.color2 = color2; },
      undo: () => {
        shape.color = oldColor;
        if (color2 != null) { if (oldColor2 === undefined) delete shape.params.color2; else shape.params.color2 = oldColor2; }
      },
    });
  }

  deleteShape(ref) {
    const shape = this.shapes.get(ref);
    if (!shape) throw new Error(`Shape "${ref}" not found`);
    const snapshot = shape.toJSON();
    this._exec({
      execute: () => this.shapes.remove(shape.id),
      undo: () => this.shapes.add(Shape.fromJSON(snapshot)),
    });
  }

  updateShapeParams(ref, updates) {
    const shape = this.shapes.get(ref);
    if (!shape) throw new Error(`Shape "${ref}" not found`);
    const oldParams = structuredClone(shape.params);
    this._exec({
      execute: () => { Object.assign(shape.params, updates); },
      undo: () => { Object.assign(shape.params, oldParams); },
    });
  }

  flipShape(ref, axis, opts = {}) {
    const shape = this.shapes.get(ref);
    if (!shape) throw new Error(`Shape "${ref}" not found`);
    const about = opts.about ?? 'self';
    const oldParams = structuredClone(shape.params);
    this._exec({
      execute: () => flipParams(shape.params, axis, mirrorSum(shape.params, axis, about, axis === 'horizontal' ? this.width : this.height)),
      undo: () => { Object.assign(shape.params, oldParams); },
    });
  }

  rotateShape(ref, deg, opts = {}) {
    const shape = this.shapes.get(ref);
    if (!shape) throw new Error(`Shape "${ref}" not found`);
    const about = opts.about ?? 'self';
    const oldParams = structuredClone(shape.params);
    this._exec({
      execute: () => {
        const [px, py] = rotatePivot(shape.params, about, this.width, this.height);
        rotateParams(shape.params, deg, px, py);
      },
      undo: () => { Object.assign(shape.params, oldParams); },
    });
  }

  setZ(ref, z) {
    const shape = this.shapes.get(ref);
    if (!shape) throw new Error(`Shape "${ref}" not found`);
    const oldZ = shape.zIndex;
    this._exec({
      execute: () => { shape.zIndex = z; },
      undo: () => { shape.zIndex = oldZ; },
    });
  }

  clear() {
    const snapshot = this.shapes.toJSON();
    this._exec({
      execute: () => this.shapes.clear(),
      undo: () => {
        for (const data of snapshot) this.shapes.add(Shape.fromJSON(data));
      },
    });
  }

  undo() {
    const command = this._undoStack.pop();
    if (!command) return false;
    command.undo();
    this._redoStack.push(command);
    return true;
  }

  redo() {
    const command = this._redoStack.pop();
    if (!command) return false;
    command.execute();
    this._undoStack.push(command);
    return true;
  }

  toJSON() {
    return {
      name: this.name,
      reference: this.reference,
      shapes: this.shapes.toJSON(),
    };
  }

  static fromJSON(json, size) {
    const cell = new Cell(size, { name: json.name, reference: json.reference ?? null });
    const shapes = ShapeRegistry.fromJSON(json.shapes);
    for (const shape of shapes.listByZ()) {
      cell.shapes.add(shape);
      if (shape.zIndex >= cell._nextZ) cell._nextZ = shape.zIndex + 1;
    }
    return cell;
  }
}
