import { describe, it, expect } from 'vitest';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';
import { Cell } from '../../server/engine/cell.js';
import { Palette } from '../../server/engine/palette.js';

const palette = new Palette([{ name: 'red', color: '#ff0000' }]);
const render = shapes => { const cell = new Cell(32); for (const [type, params] of shapes) cell.draw(type, params, '#ff0000'); return new CanvasRenderer(palette).renderCellRaw(cell); };
const on = (data, x, y) => data[(y * 32 + x) * 4 + 3] === 255;
const rowWidths = (data, cx, cy, r) => { const widths = []; for (let y = cy - r; y <= cy + r; y++) { let w = 0; for (let x = cx - r; x <= cx + r; x++) if (on(data, x, y)) w++; widths.push(w); } return widths; };

describe('filled circles are round, without single-pixel nubs', () => {
  it('a radius-3 circle is rows 3,5,7,7,7,5,3', () => {
    const data = render([['circle', { cx: 10, cy: 10, r: 3, filled: true }]]);
    expect(rowWidths(data, 10, 10, 3)).toEqual([3, 5, 7, 7, 7, 5, 3]);
  });

  it('small radii read as circles: 2 -> 3,5,5,5,3 and 4 -> 5,7,9,9,9,9,9,7,5', () => {
    expect(rowWidths(render([['circle', { cx: 10, cy: 10, r: 2, filled: true }]]), 10, 10, 2)).toEqual([3, 5, 5, 5, 3]);
    expect(rowWidths(render([['circle', { cx: 12, cy: 12, r: 4, filled: true }]]), 12, 12, 4)).toEqual([5, 7, 9, 9, 9, 9, 9, 7, 5]);
  });

  it('never leaves a one-pixel cap row for radii 2 through 8, and stays symmetric', () => {
    for (let r = 2; r <= 8; r++) {
      const widths = rowWidths(render([['circle', { cx: 16, cy: 16, r, filled: true }]]), 16, 16, r);
      expect(Math.min(...widths), `radius ${r}`).toBeGreaterThan(1);
      expect(widths, `radius ${r}`).toEqual([...widths].reverse());
      expect(widths[r], `radius ${r} middle row`).toBe(2 * r + 1);
    }
  });

  it('leaves radius-1 circles and outlines unchanged', () => {
    const tiny = render([['circle', { cx: 5, cy: 5, r: 1, filled: true }]]);
    expect(rowWidths(tiny, 5, 5, 1)).toEqual([1, 3, 1]);
    const outline = render([['circle', { cx: 16, cy: 16, r: 5, filled: false }]]);
    expect(on(outline, 16, 11)).toBe(true);
    expect(on(outline, 16, 16)).toBe(false);
  });
});
