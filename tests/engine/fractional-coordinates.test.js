import { describe, it, expect } from 'vitest';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';
import { Cell } from '../../server/engine/cell.js';
import { Palette } from '../../server/engine/palette.js';
import { Project } from '../../server/engine/project.js';
import { handleDraw } from '../../server/handlers/draw.js';

const palette = new Palette([{ name: 'red', color: '#ff0000' }]);
const alpha = (data, w, x, y) => data[(y * w + x) * 4 + 3];

describe('fractional coordinates', () => {
  it('renders a line with fractional endpoints in finite time, on rounded pixels', () => {
    const cell = new Cell(16);
    cell.draw('line', { x1: 0, y1: 8, x2: 8, y2: 3.5 }, '#ff0000');   // used to spin forever in Bresenham
    const started = Date.now();
    const data = new CanvasRenderer(palette).renderCellRaw(cell);
    expect(Date.now() - started).toBeLessThan(15000);   // finite, as opposed to never
    expect(alpha(data, 16, 0, 8)).toBe(255);
    expect(alpha(data, 16, 8, 4)).toBe(255);   // 3.5 rounds to 4
  });

  it('renders rects, circles, ellipses and points with fractional params without hanging', () => {
    const cell = new Cell(32);
    cell.draw('rect', { x: 1.4, y: 1.6, w: 5.5, h: 3.2, filled: true }, '#ff0000');
    cell.draw('circle', { cx: 20.5, cy: 10.2, r: 3.7, filled: false }, '#ff0000');
    cell.draw('ellipse', { cx: 10.5, cy: 22.5, rx: 4.4, ry: 2.6, filled: true }, '#ff0000');
    cell.draw('point', { x: 30.6, y: 30.4 }, '#ff0000');
    const started = Date.now();
    const data = new CanvasRenderer(palette).renderCellRaw(cell);
    expect(Date.now() - started).toBeLessThan(15000);   // finite, as opposed to never
    expect(alpha(data, 32, 31, 30)).toBe(255);
  });
});

describe('draw handler coordinate rounding', () => {
  const mkState = () => ({ project: Project.create({ name: 't', cellSize: 32, rows: 1, cols: 1, palette: 'db-32' }), broadcast: () => {} });

  it('stores integer coordinates for every primitive', () => {
    const state = mkState();
    const cell = state.project.cells.getCell('0,0');
    handleDraw(state, 'line', { cell: '0,0', x1: 0.4, y1: 7.6, x2: 8.2, y2: 3.5, color: '#fff', shape_name: 'l' });
    handleDraw(state, 'rect', { cell: '0,0', x: 1.4, y: 1.6, w: 5.5, h: 3.2, color: '#fff', shape_name: 'r' });
    handleDraw(state, 'circle', { cell: '0,0', cx: 20.5, cy: 10.2, r: 3.7, color: '#fff', shape_name: 'c' });
    handleDraw(state, 'ellipse', { cell: '0,0', cx: 10.5, cy: 22.5, rx: 4.4, ry: 2.6, color: '#fff', shape_name: 'e' });
    handleDraw(state, 'polygon', { cell: '0,0', points: [[1.2, 1.7], [9.6, 2.1], [5.5, 9.9]], color: '#fff', shape_name: 'p' });
    handleDraw(state, 'point', { cell: '0,0', x: 30.6, y: 30.4, color: '#fff', shape_name: 'pt' });
    expect(cell.shapes.get('l').params).toEqual({ x1: 0, y1: 8, x2: 8, y2: 4 });
    expect(cell.shapes.get('r').params).toMatchObject({ x: 1, y: 2, w: 6, h: 3 });
    expect(cell.shapes.get('c').params).toMatchObject({ cx: 21, cy: 10, r: 4 });
    expect(cell.shapes.get('e').params).toMatchObject({ cx: 11, cy: 23, rx: 4, ry: 3 });
    expect(cell.shapes.get('p').params.points).toEqual([{ x: 1, y: 2 }, { x: 10, y: 2 }, { x: 6, y: 10 }]);
    expect(cell.shapes.get('pt').params).toEqual({ x: 31, y: 30 });
  });

  it('rejects coordinates that are not numbers', () => {
    const state = mkState();
    expect(() => handleDraw(state, 'line', { cell: '0,0', x1: 'a', y1: 0, x2: 4, y2: 4, color: '#fff' })).toThrow(/x1/);
    expect(() => handleDraw(state, 'rect', { cell: '0,0', x: 0, y: 0, w: undefined, h: 4, color: '#fff' })).toThrow(/w/);
  });
});
