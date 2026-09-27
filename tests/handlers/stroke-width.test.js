import { describe, it, expect } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { handleDraw } from '../../server/handlers/draw.js';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';
import { createCanvas, loadImage } from 'canvas';
import { mapCommandToApi } from '../../scripts/batch-commands.js';

const mkState = () => ({ project: Project.create({ name: 't', cellSize: 32, rows: 1, cols: 1, palette: 'db-32' }), broadcast: () => {} });

async function opaque(state) {
  const png = new CanvasRenderer(state.project.palette).renderSheet(state.project.cells, { gap: 0 });
  const img = await loadImage(png), c = createCanvas(img.width, img.height), ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, img.width, img.height).data, set = new Set();
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) set.add(`${(i / 4) % img.width},${Math.floor(i / 4 / img.width)}`);
  return set;
}

const variants = {
  line: { x1: 3, y1: 4, x2: 25, y2: 17 },
  polyline: { points: '3,4 12,20 26,6' },
  arc: { cx: 16, cy: 16, r: 10, from_deg: 180, to_deg: 360 },
};

describe('stroke width', () => {
  for (const [type, params] of Object.entries(variants)) {
    it(`${type}: default width is byte-identical to width 1`, async () => {
      const a = mkState(), b = mkState();
      handleDraw(a, type, { cell: '0,0', color: '#ffffff', ...params });
      handleDraw(b, type, { cell: '0,0', color: '#ffffff', width: 1, ...params });
      expect(new CanvasRenderer(b.project.palette).renderSheet(b.project.cells, { gap: 0 }))
        .toEqual(new CanvasRenderer(a.project.palette).renderSheet(a.project.cells, { gap: 0 }));
    });

    it(`${type}: width 3 stamps a square brush centered on every path pixel as named points`, async () => {
      const thin = mkState(), thick = mkState();
      handleDraw(thin, type, { cell: '0,0', color: '#ffffff', ...params });
      const res = handleDraw(thick, type, { cell: '0,0', color: '#ffffff', width: 3, shape_name: 'stroke', ...params });
      const path = await opaque(thin), brush = await opaque(thick);
      const expected = new Set();
      for (const key of path) {
        const [x, y] = key.split(',').map(Number);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < 32 && y + dy < 32) expected.add(`${x + dx},${y + dy}`);
      }
      expect([...brush].sort()).toEqual([...expected].sort());
      const cell = thick.project.cells.getCell('0,0');
      expect(res.shapeNames.length).toBe(expected.size);
      expect(res.shapeNames.every(n => /^stroke_\d+$/.test(n) && cell.shapes.get(n).type === 'point')).toBe(true);
    });
  }

  it('even widths extend one pixel further toward positive x and y', async () => {
    const s = mkState();
    handleDraw(s, 'line', { cell: '0,0', color: '#ffffff', x1: 10, y1: 10, x2: 10, y2: 10, width: 2 });
    expect([...await opaque(s)].sort()).toEqual(['10,10', '10,11', '11,10', '11,11']);
  });

  it.each([0, 5, 1.5, 'wide'])('rejects width %j', width => {
    expect(() => handleDraw(mkState(), 'line', { cell: '0,0', color: '#ffffff', x1: 1, y1: 1, x2: 5, y2: 5, width })).toThrow(/width must be an integer from 1 to 4/);
  });

  it('rejects width on primitives that are not strokes', () => {
    expect(() => handleDraw(mkState(), 'rect', { cell: '0,0', color: '#ffffff', x: 1, y: 1, w: 3, h: 3, width: 2 })).toThrow(/width applies only to line, polyline and arc/);
  });
});

it('batch operations carry width to the draw route', () => {
  expect(mapCommandToApi({ command: 'draw', type: 'line', cell: '0,0', x1: 0, y1: 0, x2: 4, y2: 4, color: '#fff', width: 2 }).body.width).toBe(2);
});
