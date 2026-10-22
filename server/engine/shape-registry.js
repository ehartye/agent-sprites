import { Shape } from './shape.js';

export class ShapeRegistry {
  constructor() {
    this._byId = new Map();
    this._byName = new Map();
  }

  add(shape) {
    if (this._byId.has(shape.id)) throw new Error(`Shape ID "${shape.id}" already exists`);
    if (shape.name && this._byName.has(shape.name)) {
      throw new Error(`Shape name "${shape.name}" already exists`);
    }
    this._byId.set(shape.id, shape);
    if (shape.name) this._byName.set(shape.name, shape);
    return shape;
  }

  getById(id) {
    return this._byId.get(id) ?? null;
  }

  getByName(name) {
    return this._byName.get(name) ?? null;
  }

  get(ref) {
    return this.getByName(ref) ?? this.getById(ref);
  }

  nameShape(id, name) {
    const shape = this.getById(id);
    if (!shape) throw new Error(`Shape "${id}" not found`);
    if (this._byName.has(name)) throw new Error(`Name "${name}" already exists`);
    if (shape.name) this._byName.delete(shape.name);
    shape.name = name;
    this._byName.set(name, shape);
  }

  remove(id) {
    const shape = this._byId.get(id);
    if (shape) {
      if (shape.name) this._byName.delete(shape.name);
      this._byId.delete(id);
      return;
    }
    // Fallback: clean orphan byName entries whose shape is missing from byId.
    for (const [name, s] of this._byName) {
      if (s.id === id) this._byName.delete(name);
    }
  }

  listByZ() {
    return Array.from(this._byId.values()).sort((a, b) => a.zIndex - b.zIndex);
  }

  clear() {
    this._byId.clear();
    this._byName.clear();
  }

  toJSON() {
    return this.listByZ().map((s) => s.toJSON());
  }

  static fromJSON(json, options) {
    const reg = new ShapeRegistry();
    for (const data of json) {
      reg.add(Shape.fromJSON(data, options));
    }
    return reg;
  }
}
