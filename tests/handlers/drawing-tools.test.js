import { describe, it, expect, beforeEach } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { handleDraw } from '../../server/handlers/draw.js';

describe('Drawing tools', () => {
  let state;
  beforeEach(() => {
    state = {
      project: Project.create({ name: 'test', cellSize: 16, rows: 2, cols: 2 }),
      broadcast: () => {},
    };
  });

  it('draws a point', () => {
    const result = handleDraw(state, 'point', { cell: '0,0', x: 5, y: 3, color: '#ff0000' });
    expect(result.shapeId).toBeDefined();
    const cell = state.project.cells.getCell('0,0');
    expect(cell.shapes.listByZ().length).toBe(1);
  });

  it('rejects a missing color at draw time with a clear error', () => {
    expect(() => handleDraw(state, 'point', { cell: '0,0', x: 5, y: 3 }))
      .toThrow(/color is required/);
    expect(() => handleDraw(state, 'rect', { cell: '0,0', x: 0, y: 0, w: 4, h: 4, color: undefined }))
      .toThrow(/color is required/);
    // nothing half-drawn
    expect(state.project.cells.getCell('0,0').shapes.listByZ().length).toBe(0);
  });

  it('draws a line', () => {
    const result = handleDraw(state, 'line', { cell: '0,0', x1: 0, y1: 0, x2: 10, y2: 10, color: '#ff0000' });
    expect(result.shapeId).toBeDefined();
  });

  it('draws a named shape', () => {
    handleDraw(state, 'rect', {
      cell: '0,0', x: 0, y: 0, w: 5, h: 5, color: '#ff0000', filled: true, shape_name: 'box',
    });
    const cell = state.project.cells.getCell('0,0');
    expect(cell.shapes.getByName('box')).toBeDefined();
  });

  it('draws a circle', () => {
    const result = handleDraw(state, 'circle', { cell: '0,0', cx: 8, cy: 8, r: 5, color: '#00ff00' });
    expect(result.shapeId).toBeDefined();
  });

  it('draws a fill', () => {
    const result = handleDraw(state, 'fill', { cell: '0,0', x: 0, y: 0, color: '#0000ff' });
    expect(result.shapeId).toBeDefined();
  });

  it('throws without a project', () => {
    state.project = null;
    expect(() => handleDraw(state, 'point', { cell: '0,0', x: 0, y: 0, color: '#ff0000' }))
      .toThrow('No active project');
  });

  it('throws for unknown draw type', () => {
    expect(() => handleDraw(state, 'hexagon', { cell: '0,0', color: '#ff0000' }))
      .toThrow('Unknown draw type');
  });

  it('calls broadcast after draw', () => {
    const messages = [];
    state.broadcast = (msg) => messages.push(msg);
    handleDraw(state, 'point', { cell: '0,0', x: 0, y: 0, color: '#ff0000' });
    expect(messages.length).toBe(1);
    expect(messages[0].type).toBe('draw');
    expect(messages[0].cell).toBe('0,0');
  });
});
