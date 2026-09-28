// Helpers that compute pixels from a shape (border, ring, clip_to, highlight and
// shadow containment) must use the silhouette the export actually renders.
import { describe, it, expect } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { handleDraw } from '../../server/handlers/draw.js';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';

const setup = () => ({ project: Project.create({ name: 't', cellSize: 24, rows: 1, cols: 1, palette: 'pico8' }), broadcast: () => {} });
const cellOf = state => state.project.cells.getCell('0,0');
const rendered = (state, name) => new CanvasRenderer(state.project.palette).shapeCoverage(cellOf(state).shapes.get(name), 24, 24);
const emitted = (state, names) => new Set(names.map(n => { const p = cellOf(state).shapes.get(n).params; return `${p.x},${p.y}`; }));
const neighbours = key => { const [x, y] = key.split(',').map(Number); return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => `${x + dx},${y + dy}`); };
const halo = cover => new Set([...cover].flatMap(neighbours).filter(k => !cover.has(k)));

describe('silhouette helpers follow the rendered pixels', () => {
  it.each([2, 3, 5, 8])('a ring around a filled circle of radius %i hugs its rendered edge', r => {
    const state = setup();
    handleDraw(state, 'circle', { cell: '0,0', cx: 11, cy: 11, r, filled: true, color: '#ff004d', shape_name: 'disc' });
    const { shapeNames } = handleDraw(state, 'ring', { cell: '0,0', shape: 'disc', color: '#000000' });
    expect([...emitted(state, shapeNames)].sort()).toEqual([...halo(rendered(state, 'disc'))].sort());
  });

  it('a border around an outline circle, a line and a polygon hugs their rendered pixels', () => {
    for (const [type, params] of [
      ['circle', { cx: 11, cy: 11, r: 6, filled: false }],
      ['line', { x1: 1, y1: 2, x2: 20, y2: 9 }],
      ['polygon', { points: '4,2 20,8 7,21', filled: true }],
    ]) {
      const state = setup();
      handleDraw(state, type, { cell: '0,0', ...params, color: '#ff004d', shape_name: 'src' });
      const { shapeNames } = handleDraw(state, 'border', { cell: '0,0', shapes: 'src', color: '#000000' });
      expect([...emitted(state, shapeNames)].sort()).toEqual([...halo(rendered(state, 'src'))].sort());
    }
  });

  it('clip_to keeps exactly the pixels inside the rendered mask', () => {
    const state = setup();
    handleDraw(state, 'circle', { cell: '0,0', cx: 11, cy: 11, r: 4, filled: true, color: '#ff004d', shape_name: 'mask' });
    const { shapeNames } = handleDraw(state, 'arc', { cell: '0,0', cx: 11, cy: 11, r: 4, from_deg: 0, to_deg: 360, color: '#000000', clip_to: 'mask' });
    const mask = rendered(state, 'mask'), got = emitted(state, shapeNames);
    for (const k of got) expect(mask.has(k)).toBe(true);
    expect(got.size).toBeGreaterThan(8); // the rim the old r² mask cut away is kept
  });

  it('a clipped outline circle draws the same pixels as the unclipped circle, inside the mask', () => {
    const state = setup();
    handleDraw(state, 'rect', { cell: '0,0', x: 0, y: 0, w: 11, h: 24, filled: true, color: '#ff004d', shape_name: 'left' });
    handleDraw(state, 'circle', { cell: '0,0', cx: 11, cy: 11, r: 7, filled: false, color: '#000000', shape_name: 'whole' });
    const { shapeNames } = handleDraw(state, 'circle', { cell: '0,0', cx: 11, cy: 11, r: 7, filled: false, color: '#000000', clip_to: 'left', shape_name: 'half' });
    const expected = [...rendered(state, 'whole')].filter(k => rendered(state, 'left').has(k));
    expect([...emitted(state, shapeNames)].sort()).toEqual(expected.sort());
  });

  it('highlights on a circle stay inside its rendered silhouette and may reach its rim', () => {
    const state = setup();
    handleDraw(state, 'circle', { cell: '0,0', cx: 11, cy: 11, r: 6, filled: true, color: '#ff004d', shape_name: 'ball' });
    const { shapeNames } = handleDraw(state, 'highlight', { cell: '0,0', shape: 'ball', count: 40, radius_factor: 0.99, span_deg: 360 });
    const got = emitted(state, shapeNames), silhouette = rendered(state, 'ball');
    for (const k of got) expect(silhouette.has(k)).toBe(true);
    expect(got.has('11,5')).toBe(true); // the top tip, which the stale tip-trim rule refused
  });
});
