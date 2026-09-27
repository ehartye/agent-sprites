import { describe, it, expect } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { handleDraw } from '../../server/handlers/draw.js';

const SKIN = '#c8906b'; // a custom skin tone with no ramp entry in db-32
function setup(color = SKIN, palette = 'db-32') {
  const state = { project: Project.create({ name: 't', cellSize: 32, rows: 1, cols: 1, palette }), broadcast: () => {} };
  handleDraw(state, 'circle', { cell: '0,0', cx: 16, cy: 16, r: 12, color, shape_name: 'face' });
  return state;
}
const colorsOf = (state, names) => [...new Set(names.map(n => state.project.cells.getCell('0,0').shapes.get(n).color))];
function hsl(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, l };
}

describe('shading a colour outside the palette ramps', () => {
  it('highlight derives a lighter, warmer step and says so', () => {
    const state = setup();
    const res = handleDraw(state, 'highlight', { cell: '0,0', shape: 'face' });
    const [lit] = colorsOf(state, res.shapeNames);
    expect(hsl(lit).l).toBeGreaterThan(hsl(SKIN).l);
    // Warmer: the hue moves toward yellow (60°) from this orange base.
    expect(hsl(lit).h).toBeGreaterThan(hsl(SKIN).h);
    expect(res.derived).toEqual([{ from: SKIN, to: lit, type: 'highlight', strength: 1, method: 'hsl' }]);
  });

  it('shadow derives a darker, cooler step', () => {
    const state = setup();
    const res = handleDraw(state, 'shadow', { cell: '0,0', shape: 'face' });
    const [dark] = colorsOf(state, res.shapeNames);
    expect(hsl(dark).l).toBeLessThan(hsl(SKIN).l);
    // Cooler: an orange base moves away from yellow, toward red and purple.
    expect(hsl(dark).h).toBeLessThan(hsl(SKIN).h);
    expect(res.derived[0]).toMatchObject({ type: 'shadow', method: 'hsl' });
  });

  it('greater strength steps further and sphere-shade gives each tier its own tone', () => {
    const state = setup();
    const res = handleDraw(state, 'sphere-shade', { cell: '0,0', shape: 'face', intensity: 'high' });
    const ls = res.derived.map(d => ({ key: `${d.type}${d.strength}`, l: hsl(d.to).l }));
    const byKey = Object.fromEntries(ls.map(x => [x.key, x.l]));
    expect(byKey.highlight3).toBeGreaterThan(byKey.highlight1);
    expect(byKey.shadow2).toBeLessThan(byKey.shadow1);
    expect(res.shapeNames.length).toBeGreaterThan(0);
  });

  it('ramp colours keep their ramp result and report nothing derived', () => {
    const state = setup('#ff004d', 'pico8');
    const res = handleDraw(state, 'highlight', { cell: '0,0', shape: 'face' });
    expect(colorsOf(state, res.shapeNames)).toEqual([state.project.palette.lighter('#ff004d')]);
    expect(res.derived).toBeUndefined();
  });
});
