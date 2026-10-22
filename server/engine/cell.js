import { Shape } from './shape.js';
import { ShapeRegistry } from './shape-registry.js';
import { flipParams, mirrorSum, rotateParams, rotatePivot } from './transform.js';
import { validateSurface, validateLighting } from '../web/public/js/shared/surface-model.js';
import { validateSurfaceScene } from '../web/public/js/shared/surface-raster.js';
import { translateParams } from '../web/public/js/shared/shape-layers.js';

export class Cell {
  constructor(size, opts = {}) {
    // size: number (square) or { w, h }
    const { w, h } = typeof size === 'object' ? { w: size.w, h: size.h ?? size.w } : { w: size, h: size };
    this.width = w;
    this.height = h;
    this.name = opts.name ?? null;
    this.reference = opts.reference ?? null; // { path, opacity } tracing underlay; never exported
    this.lighting = validateLighting(opts.lighting);
    this.shapes = new ShapeRegistry();
    this._undoStack = [];
    this._redoStack = [];
    this._maxUndo = opts.maxUndo ?? 50;
    this._nextZ = 0;
    // Conservative fast-path hint; false guarantees no retained surface data.
    this._hasSurfaceData = false;
  }

  /** Reserve root paint order in constant time, independently of a member's z. */
  _reserveShapeZ(shape) {
    if (shape.params?.surface !== undefined) this._hasSurfaceData = true;
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

  /** Current project context is supplied by CellManager, including after copy. */
  validateSurfaceState(shapes, lighting = this.lighting) {
    if (!shapes && lighting === undefined && !this._hasSurfaceData) return;
    shapes ??= this.shapes.listByZ();
    if (lighting === undefined && !shapes.some(shape => shape.params.surface !== undefined)) return;
    validateSurfaceScene({ shapes, width: this.width, height: this.height, lighting, ...this.surfaceContext?.() });
  }

  _preflightShape(before, after) {
    if (this._transaction || (this.lighting === undefined && !this._hasSurfaceData && after.params.surface === undefined)) return;
    const shapes = this.shapes.listByZ().map(shape => shape === before ? after : shape);
    if (!before) shapes.push(after);
    this.validateSurfaceState(shapes);
  }

  _recordTransaction(commands) {
    if (!commands.length) return;
    this._undoStack.push({
      execute: () => { for (const command of commands) command.execute(); },
      undo: () => { for (const command of commands.toReversed()) command.undo(); },
    });
    if (this._undoStack.length > this._maxUndo) this._undoStack.shift();
    this._redoStack.length = 0;
  }

  /** Validate every participating cell before committing any history entry. */
  static editAll(cells, edit) {
    const edits = [...new Set(cells)].map(cell => ({cell, commands: [], nextZ: cell._nextZ, surface: cell._hasSurfaceData}));
    if (edits.some(({cell}) => cell._transaction)) throw new Error('A multi-cell edit cannot join an active transaction');
    for (const {cell, commands} of edits) cell._transaction = commands;
    let result;
    try {
      result = edit();
      for (const {cell} of edits) cell.validateSurfaceState();
    } catch (error) {
      for (const {cell, commands, nextZ, surface} of edits.toReversed()) {
        for (const command of commands.toReversed()) command.undo();
        cell._nextZ = nextZ; cell._hasSurfaceData = surface;
      }
      throw error;
    } finally { for (const {cell} of edits) cell._transaction = null; }
    for (const {cell, commands} of edits) cell._recordTransaction(commands);
    return result;
  }

  /** Group synchronous edits into one undo entry; a failed edit rolls back. */
  transaction(edit) {
    if (!this._transaction) return Cell.editAll([this], edit);
    // Nested helpers share the outer publication boundary, with a savepoint if
    // their caller catches an error and continues the enclosing edit.
    const start = this._transaction.length, nextZ = this._nextZ, surface = this._hasSurfaceData;
    try { return edit(); }
    catch (error) {
      for (const command of this._transaction.splice(start).toReversed()) command.undo();
      this._nextZ = nextZ; this._hasSurfaceData = surface;
      throw error;
    }
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
    this._preflightShape(null, shape);
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
    const proposed = { ...shape, params: translateParams(oldParams, dx, dy) };
    this._preflightShape(shape, proposed);
    this._exec({
      execute: () => { shape.params = structuredClone(proposed.params); },
      undo: () => { shape.params = structuredClone(oldParams); },
    });
  }

  recolorShape(ref, color, color2) {
    const shape = this.shapes.get(ref);
    if (!shape) throw new Error(`Shape "${ref}" not found`);
    const oldColor = shape.color;
    const oldColor2 = shape.params.color2;
    this._exec({
      execute: () => { shape.color = color; if (color2 != null) shape.mutableParams().color2 = color2; },
      undo: () => {
        shape.color = oldColor;
        if (color2 != null) { const params = shape.mutableParams(); if (oldColor2 === undefined) delete params.color2; else params.color2 = oldColor2; }
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
    if (Object.hasOwn(savedUpdates, 'surface')) savedUpdates.surface = validateSurface(savedUpdates.surface);
    this._preflightShape(shape, { ...shape, params: { ...oldParams, ...savedUpdates } });
    this._exec({
      execute: () => { Object.assign(shape.mutableParams(), structuredClone(savedUpdates)); this._reserveShapeZ(shape); },
      undo: () => { shape.params = structuredClone(oldParams); },
    });
  }

  /** Replace a shape's editable state, keeping its registry identity and name. */
  replaceShape(ref, { type, params, color, visible = true }) {
    const shape = this.shapes.get(ref);
    if (!shape) throw new Error(`Shape "${ref}" not found`);
    const before = { type: shape.type, params: structuredClone(shape.params), color: shape.color, visible: shape.visible };
    const after = structuredClone({ type, params, color, visible });
    if (Object.hasOwn(after.params, 'surface')) after.params.surface = validateSurface(after.params.surface);
    this._preflightShape(shape, { ...shape, ...after });
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
    const after = structuredClone(oldParams);
    flipParams(after, axis, mirrorSum(after, axis, about, axis === 'horizontal' ? this.width : this.height));
    this._preflightShape(shape, { ...shape, params: after });
    this._exec({
      execute: () => { shape.params = structuredClone(after); },
      undo: () => { shape.params = structuredClone(oldParams); },
    });
  }

  rotateShape(ref, deg, opts = {}) {
    const shape = this.shapes.get(ref);
    if (!shape) throw new Error(`Shape "${ref}" not found`);
    const about = opts.about ?? 'self';
    const oldParams = structuredClone(shape.params);
    const after = structuredClone(oldParams), [px, py] = rotatePivot(after, about, this.width, this.height);
    rotateParams(after, deg, px, py);
    this._preflightShape(shape, { ...shape, params: after });
    this._exec({
      execute: () => { shape.params = structuredClone(after); },
      undo: () => { shape.params = structuredClone(oldParams); },
    });
  }

  setZ(ref, z) {
    const shape = this.shapes.get(ref);
    if (!shape) throw new Error(`Shape "${ref}" not found`);
    const oldZ = shape.zIndex;
    this._preflightShape(shape, { ...shape, zIndex: z });
    this._exec({
      execute: () => { shape.zIndex = z; this._reserveShapeZ(shape); },
      undo: () => { shape.zIndex = oldZ; },
    });
  }

  setLighting(value) {
    const after = validateLighting(value), before = structuredClone(this.lighting);
    if (JSON.stringify(after) === JSON.stringify(before)) return false;
    if (!this._transaction && after !== undefined) this.validateSurfaceState(undefined, after);
    this._exec({
      execute: () => { this.lighting = structuredClone(after); },
      undo: () => { this.lighting = structuredClone(before); },
    });
    return true;
  }

  /** The caller resolves names and IDs explicitly before passing a canonical shape. */
  setShapeSurface(shape, value) {
    if (!shape || this.shapes.getById(shape.id) !== shape) throw new Error('Surface target must belong to this cell');
    const surface = validateSurface(value), before = structuredClone(shape.params), after = structuredClone(before);
    if (surface === undefined) delete after.surface; else after.surface = surface;
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    this._preflightShape(shape, { ...shape, params: after });
    this._exec({
      execute: () => { shape.params = structuredClone(after); if (surface !== undefined) this._hasSurfaceData = true; },
      undo: () => { shape.params = structuredClone(before); },
    });
    return true;
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
      ...(this.lighting === undefined ? {} : { lighting: structuredClone(this.lighting) }),
    };
  }

  static fromJSON(json, size, options) {
    const cell = new Cell(size, { name: json.name, reference: json.reference ?? null, lighting: json.lighting });
    const shapes = ShapeRegistry.fromJSON(json.shapes, options);
    for (const shape of shapes.listByZ()) {
      cell.shapes.add(shape);
      cell._reserveShapeZ(shape);
    }
    return cell;
  }
}
