import { test, expect } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { handleDraw } from '../../server/handlers/draw.js';
import { assertTrimOption } from '../../server/engine/trimmed-export.js';
import { TOOLS } from '../../server/web/public/js/tools.js';

const mk = () => { const s = { project: Project.create({ name: 't', cellSize: 16, rows: 1, cols: 2, palette: 'pico8' }), broadcast: () => {} }; handleDraw(s, 'circle', { cell: '0,0', cx: 8, cy: 8, r: 5, color: '#ff004d', shape_name: 'ball' }); return s; };

test('cells resolve names and R,C through one public method', () => {
  const s = mk(); s.project.cells.getCell('0,1').name = 'sky';
  expect(s.project.cells.resolveRef('sky')).toBe('0,1');
  expect(s.project.cells.resolveRef('0,0')).toBe('0,0');
  expect(() => s.project.cells.resolveRef('moon')).toThrow(/Cell "moon" not found/);
});

test.each([
  ['sphere-shade', { erase: true }, /erase applies to/],
  ['highlight', { width: 2 }, /width applies only to line, polyline and arc/],
  ['shadow', { coverage: true }, /coverage applies only to sphere-shade/],
  ['rect', { coverage: true, x: 0, y: 0, w: 2, h: 2, color: '#fff' }, /coverage applies only to sphere-shade/],
])('%s rejects flags that do not apply instead of ignoring them', (type, extra, error) => {
  expect(() => handleDraw(mk(), type, { cell: '0,0', shape: 'ball', ...extra })).toThrow(error);
});

test('trim options are validated by one function', () => {
  expect(() => assertTrimOption('yes')).toThrow(/trim must be true or false/);
  expect(() => assertTrimOption(undefined)).not.toThrow();
  expect(() => assertTrimOption(true)).not.toThrow();
});

test('the web tool that removes a shape is not called Erase, which now names erasing shapes', () => {
  expect(TOOLS.find(t => t.id === 'erase').label).toBe('Delete');
});
