import { describe, it, expect, beforeEach } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { handleDraw } from '../../server/handlers/draw.js';
import { handleTweenShape } from '../../server/handlers/shape.js';
import { handleCloneFanout } from '../../server/handlers/cell.js';

describe('server-side tween', () => {
  let state;
  beforeEach(() => {
    state = {
      project: Project.create({ name: 'test', cellSize: 16, rows: 1, cols: 4, palette: 'pico8' }),
      sessionId: 's1',
      db: { getCellGroups: () => ({ fly: ['0,0', '0,1', '0,2', '0,3'] }) },
      broadcast: () => {},
    };
    handleDraw(state, 'circle', { cell: '0,0', cx: 2, cy: 8, r: 2, color: '#ff004d', shape_name: 'ball' });
    handleCloneFanout(state, { from: '0,0', to: ['0,1', '0,2', '0,3'] });
  });

  function cxAt(cell) {
    return state.project.cells.getCell(cell).shapes.getByName('ball').params.cx;
  }

  it('tweens position linearly across the group', () => {
    const res = handleTweenShape(state, { group: 'fly', shape: 'ball', to: { x: 12, y: 8 } });
    expect(res.frames).toBe(4);
    expect(cxAt('0,0')).toBe(2);
    expect(cxAt('0,1')).toBe(5);
    expect(cxAt('0,2')).toBe(9);
    expect(cxAt('0,3')).toBe(12);
  });

  it('tweens numeric params via to_updates', () => {
    handleTweenShape(state, { group: 'fly', shape: 'ball', to_updates: { r: 5 } });
    const rAt = (c) => state.project.cells.getCell(c).shapes.getByName('ball').params.r;
    expect([rAt('0,0'), rAt('0,1'), rAt('0,2'), rAt('0,3')]).toEqual([2, 3, 4, 5]);
  });

  it('applies easing', () => {
    handleTweenShape(state, { group: 'fly', shape: 'ball', from: { x: 2, y: 8 }, to: { x: 12, y: 8 }, ease: 'in' });
    expect(cxAt('0,1')).toBe(3); // 2 + 10*(1/9)
    expect(cxAt('0,2')).toBe(6); // 2 + 10*(4/9)
  });

  it('rejects unknown groups, shapes, and eases', () => {
    expect(() => handleTweenShape(state, { group: 'nope', shape: 'ball', to: { x: 1, y: 1 } })).toThrow(/nope/);
    expect(() => handleTweenShape(state, { group: 'fly', shape: 'ghost', to: { x: 1, y: 1 } })).toThrow(/ghost/);
    expect(() => handleTweenShape(state, { group: 'fly', shape: 'ball', to: { x: 1, y: 1 }, ease: 'bouncy' })).toThrow(/bouncy/);
    expect(() => handleTweenShape(state, { group: 'fly', shape: 'ball' })).toThrow(/to/);
    expect(() => handleTweenShape(state, { group: 'fly', shape: 'ball', to_updates: { filled: 9 } })).toThrow(/filled/);
  });

  describe('vertex morphs', () => {
    const original = [{ x: 1, y: 1 }, { x: 10, y: 1 }, { x: 6, y: 10 }];
    const end = [{ x: 4, y: 4 }, { x: 13, y: 7 }, { x: 6, y: 13 }];
    const vertices = c => state.project.cells.getCell(c).shapes.get('outline').params.points;
    function seed(type = 'polygon') {
      handleDraw(state, type, { cell: '0,0', points: original, color: '#ffffff', shape_name: 'outline' });
      handleCloneFanout(state, { from: '0,0', to: ['0,1', '0,2', '0,3'] });
    }
    it.each(['polygon', 'polyline'])('interpolates %s vertices and keeps each frame undoable', type => {
      seed(type);
      expect(handleTweenShape(state, { group: 'fly', shape: 'outline', to_updates: { points: end } })).toEqual({ frames: 4 });
      expect(vertices('0,0')).toEqual(original);
      expect(vertices('0,1')).toEqual([{ x: 2, y: 2 }, { x: 11, y: 3 }, { x: 6, y: 11 }]);
      expect(vertices('0,3')).toEqual(end);
      state.project.cells.getCell('0,3').undo();
      expect(vertices('0,3')).toEqual(original);
      expect(vertices('0,1')).toEqual([{ x: 2, y: 2 }, { x: 11, y: 3 }, { x: 6, y: 11 }]);
    });
    it('honors an explicit start, easing and pixel rounding without mutating input', () => {
      seed();
      const start = original.map(p => ({ x: p.x - 3, y: p.y }));
      handleTweenShape(state, { group: 'fly', shape: 'outline', from_updates: { points: start }, to_updates: { points: end }, ease: 'in' });
      expect(vertices('0,0')).toEqual(start);
      expect(vertices('0,1')[0]).toEqual({ x: -1, y: 1 });
      expect(vertices('0,3')).toEqual(end);
      expect(start[0]).toEqual({ x: -2, y: 1 });
    });
    it.each([
      ['different vertex counts', [{ x: 2, y: 3 }], /vertex count/i],
      ['nonfinite coordinates', [{ x: Infinity, y: 1 }, ...end.slice(1)], /finite/i],
      ['missing coordinates', [{ x: 2 }, ...end.slice(1)], /finite/i],
      ['string coordinates', [{ x: '2', y: 3 }, ...end.slice(1)], /finite/i],
      ['non-array points', '2,3 4,5 6,7', /array/i],
    ])('rejects %s before editing any frame', (_, points, message) => {
      seed();
      expect(() => handleTweenShape(state, { group: 'fly', shape: 'outline', to_updates: { points } })).toThrow(message);
      expect(vertices('0,0')).toEqual(original);
      expect(vertices('0,3')).toEqual(original);
    });
    it('validates every frame before any mutation', () => {
      seed();
      state.project.cells.getCell('0,3').deleteShape('outline');
      expect(() => handleTweenShape(state, { group: 'fly', shape: 'outline', from_updates: { points: end }, to_updates: { points: original } })).toThrow(/0,3/);
      expect(vertices('0,0')).toEqual(original);
      expect(vertices('0,1')).toEqual(original);
    });
    it('rejects a vertex count mismatch in a later frame', () => {
      seed();
      state.project.cells.getCell('0,3').updateShapeParams('outline', { points: end.slice(0, 2) });
      expect(() => handleTweenShape(state, { group: 'fly', shape: 'outline', to_updates: { points: end } })).toThrow(/vertex count.*0,3/i);
      expect(vertices('0,1')).toEqual(original);
    });
    it('rejects ambiguous position and absolute-vertex morphs', () => {
      seed();
      expect(() => handleTweenShape(state, { group: 'fly', shape: 'outline', to: { x: 5, y: 5 }, to_updates: { points: end } })).toThrow(/points.*position/i);
    });
  });
});
