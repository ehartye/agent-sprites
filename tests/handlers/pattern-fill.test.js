import { describe, it, expect } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { handleDraw } from '../../server/handlers/draw.js';
import { handleRecolorShape } from '../../server/handlers/shape.js';
import { mapCommandToApi } from '../../scripts/batch-commands.js';

function mkState() {
  return { project: Project.create({ name: 't', cellSize: 32, rows: 1, cols: 1, palette: 'db-32' }), broadcast: () => {} };
}

describe('draw with a pattern', () => {
  it('stores pattern and color2 on filled rect, circle, ellipse and polygon', () => {
    const state = mkState();
    const cell = state.project.cells.getCell('0,0');
    handleDraw(state, 'rect', { cell: '0,0', x: 1, y: 1, w: 8, h: 8, color: '#6abe30', pattern: 'checker', color2: '#99e550', shape_name: 'lawn' });
    handleDraw(state, 'circle', { cell: '0,0', cx: 20, cy: 8, r: 5, color: '#6abe30', pattern: 'scatter', color2: '#99e550', shape_name: 'bush' });
    handleDraw(state, 'ellipse', { cell: '0,0', cx: 10, cy: 22, rx: 6, ry: 3, color: '#639bff', pattern: 'stripes', color2: '#5fcde4', shape_name: 'pond' });
    handleDraw(state, 'polygon', { cell: '0,0', points: '20,18 30,18 25,28', color: '#6abe30', pattern: 'sparse', color2: '#4b692f', shape_name: 'hill' });
    for (const [name, pattern, color2] of [['lawn', 'checker', '#99e550'], ['bush', 'scatter', '#99e550'], ['pond', 'stripes', '#5fcde4'], ['hill', 'sparse', '#4b692f']]) {
      const shape = cell.shapes.get(name);
      expect(shape.params.pattern).toBe(pattern);
      expect(shape.params.color2).toBe(color2);
    }
    // round-trips through project JSON
    const json = JSON.parse(JSON.stringify(state.project.toJSON()));
    const restored = Project.fromJSON(json).cells.getCell('0,0').shapes.get('lawn');
    expect(restored.params.pattern).toBe('checker');
    expect(restored.params.color2).toBe('#99e550');
  });

  it('leaves params free of pattern keys when no pattern is requested', () => {
    const state = mkState();
    handleDraw(state, 'rect', { cell: '0,0', x: 1, y: 1, w: 4, h: 4, color: '#6abe30', shape_name: 'plain' });
    const shape = state.project.cells.getCell('0,0').shapes.get('plain');
    expect('pattern' in shape.params).toBe(false);
    expect('color2' in shape.params).toBe(false);
  });

  it('rejects unknown patterns and a pattern without color2', () => {
    const state = mkState();
    expect(() => handleDraw(state, 'rect', { cell: '0,0', x: 1, y: 1, w: 4, h: 4, color: '#6abe30', pattern: 'plaid', color2: '#000000' })).toThrow(/Unknown pattern/);
    expect(() => handleDraw(state, 'rect', { cell: '0,0', x: 1, y: 1, w: 4, h: 4, color: '#6abe30', pattern: 'checker' })).toThrow(/color2/);
    expect(() => handleDraw(state, 'line', { cell: '0,0', x1: 0, y1: 0, x2: 5, y2: 5, color: '#6abe30', pattern: 'checker', color2: '#000' })).toThrow(/pattern/);
  });

  it('recolor can change color2 too, and undo restores both', () => {
    const state = mkState();
    const cell = state.project.cells.getCell('0,0');
    handleDraw(state, 'rect', { cell: '0,0', x: 1, y: 1, w: 8, h: 8, color: '#6abe30', pattern: 'checker', color2: '#99e550', shape_name: 'lawn' });
    handleRecolorShape(state, { cell: '0,0', name: 'lawn', color: '#df7126', color2: '#fbf236' });
    expect(cell.shapes.get('lawn').color).toBe('#df7126');
    expect(cell.shapes.get('lawn').params.color2).toBe('#fbf236');
    handleRecolorShape(state, { cell: '0,0', name: 'lawn', color: '#ac3232' });
    expect(cell.shapes.get('lawn').params.color2).toBe('#fbf236');   // untouched when omitted
    cell.undo(); cell.undo();
    expect(cell.shapes.get('lawn').color).toBe('#6abe30');
    expect(cell.shapes.get('lawn').params.color2).toBe('#99e550');
  });
});

describe('batch mapping', () => {
  it('forwards pattern and color2 for draw and recolor operations', () => {
    const draw = mapCommandToApi({ command: 'draw', type: 'rect', cell: '0,0', x: 0, y: 0, w: 4, h: 4, color: '#fff', pattern: 'checker', color2: '#000' });
    expect(draw.body.pattern).toBe('checker');
    expect(draw.body.color2).toBe('#000');
    const recolor = mapCommandToApi({ command: 'recolor', cell: '0,0', shape: 'lawn', color: '#fff', color2: '#000' });
    expect(recolor.body.color2).toBe('#000');
    const group = mapCommandToApi({ command: 'recolor-group', cell: '0,0', name: 'g', color: '#fff', color2: '#000' });
    expect(group.body.color2).toBe('#000');
  });
});
