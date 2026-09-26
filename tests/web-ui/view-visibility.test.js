import { test, expect } from 'vitest';
import { cellsForView } from '../../server/web/public/js/view-visibility.js';

test('hides generated trace rectangles and reference underlays without changing the project or new art', () => {
  const source = { '0,0': { reference: { path: 'source.png', opacity: 0.35 }, shapes: [
    { name: 'trace-000001', type: 'rect', visible: true },
    { name: 'new-mark', type: 'point', visible: true },
    { name: 'trace-custom', type: 'rect', visible: true },
  ] } };
  const before = structuredClone(source);
  const hidden = cellsForView(source, { trace: false, reference: false });
  expect(hidden['0,0'].shapes.map(s => s.name)).toEqual(['new-mark', 'trace-custom']);
  expect(hidden['0,0'].reference).toBeNull();
  expect(source).toEqual(before);
  expect(cellsForView(source, { trace: true, reference: true })).toEqual(before);
});

test('the two visibility controls work independently across cells', () => {
  const source = { '0,0': { reference: { path: 'ref.png' }, shapes: [{ name: 'trace-000002', type: 'rect' }] }, '0,1': { shapes: [] } };
  expect(cellsForView(source, { trace: false, reference: true })['0,0'].reference).toEqual(source['0,0'].reference);
  expect(cellsForView(source, { trace: true, reference: false })['0,0'].shapes).toHaveLength(1);
  expect(cellsForView({}, { trace: false })).toEqual({});
});
