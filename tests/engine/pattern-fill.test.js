import { describe, it, expect } from 'vitest';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';
import { Cell } from '../../server/engine/cell.js';
import { Palette } from '../../server/engine/palette.js';
import { PATTERNS, patternTest } from '../../server/engine/patterns.js';

const palette = new Palette([{ name: 'red', color: '#ff0000' }, { name: 'blue', color: '#0000ff' }]);
const rgb = (data, w, x, y) => [data[(y * w + x) * 4], data[(y * w + x) * 4 + 1], data[(y * w + x) * 4 + 2], data[(y * w + x) * 4 + 3]];

describe('pattern fills', () => {
  it('checker rect alternates between color and color2', () => {
    const cell = new Cell(16);
    cell.draw('rect', { x: 2, y: 2, w: 6, h: 4, filled: true, pattern: 'checker', color2: '#0000ff' }, '#ff0000');
    const data = new CanvasRenderer(palette).renderCellRaw(cell);
    expect(rgb(data, 16, 2, 2)).toEqual([0, 0, 255, 255]);   // (x+y) even -> color2
    expect(rgb(data, 16, 3, 2)).toEqual([255, 0, 0, 255]);   // odd -> color
    expect(rgb(data, 16, 3, 3)).toEqual([0, 0, 255, 255]);
    expect(rgb(data, 16, 1, 2)).toEqual([0, 0, 0, 0]);       // outside untouched
  });

  it('patterns a polygon fill but leaves its outline in the base color', () => {
    const cell = new Cell(16);
    cell.draw('polygon', { points: [{ x: 1, y: 1 }, { x: 12, y: 1 }, { x: 12, y: 12 }, { x: 1, y: 12 }], filled: true, pattern: 'checker', color2: '#0000ff' }, '#ff0000');
    const data = new CanvasRenderer(palette).renderCellRaw(cell);
    for (let x = 1; x <= 12; x++) expect(rgb(data, 16, x, 1)).toEqual([255, 0, 0, 255]);   // top edge stays red
    expect(rgb(data, 16, 2, 2)).toEqual([0, 0, 255, 255]);
    expect(rgb(data, 16, 3, 2)).toEqual([255, 0, 0, 255]);
  });

  it('patterns circles and ellipses with scatter and sparse', () => {
    const cell = new Cell(32);
    cell.draw('circle', { cx: 8, cy: 8, r: 6, filled: true, pattern: 'sparse', color2: 'blue' }, 'red');
    cell.draw('ellipse', { cx: 22, cy: 20, rx: 8, ry: 5, filled: true, pattern: 'scatter', color2: '#0000ff' }, '#ff0000');
    const data = new CanvasRenderer(palette).renderCellRaw(cell);
    expect(rgb(data, 32, 8, 8)).toEqual([0, 0, 255, 255]);    // even, even -> sparse dot
    expect(rgb(data, 32, 9, 8)).toEqual([255, 0, 0, 255]);
    let blue = 0, red = 0;
    for (let y = 15; y <= 25; y++) for (let x = 14; x <= 30; x++) { const p = rgb(data, 32, x, y); if (p[3]) (p[2] === 255 ? blue++ : red++); }
    expect(blue).toBeGreaterThan(5);
    expect(blue).toBeLessThan(red);                              // scatter is sparse
  });

  it('ignores a pattern on unfilled shapes', () => {
    const cell = new Cell(16);
    cell.draw('rect', { x: 2, y: 2, w: 6, h: 4, filled: false, pattern: 'checker', color2: '#0000ff' }, '#ff0000');
    const data = new CanvasRenderer(palette).renderCellRaw(cell);
    expect(rgb(data, 16, 2, 2)).toEqual([255, 0, 0, 255]);
    expect(rgb(data, 16, 3, 2)).toEqual([255, 0, 0, 255]);
  });

  it('exposes every pattern by name and rejects unknown ones', () => {
    expect(Object.keys(PATTERNS)).toEqual(['checker', 'stripes', 'sparse', 'scatter']);
    expect(patternTest('stripes')(3, 4)).toBe(true);
    expect(patternTest('stripes')(3, 5)).toBe(false);
    expect(() => patternTest('plaid')).toThrow(/Unknown pattern/);
  });
});
