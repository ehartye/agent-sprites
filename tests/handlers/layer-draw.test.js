import { test, expect } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { handleDraw } from '../../server/handlers/draw.js';
const layer = { id: 'child', x: 2, y: 1, w: 4, h: 4, z: 0, background: { mode: 'transparent' } };
test('primitive draw retains independent validated layer metadata and rejects conflicts before mutation', () => {
  const state = { project: Project.create({ name: 'layer draw', cellSize: 8, rows: 1, cols: 1 }) };
  const params = { cell: '0,0', shape_name: 'pixel', x: 2, y: 1, color: '#ff0000', layers: [structuredClone(layer)] };
  handleDraw(state, 'point', params);
  const cell = state.project.cells.getCell('0,0'), before = cell.toJSON();
  params.layers[0].x = 5;
  expect(cell.shapes.getByName('pixel').params.layers[0].x).toBe(2);
  expect(() => handleDraw(state, 'point', { ...params, shape_name: 'conflict' })).toThrow(/inconsistent/i);
  expect(cell.toJSON()).toEqual(before);
});
