import { describe, it, expect } from 'vitest';
import { Cell } from '../../server/engine/cell.js';

describe('Cell', () => {
  it('creates with given size', () => {
    const cell = new Cell(16);
    expect(cell.width).toBe(16);
    expect(cell.height).toBe(16);
    expect(cell.shapes.listByZ()).toEqual([]);
  });

  it('draws a shape and returns it', () => {
    const cell = new Cell(16);
    const shape = cell.draw('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red');
    expect(shape.type).toBe('rect');
    expect(cell.shapes.getById(shape.id)).toBe(shape);
  });

  it('draws with auto-incrementing zIndex', () => {
    const cell = new Cell(16);
    const a = cell.draw('point', { x: 0, y: 0 }, 'red');
    const b = cell.draw('point', { x: 1, y: 1 }, 'blue');
    expect(b.zIndex).toBeGreaterThan(a.zIndex);
  });

  it('undoes a draw', () => {
    const cell = new Cell(16);
    const shape = cell.draw('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red');
    cell.undo();
    expect(cell.shapes.getById(shape.id)).toBeNull();
  });

  it('redoes an undone draw', () => {
    const cell = new Cell(16);
    const shape = cell.draw('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red');
    const id = shape.id;
    cell.undo();
    cell.redo();
    expect(cell.shapes.getById(id)).not.toBeNull();
  });

  it('clears redo stack on new draw after undo', () => {
    const cell = new Cell(16);
    cell.draw('point', { x: 0, y: 0 }, 'red');
    cell.undo();
    cell.draw('point', { x: 1, y: 1 }, 'blue');
    cell.redo(); // should be no-op
    expect(cell.shapes.listByZ().length).toBe(1);
  });

  it('respects max undo depth', () => {
    const cell = new Cell(16, { maxUndo: 3 });
    cell.draw('point', { x: 0, y: 0 }, 'a');
    cell.draw('point', { x: 1, y: 1 }, 'b');
    cell.draw('point', { x: 2, y: 2 }, 'c');
    cell.draw('point', { x: 3, y: 3 }, 'd');
    // 4 draws, max 3 undo — oldest should be gone
    cell.undo();
    cell.undo();
    cell.undo();
    cell.undo(); // no-op, stack exhausted
    expect(cell.shapes.listByZ().length).toBe(1); // first draw not undoable
  });

  it('moves a shape with undo support', () => {
    const cell = new Cell(16);
    const shape = cell.draw('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red', 'box');
    cell.moveShape('box', 3, 2);
    expect(shape.params.x).toBe(3);
    expect(shape.params.y).toBe(2);
    cell.undo();
    expect(shape.params.x).toBe(0);
    expect(shape.params.y).toBe(0);
  });

  it('recolors a shape with undo support', () => {
    const cell = new Cell(16);
    const shape = cell.draw('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red', 'box');
    cell.recolorShape('box', 'blue');
    expect(shape.color).toBe('blue');
    cell.undo();
    expect(shape.color).toBe('red');
  });

  describe.each(['delete', 'clear'])('history across %s restoration', (removal) => {
    const mutations = [
      ['move', cell => cell.moveShape('box', 3, 2)],
      ['recolor', cell => cell.recolorShape('box', '#0000ff', '#ffffff')],
      ['resize', cell => cell.updateShapeParams('box', { w: 6, h: 3 })],
      ['flip', cell => cell.flipShape('box', 'horizontal', { about: 'cell' })],
      ['rotate', cell => cell.rotateShape('box', 90, { about: 'cell' })],
      ['z-order', cell => cell.setZ('box', 7)],
    ];

    it.each(mutations)('undoes and redoes %s on the restored registered shape', (_name, mutate) => {
      const cell = new Cell(16);
      cell.draw('point', { x: 0, y: 0 }, '#ffffff', 'background');
      const backgroundOnly = cell.toJSON();
      const shape = cell.draw('rect', { x: 2, y: 3, w: 4, h: 2, color2: '#00ff00' }, '#ff0000', 'box');
      const original = cell.toJSON();
      mutate(cell);
      const changed = cell.toJSON();
      expect(changed).not.toEqual(original);
      if (removal === 'delete') cell.deleteShape('box');
      else cell.clear();
      const removed = cell.toJSON();

      expect(cell.undo()).toBe(true);
      expect(cell.toJSON()).toEqual(changed);
      expect(cell.shapes.get('box').id).toBe(shape.id);
      expect(cell.undo()).toBe(true);
      expect(cell.toJSON()).toEqual(original);
      expect(cell.redo()).toBe(true);
      expect(cell.toJSON()).toEqual(changed);
      expect(cell.redo()).toBe(true);
      expect(cell.toJSON()).toEqual(removed);

      cell.undo();
      cell.undo();
      cell.undo();
      expect(cell.toJSON()).toEqual(backgroundOnly);
      cell.redo();
      expect(cell.toJSON()).toEqual(original);
      cell.redo();
      expect(cell.toJSON()).toEqual(changed);
      cell.redo();
      expect(cell.toJSON()).toEqual(removed);
    });

    it.each([
      ['move', cell => cell.moveShape('box', 3, 2)],
      ['flip', cell => cell.flipShape('box', 'horizontal', { about: 'cell' })],
      ['rotate', cell => cell.rotateShape('box', 90, { about: 'cell' })],
    ])('keeps the saved vertices unchanged across repeated %s undo/redo', (_name, mutate) => {
      const cell = new Cell(16);
      cell.draw('polygon', { points: [{ x: 2, y: 3 }, { x: 7, y: 4 }, { x: 3, y: 8 }] }, '#ff0000', 'box');
      const original = cell.toJSON();
      mutate(cell);
      const changed = cell.toJSON();
      if (removal === 'delete') cell.deleteShape('box');
      else cell.clear();
      cell.undo();
      cell.undo();
      expect(cell.toJSON()).toEqual(original);
      for (let cycle = 0; cycle < 2; cycle++) {
        cell.redo();
        expect(cell.toJSON()).toEqual(changed);
        cell.undo();
        expect(cell.toJSON()).toEqual(original);
      }
    });

    it('removes parameters introduced by an undone mutation', () => {
      const cell = new Cell(16);
      cell.draw('rect', { x: 2, y: 3, w: 4, h: 2 }, '#ff0000', 'box');
      const original = cell.toJSON();
      cell.updateShapeParams('box', { filled: true });
      if (removal === 'delete') cell.deleteShape('box');
      else cell.clear();
      cell.undo();
      cell.undo();
      expect(cell.toJSON()).toEqual(original);
      cell.redo();
      expect(cell.shapes.get('box').params.filled).toBe(true);
    });

    it('replays a vertex update from its saved input after later movement', () => {
      const cell = new Cell(16);
      cell.draw('polygon', { points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 3 }] }, '#ff0000', 'box');
      const original = cell.toJSON();
      const updates = { points: [{ x: 2, y: 3 }, { x: 5, y: 3 }, { x: 2, y: 6 }] };
      cell.updateShapeParams('box', updates);
      const updated = cell.toJSON();
      cell.moveShape('box', 2, 3);
      const moved = cell.toJSON();
      if (removal === 'delete') cell.deleteShape('box');
      else cell.clear();
      cell.undo(); cell.undo(); cell.undo();
      expect(cell.toJSON()).toEqual(original);
      cell.redo();
      expect(cell.toJSON()).toEqual(updated);
      cell.redo();
      expect(cell.toJSON()).toEqual(moved);
      expect(updates.points[0]).toEqual({ x: 2, y: 3 });
    });
  });

  it('has optional name', () => {
    const cell = new Cell(16);
    expect(cell.name).toBeNull();
    cell.name = 'idle_1';
    expect(cell.name).toBe('idle_1');
  });

  it('serializes and deserializes', () => {
    const cell = new Cell(16);
    cell.name = 'test';
    cell.draw('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red', 'box');
    const json = cell.toJSON();
    const restored = Cell.fromJSON(json, 16);
    expect(restored.name).toBe('test');
    expect(restored.shapes.getByName('box')).toBeDefined();
  });
});
