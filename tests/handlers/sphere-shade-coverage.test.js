import { describe, it, expect } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { handleDraw } from '../../server/handlers/draw.js';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';
import { mapCommandToApi } from '../../scripts/batch-commands.js';
import { loadImage, createCanvas } from 'canvas';

const BASE = '#ff004d';
function setup(shape = { type: 'circle', cx: 8, cy: 8, r: 5 }) {
  const state = { project: Project.create({ name: 't', cellSize: 16, rows: 1, cols: 1, palette: 'pico8' }), broadcast: () => {} };
  handleDraw(state, shape.type, { cell: '0,0', color: BASE, shape_name: 'apple', ...shape });
  return state;
}
const png = state => new CanvasRenderer(state.project.palette).renderSheet(state.project.cells, { gap: 0 });
async function pixels(state) {
  const img = await loadImage(png(state)), c = createCanvas(img.width, img.height), ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, img.width, img.height).data, out = new Map();
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) out.set(`${(i / 4) % img.width},${Math.floor(i / 4 / img.width)}`, [d[i], d[i + 1], d[i + 2]].join(','));
  return out;
}

describe('sphere-shade coverage', () => {
  it('without the flag, small-radius output is byte-identical to the default', () => {
    const a = setup(), b = setup();
    handleDraw(a, 'sphere-shade', { cell: '0,0', shape: 'apple' });
    handleDraw(b, 'sphere-shade', { cell: '0,0', shape: 'apple', coverage: false });
    expect(png(b)).toEqual(png(a));
  });

  it.each([4, 5, 6, 7])('radius %i: coverage shades at least a quarter of the form and stays inside it', async r => {
    const plain = setup({ type: 'circle', cx: 8, cy: 8, r });
    const before = await pixels(plain);
    const shaded = setup({ type: 'circle', cx: 8, cy: 8, r });
    const res = handleDraw(shaded, 'sphere-shade', { cell: '0,0', shape: 'apple', coverage: true });
    const after = await pixels(shaded);
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    const changed = [...after].filter(([k, v]) => before.get(k) !== v).length;
    expect(changed / before.size).toBeGreaterThanOrEqual(0.25);
    expect(res.shapeNames.length).toBe(changed > 0 ? res.shapeNames.length : 0);
  });

  it('lit pixels sit toward the light and shadow pixels away from it', async () => {
    for (const [direction, sx, sy] of [['top-left', -1, -1], ['right', 1, 0]]) {
      const state = setup();
      const res = handleDraw(state, 'sphere-shade', { cell: '0,0', shape: 'apple', coverage: true, direction });
      const cell = state.project.cells.getCell('0,0');
      const mean = names => { const s = names.map(n => cell.shapes.get(n).params); return [s.reduce((a, p) => a + p.x, 0) / s.length - 8, s.reduce((a, p) => a + p.y, 0) / s.length - 8]; };
      const lit = mean(res.shapeNames.filter(n => /_hl_/.test(n))), dark = mean(res.shapeNames.filter(n => /_mid_|_core_/.test(n)));
      expect(lit[0] * sx + lit[1] * sy).toBeGreaterThan(0);
      expect(dark[0] * sx + dark[1] * sy).toBeLessThan(0);
    }
  });

  it('covers ellipses and off-ramp colours too', () => {
    const state = setup({ type: 'ellipse', cx: 8, cy: 8, rx: 6, ry: 4 });
    expect(handleDraw(state, 'sphere-shade', { cell: '0,0', shape: 'apple', coverage: true }).shapeNames.length).toBeGreaterThan(10);
    const custom = { project: Project.create({ name: 't', cellSize: 16, rows: 1, cols: 1, palette: 'pico8' }), broadcast: () => {} };
    handleDraw(custom, 'circle', { cell: '0,0', cx: 8, cy: 8, r: 5, color: '#c8906b', shape_name: 'face' });
    expect(handleDraw(custom, 'sphere-shade', { cell: '0,0', shape: 'face', coverage: true }).derived.length).toBeGreaterThan(0);
  });

  it('rejects a non-boolean coverage and batch carries the flag', () => {
    expect(() => handleDraw(setup(), 'sphere-shade', { cell: '0,0', shape: 'apple', coverage: 'yes' })).toThrow(/coverage must be true or false/);
    expect(mapCommandToApi({ command: 'draw', type: 'sphere-shade', cell: '0,0', shape: 'apple', coverage: true }).body.coverage).toBe(true);
  });
});
