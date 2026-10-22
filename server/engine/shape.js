import { validateSurface } from '../web/public/js/shared/surface-model.js';
let nextId = 1;

export class Shape {
  constructor(type, params, color, opts = {}) {
    const savedParams = structuredClone(params);
    if (savedParams && Object.hasOwn(savedParams, 'surface')) savedParams.surface = validateSurface(savedParams.surface);
    Shape.assertIdAllocationAvailable();
    this.id = `s${nextId++}`;
    this.type = type;
    // Deep copy: params may hold nested structures (polygon points)
    this.params = savedParams;
    this.color = color;
    this.name = opts.name ?? null;
    this.zIndex = opts.zIndex ?? 0;
    this.visible = opts.visible ?? true;
  }

  clone() {
    return new Shape(this.type, this.params, this.color, {
      name: this.name,
      zIndex: this.zIndex,
      visible: this.visible,
    });
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      params: structuredClone(this.params),
      color: this.color,
      zIndex: this.zIndex,
      visible: this.visible,
    };
  }

  /** Reserve prospective import IDs only if its synchronous activation commits. */
  static withIdAllocationTransaction(action) {
    const checkpoint = nextId;
    try {
      const result = action();
      if (result && typeof result.then === 'function') throw new Error('Shape ID allocation transactions must be synchronous');
      return result;
    } catch (error) {
      nextId = checkpoint;
      throw error;
    }
  }

  static assertIdAllocationAvailable() {
    if (!Number.isSafeInteger(nextId) || nextId >= Number.MAX_SAFE_INTEGER) throw new Error('Shape ID space exhausted');
  }

  static fromJSON(json) {
    const shape = new Shape(json.type, json.params, json.color, {
      name: json.name,
      zIndex: json.zIndex,
      visible: json.visible,
    });
    shape.id = json.id;
    const numericId = /^s(\d+)$/.exec(shape.id);
    if (numericId) {
      const reserved = Number(numericId[1]) + 1;
      if (!Number.isSafeInteger(reserved)) throw new Error('Imported shape ID exceeds the supported ID space');
      nextId = Math.max(nextId, reserved);
    }
    return shape;
  }
}
