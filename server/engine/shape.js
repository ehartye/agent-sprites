import { validateSurface } from '../web/public/js/shared/surface-model.js';
import { isSharedParams } from './shared-geometry.js';
let nextId = 1;
function getParams() { return this._params; }
function setParams(value) { this._params = isSharedParams(value) ? structuredClone(value) : value; }

export class Shape {
  constructor(type, params, color, opts = {}) {
    const shared = opts.sharedGeometry && isSharedParams(params);
    const savedParams = shared ? params : structuredClone(params);
    if (!shared && savedParams && Object.hasOwn(savedParams, 'surface')) savedParams.surface = validateSurface(savedParams.surface);
    Shape.assertIdAllocationAvailable();
    this.id = `s${nextId++}`;
    this.type = type;
    Object.defineProperties(this, {
      _params: { value: savedParams, writable: true },
      // Keep the established own enumerable contract for spreads and snapshots.
      params: { enumerable: true, configurable: true, get: getParams, set: setParams },
    });
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
      sharedGeometry: isSharedParams(this.params),
    });
  }

  /** Explicitly detach pooled immutable geometry before a direct nested write. */
  mutableParams() {
    if (isSharedParams(this._params)) this._params = structuredClone(this._params);
    return this._params;
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

  static fromJSON(json, options = {}) {
    const geometry = options.resolveGeometry?.(json) ?? json;
    const shape = new Shape(geometry.type, geometry.params, json.color, {
      name: json.name,
      zIndex: json.zIndex,
      visible: json.visible,
      sharedGeometry: options.sharedGeometry,
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
