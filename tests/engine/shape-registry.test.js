import { describe, it, expect } from 'vitest';
import { ShapeRegistry } from '../../server/engine/shape-registry.js';
import { Shape } from '../../server/engine/shape.js';

describe('ShapeRegistry', () => {
  it('adds a shape and retrieves by id', () => {
    const reg = new ShapeRegistry();
    const shape = new Shape('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red');
    reg.add(shape);
    expect(reg.getById(shape.id)).toBe(shape);
  });

  it('retrieves by name', () => {
    const reg = new ShapeRegistry();
    const shape = new Shape('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red', { name: 'box' });
    reg.add(shape);
    expect(reg.getByName('box')).toBe(shape);
  });

  it('throws on duplicate name', () => {
    const reg = new ShapeRegistry();
    reg.add(new Shape('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red', { name: 'box' }));
    expect(() =>
      reg.add(new Shape('rect', { x: 1, y: 1, w: 3, h: 3, filled: true }, 'blue', { name: 'box' }))
    ).toThrow('already exists');
  });

  it('rejects duplicate IDs without replacing an existing named shape', () => {
    const reg = new ShapeRegistry();
    const original = new Shape('point', { x: 0, y: 0 }, 'red', { name: 'original' });
    reg.add(original);
    const duplicate = new Shape('point', { x: 1, y: 1 }, 'blue', { name: 'other' });
    duplicate.id = original.id;
    expect(() => reg.add(duplicate)).toThrow('already exists');
    expect(reg.get(original.id)).toBe(original);
    expect(reg.get('original')).toBe(original);
    expect(reg.get('other')).toBeNull();
  });

  it('names an existing shape', () => {
    const reg = new ShapeRegistry();
    const shape = new Shape('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red');
    reg.add(shape);
    reg.nameShape(shape.id, 'box');
    expect(reg.getByName('box')).toBe(shape);
    expect(shape.name).toBe('box');
  });

  it('removes a shape', () => {
    const reg = new ShapeRegistry();
    const shape = new Shape('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red', { name: 'box' });
    reg.add(shape);
    reg.remove(shape.id);
    expect(reg.getById(shape.id)).toBeNull();
    expect(reg.getByName('box')).toBeNull();
  });

  it('lists shapes sorted by zIndex', () => {
    const reg = new ShapeRegistry();
    const a = new Shape('point', { x: 0, y: 0 }, 'red', { zIndex: 2 });
    const b = new Shape('point', { x: 1, y: 1 }, 'blue', { zIndex: 0 });
    const c = new Shape('point', { x: 2, y: 2 }, 'green', { zIndex: 1 });
    reg.add(a);
    reg.add(b);
    reg.add(c);
    const list = reg.listByZ();
    expect(list[0]).toBe(b);
    expect(list[1]).toBe(c);
    expect(list[2]).toBe(a);
  });

  it('clears all shapes', () => {
    const reg = new ShapeRegistry();
    reg.add(new Shape('point', { x: 0, y: 0 }, 'red'));
    reg.add(new Shape('point', { x: 1, y: 1 }, 'blue'));
    reg.clear();
    expect(reg.listByZ()).toEqual([]);
  });

  it('serializes and deserializes', () => {
    const reg = new ShapeRegistry();
    reg.add(new Shape('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red', { name: 'box' }));
    const json = reg.toJSON();
    const restored = ShapeRegistry.fromJSON(json);
    expect(restored.getByName('box')).toMatchObject({ type: 'rect', params: { x: 0, y: 0, w: 5, h: 5, filled: true }, color: 'red' });
  });
});
