import { describe, it, expect } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { handleDraw } from '../../server/handlers/draw.js';

function shade(direction, intensity = 'high') {
  const state = { project: Project.create({ name: 't', cellSize: 64, rows: 1, cols: 1, palette: 'db-32' }), broadcast: () => {} };
  handleDraw(state, 'circle', { cell: '0,0', cx: 32, cy: 32, r: 14, color: '#d95763', shape_name: 'ball' });
  const res = handleDraw(state, 'sphere-shade', { cell: '0,0', shape: 'ball', intensity, ...(direction ? { direction } : {}), shape_name: 'lit' });
  const cell = state.project.cells.getCell('0,0');
  const pixels = tier => res.shapeNames.filter(n => n.startsWith(`lit_${tier}_`)).map(n => cell.shapes.get(n).params);
  const mean = pts => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
  return { hl: mean(pixels('hl')), core: mean(pixels('core')), spec: mean(pixels('spec')), names: res.shapeNames };
}

describe('sphere-shade direction', () => {
  it('defaults to light from the upper left: highlight up-left, core shadow down-right', () => {
    const { hl, core } = shade(undefined);
    expect(hl.x).toBeLessThan(32); expect(hl.y).toBeLessThan(32);
    expect(core.x).toBeGreaterThan(32); expect(core.y).toBeGreaterThan(32);
  });

  it('moves every tier when the light comes from the upper right', () => {
    const { hl, core, spec } = shade('top-right');
    expect(hl.x).toBeGreaterThan(32); expect(hl.y).toBeLessThan(32);
    expect(spec.x).toBeGreaterThan(32);
    expect(core.x).toBeLessThan(32); expect(core.y).toBeGreaterThan(32);
  });

  it('handles the four cardinal directions and produces different pixels for each', () => {
    const left = shade('left'), right = shade('right'), top = shade('top'), bottom = shade('bottom');
    expect(left.hl.x).toBeLessThan(right.hl.x);
    expect(top.hl.y).toBeLessThan(bottom.hl.y);
    expect(Math.abs(top.hl.x - 32)).toBeLessThan(3);   // straight above, not skewed
  });

  it('rejects an unknown direction', () => {
    expect(() => shade('sideways')).toThrow(/direction/);
  });
});
