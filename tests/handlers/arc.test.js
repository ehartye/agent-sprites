import { describe, it, expect } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { handleDraw } from '../../server/handlers/draw.js';

function mkState() {
  return {
    project: Project.create({ name: 't', cellSize: 64, rows: 1, cols: 1, palette: 'db-32' }),
    broadcast: () => {},
  };
}

describe('draw arc', () => {
  it('emits only pixels in the specified angular range (left half, 90→270)', () => {
    const state = mkState();
    const res = handleDraw(state, 'arc', {
      cell: '0,0', cx: 32, cy: 32, rx: 16, ry: 16,
      from_deg: 90, to_deg: 270, color: '#000000', shape_name: 'halfarc',
    });
    expect(res.shapeNames.length).toBeGreaterThan(0);
    const cell = state.project.cells.getCell('0,0');
    for (const name of res.shapeNames) {
      const s = cell.shapes.get(name);
      // 90°→270° sweep (CW, y-down): passes through south, west, north — all x ≤ cx.
      expect(s.params.x).toBeLessThanOrEqual(32);
    }
  });

  it('supports circle shorthand via --r', () => {
    const state = mkState();
    const res = handleDraw(state, 'arc', {
      cell: '0,0', cx: 32, cy: 32, r: 10,
      from_deg: 0, to_deg: 90, color: '#ffffff', shape_name: 'q',
    });
    expect(res.shapeNames.length).toBeGreaterThan(0);
    const cell = state.project.cells.getCell('0,0');
    for (const name of res.shapeNames) {
      const s = cell.shapes.get(name);
      // 0°→90° (east to south): x ≥ cx and y ≥ cy.
      expect(s.params.x).toBeGreaterThanOrEqual(32);
      expect(s.params.y).toBeGreaterThanOrEqual(32);
    }
  });

  it('errors when neither rx/ry nor r provided', () => {
    const state = mkState();
    expect(() => handleDraw(state, 'arc', {
      cell: '0,0', cx: 32, cy: 32,
      from_deg: 0, to_deg: 90, color: '#fff',
    })).toThrow(/rx.*ry|r/);
  });

  it('clip-to restricts output to pixels inside the mask', () => {
    const state = mkState();
    handleDraw(state, 'rect', {
      cell: '0,0', x: 32, y: 0, w: 32, h: 64, color: '#ffffff', shape_name: 'rightmask',
    });
    const res = handleDraw(state, 'arc', {
      cell: '0,0', cx: 32, cy: 32, rx: 16, ry: 16,
      from_deg: 0, to_deg: 360, color: '#000000', shape_name: 'full',
      clip_to: 'rightmask',
    });
    const cell = state.project.cells.getCell('0,0');
    for (const name of res.shapeNames) {
      const s = cell.shapes.get(name);
      expect(s.params.x).toBeGreaterThanOrEqual(32);
    }
    expect(res.shapeNames.length).toBeGreaterThan(0);
  });

  it('leaves no gaps at large radii: consecutive pixels stay 8-connected', () => {
    for (const geometry of [{ r: 13 }, { r: 30 }, { rx: 26, ry: 10 }, { rx: 6, ry: 22 }]) {
      const state = mkState();
      const res = handleDraw(state, 'arc', {
        cell: '0,0', cx: 32, cy: 32, ...geometry,
        from_deg: 200, to_deg: 340, color: '#ffffff', shape_name: 'big',
      });
      const cell = state.project.cells.getCell('0,0');
      const pixels = res.shapeNames.map(name => cell.shapes.get(name).params);
      const gaps = pixels.slice(1).filter((p, i) => Math.max(Math.abs(p.x - pixels[i].x), Math.abs(p.y - pixels[i].y)) > 1);
      expect(gaps, `geometry ${JSON.stringify(geometry)} has ${gaps.length} gaps in ${pixels.length} pixels`).toEqual([]);
      // and the arc actually covers its span: roughly span/360 of the perimeter
      const rx = geometry.rx ?? geometry.r, ry = geometry.ry ?? geometry.r;
      const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
      expect(pixels.length).toBeGreaterThan(perimeter * (140 / 360) * 0.8);
    }
  });

  it('names shapes <base>_<i>', () => {
    const state = mkState();
    const res = handleDraw(state, 'arc', {
      cell: '0,0', cx: 16, cy: 16, r: 8,
      from_deg: 0, to_deg: 180, color: '#fff', shape_name: 'bow',
    });
    expect(res.shapeNames[0]).toBe('bow_0');
    expect(res.shapeNames[1]).toBe('bow_1');
  });
});
