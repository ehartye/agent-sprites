import { describe, it, expect } from 'vitest';
import { Shape } from '../../server/engine/shape.js';

describe('Shape', () => {
  it('creates a shape with auto-generated id', () => {
    const shape = new Shape('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red');
    expect(shape.id).toMatch(/^s\d+$/);
    expect(shape.type).toBe('rect');
    expect(shape.params).toEqual({ x: 0, y: 0, w: 5, h: 5, filled: true });
    expect(shape.color).toBe('red');
    expect(shape.zIndex).toBe(0);
    expect(shape.visible).toBe(true);
    expect(shape.name).toBeNull();
  });

  it('accepts optional name and zIndex', () => {
    const shape = new Shape('line', { x1: 0, y1: 0, x2: 5, y2: 5 }, 'blue', {
      name: 'diagonal',
      zIndex: 3,
    });
    expect(shape.name).toBe('diagonal');
    expect(shape.zIndex).toBe(3);
  });

  it('generates unique ids', () => {
    const a = new Shape('point', { x: 0, y: 0 }, 'red');
    const b = new Shape('point', { x: 1, y: 1 }, 'red');
    expect(a.id).not.toBe(b.id);
  });

  it('clones with new id', () => {
    const original = new Shape('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red', { name: 'box' });
    const clone = original.clone();
    expect(clone.id).not.toBe(original.id);
    expect(clone.type).toBe(original.type);
    expect(clone.params).toEqual(original.params);
    expect(clone.params).not.toBe(original.params); // deep copy
    expect(clone.name).toBe('box'); // clones inherit name (needed for sprite_copy_cell)
  });

  it('serializes to JSON and deserializes', () => {
    const shape = new Shape('circle', { cx: 8, cy: 8, r: 3, filled: false }, 'outline', {
      name: 'head',
      zIndex: 2,
    });
    const json = shape.toJSON();
    const restored = Shape.fromJSON(json);
    expect(restored.id).toBe(shape.id);
    expect(restored.type).toBe('circle');
    expect(restored.params).toEqual({ cx: 8, cy: 8, r: 3, filled: false });
    expect(restored.color).toBe('outline');
    expect(restored.name).toBe('head');
    expect(restored.zIndex).toBe(2);
  });

  it('commits imported ID reservations and preserves later successful allocations after another transaction fails', () => {
    const before = new Shape('point', { x: 0, y: 0 }, 'red');
    const importedId = BigInt(before.id.slice(1)) + 1000n;
    const imported = Shape.withIdAllocationTransaction(() => Shape.fromJSON({ ...before.toJSON(), id: `s${importedId}` }));
    expect(imported.id).toBe(`s${importedId}`);
    const committed = new Shape('point', { x: 1, y: 1 }, 'blue');
    expect(committed.id).toBe(`s${importedId + 1n}`);
    expect(() => Shape.withIdAllocationTransaction(() => {
      Shape.fromJSON({ ...before.toJSON(), id: `s${importedId + 2000n}` });
      throw new Error('prospective activation failed');
    })).toThrow('prospective activation failed');
    expect(new Shape('point', { x: 2, y: 2 }, 'red').id).toBe(`s${importedId + 2n}`);
    expect(committed.clone().id).toBe(`s${importedId + 3n}`);
  });

  it('requires the allocation transaction to finish synchronously', () => {
    const before = new Shape('point', { x: 0, y: 0 }, 'red');
    expect(() => Shape.withIdAllocationTransaction(() => Promise.resolve())).toThrow(/synchronous/);
    expect(new Shape('point', { x: 1, y: 1 }, 'red').id).toBe(`s${BigInt(before.id.slice(1)) + 1n}`);
  });
});
