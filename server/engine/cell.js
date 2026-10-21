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

  /** Reserve root paint order in constant time, independently of a member's z. */
  _reserveShapeZ(shape) {
    const outerZ = shape.params?.layers?.[0]?.z;
    const next = Math.max(this._nextZ, Math.floor(shape.zIndex) + 1, Number.isSafeInteger(outerZ) ? outerZ + 1 : 0);
    // An exhausted imported/reordered surface stays editable, but a later draw
    // must explicitly fail because no higher safe integer can be represented.
    this._nextZ = Number.isSafeInteger(next) ? next : Infinity;
  }

  _exec(command) {
    command.execute();
    if (this._transaction) {
      this._transaction.push(command);
      return;
    }
    this._undoStack.push(command);
    if (this._undoStack.length > this._maxUndo) this._undoStack.shift();
    this._redoStack.length = 0;
  }

  /** Group synchronous edits into one undo entry; a failed edit rolls back. */
  transaction(edit) {
    if (this._transaction) throw new Error('Nested cell transactions are not supported');
    const commands = [], nextZ = this._nextZ;
    this._transaction = commands;
    let result;
    try { result = edit(); }
    catch (error) {
      for (const command of commands.toReversed()) command.undo();
      this._nextZ = nextZ;
      throw error;
    } finally { this._transaction = null; }
    if (commands.length) {
      // Edits already ran. Register the compound command without executing twice.
      this._undoStack.push({
        execute: () => { for (const command of commands) command.execute(); },
        undo: () => { for (const command of commands.toReversed()) command.undo(); },
      });
      if (this._undoStack.length > this._maxUndo) this._undoStack.shift();
      this._redoStack.length = 0;
    }
    return result;
  }

  draw(type, params, color, shapeName = null, opts = {}) {
    const zIndex = opts.zIndex === undefined ? Math.ceil(this._nextZ) : opts.zIndex;
    const nextZ = Math.max(Math.ceil(this._nextZ), zIndex + 1);
    if (!Number.isSafeInteger(zIndex) || !Number.isSafeInteger(nextZ) || zIndex === Number.MAX_SAFE_INTEGER) throw new Error('Draw z-order must be an exact safe integer with room for the next shape');
    const shape = new Shape(type, params, color, {
      name: shapeName,
      zIndex,
      visible: opts.visible ?? true,
    });
    this._exec({
      execute: () => { this.shapes.add(shape); this._reserveShapeZ(shape); },
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
      undo: () => { shape.params = structuredClone(oldParams); },
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
      undo: () => {
        Object.assign(shape, structuredClone(snapshot));
        this.shapes.add(shape);
      },
    });
  }

  updateShapeParams(ref, updates) {
    const shape = this.shapes.get(ref);
    if (!shape) throw new Error(`Shape "${ref}" not found`);
    const oldParams = structuredClone(shape.params);
    const savedUpdates = structuredClone(updates);
    this._exec({
      execute: () => { Object.assign(shape.params, structuredClone(savedUpdates)); this._reserveShapeZ(shape); },
      undo: () => { shape.params = structuredClone(oldParams); },
    });
  }

  /** Replace a shape's editable state, keeping its registry identity and name. */
  replaceShape(ref, { type, params, color, visible = true }) {
    const shape = this.shapes.get(ref);
    if (!shape) throw new Error(`Shape "${ref}" not found`);
    const before = { type: shape.type, params: structuredClone(shape.params), color: shape.color, visible: shape.visible };
    const after = structuredClone({ type, params, color, visible });
    this._exec({
      execute: () => { Object.assign(shape, structuredClone(after)); this._reserveShapeZ(shape); },
      undo: () => Object.assign(shape, structuredClone(before)),
    });
    return shape;
  }

  flipShape(ref, axis, opts = {}) {
    const shape = this.shapes.get(ref);
    if (!shape) throw new Error(`Shape "${ref}" not found`);
    const about = opts.about ?? 'self';
    const oldParams = structuredClone(shape.params);
    this._exec({
      execute: () => flipParams(shape.params, axis, mirrorSum(shape.params, axis, about, axis === 'horizontal' ? this.width : this.height)),
      undo: () => { shape.params = structuredClone(oldParams); },
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
      undo: () => { shape.params = structuredClone(oldParams); },
    });
  }

  setZ(ref, z) {
    const shape = this.shapes.get(ref);
    if (!shape) throw new Error(`Shape "${ref}" not found`);
    const oldZ = shape.zIndex;
    this._exec({
      execute: () => { shape.zIndex = z; this._reserveShapeZ(shape); },
      undo: () => { shape.zIndex = oldZ; },
    });
  }

  clear() {
    const snapshot = this.shapes.listByZ().map(shape => ({ shape, data: shape.toJSON() }));
    this._exec({
      execute: () => this.shapes.clear(),
      undo: () => {
        for (const { shape, data } of snapshot) {
          Object.assign(shape, structuredClone(data));
          this.shapes.add(shape);
        }
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
      cell._reserveShapeZ(shape);
    }
    return cell;
  }
}
