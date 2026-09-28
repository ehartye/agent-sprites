import { describe, it, expect } from 'vitest';
import { hitTestShapes } from '../../server/web/public/js/tools.js';
import { rasterShape, snapParams } from '../../server/web/public/js/shared/raster.js';

const S = (name, type, params, zIndex = 0) => ({ name, type, params, zIndex, visible: true });
const painted = shape => {
  const out = [];
  rasterShape(shape.type, snapParams(shape.params), { px: (x, y) => out.push([x, y]), rect: (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) out.push([i, j]); } });
  return out;
};

describe('hitTestShapes follows the drawn pixels', () => {
  it('selects a filled polygon anywhere it paints', () => {
    const star = S('star', 'polygon', { points: [{ x: 10, y: 0 }, { x: 13, y: 19 }, { x: 0, y: 7 }, { x: 19, y: 7 }, { x: 6, y: 19 }], filled: true });
    for (const [x, y] of painted(star)) expect(hitTestShapes([star], x, y)?.name).toBe('star');
  });
  it('selects every pixel of outline circles and ellipses, and not their hollow centres', () => {
    for (const shape of [S('ring', 'circle', { cx: 10, cy: 10, r: 7, filled: false }), S('oval', 'ellipse', { cx: 10, cy: 10, rx: 8, ry: 3, filled: false })]) {
      for (const [x, y] of painted(shape)) expect(hitTestShapes([shape], x, y)?.name).toBe(shape.name);
      expect(hitTestShapes([shape], 10, 10)).toBeNull();
    }
  });
  it('matches the export circle rule at the rim of a filled circle', () => {
    // (r+0.5)² includes (13,11) for r=3 at (10,10); the old r² test missed it.
    const disc = S('disc', 'circle', { cx: 10, cy: 10, r: 3, filled: true });
    expect(hitTestShapes([disc], 13, 11)?.name).toBe('disc');
  });
  it('forgives a click one pixel beside a thin stroke when nothing is painted there', () => {
    const line = S('line', 'line', { x1: 0, y1: 0, x2: 19, y2: 7 });
    expect(hitTestShapes([line], 5, 3)?.name).toBe('line');
    expect(hitTestShapes([line], 5, 5)).toBeNull();
  });
  it('prefers the topmost shape that paints the pixel over a nearby stroke', () => {
    const under = S('under', 'rect', { x: 0, y: 0, w: 20, h: 20, filled: true }, 0);
    const over = S('over', 'point', { x: 5, y: 5 }, 1);
    expect(hitTestShapes([under, over], 5, 5)?.name).toBe('over');
    expect(hitTestShapes([under, over], 5, 6)?.name).toBe('under');
  });
  it('does not select an outline rect from its hollow middle', () => {
    const box = S('box', 'rect', { x: 2, y: 2, w: 10, h: 10, filled: false });
    expect(hitTestShapes([box], 6, 6)).toBeNull();
    expect(hitTestShapes([box], 2, 6)?.name).toBe('box');
  });
  it('selects a flood fill by its seed and skips hidden shapes', () => {
    expect(hitTestShapes([S('f', 'fill', { x: 3, y: 4 })], 3, 4)?.name).toBe('f');
    expect(hitTestShapes([{ ...S('p', 'point', { x: 1, y: 1 }), visible: false }], 1, 1)).toBeNull();
  });
});
