import { describe, it, expect } from 'vitest';
import express from 'express';
import { Project } from '../../server/engine/project.js';
import { groupRoutes } from '../../server/web/api/group-routes.js';

const layer = { id: 'child', x: 1, y: 1, w: 3, h: 3, z: 2, background: { mode: 'transparent' } };
const setup = () => {
  const project = Project.create({ name: 'groups', cellSize: 8, rows: 1, cols: 1 });
  const cell = project.cells.getCell('0,0');
  cell.draw('point', { x: 1, y: 1, layers: [layer] }, '#ff0000', 'a');
  cell.draw('point', { x: 2, y: 1, layers: [layer] }, '#00ff00', 'b');
  const groups = {}, state = { project, sessionId: 'test', persistDrafts: false, db: {
    getShapeGroups: () => ({ full: ['a', 'b'], partial: ['a'] }),
    setCellGroup: (_, name, cells) => { groups[name] = cells; }, deleteCellGroup: (_, name) => { delete groups[name]; },
    getCellGroups: () => groups, getCellGroupFps: () => ({}), getCellGroupDirections: () => ({}),
  } };
  const app = express(); app.use(express.json()); app.use(groupRoutes(state));
  const request = async (path, body) => {
    const server = app.listen(0);
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return res.json();
    } finally { server.close(); }
  };
  return { state, cell, groups, request };
};

describe('retained shape group movement and animation loop', () => {
  it('moves a complete isolated layer once with one undo while partial selections retain its clip', async () => {
    const { cell, request } = setup(), before = cell.toJSON(), history = cell._undoStack.length;
    expect((await request('/group/shape/move', { name: 'full', cell: '0,0', dx: 2, dy: 1 })).ok).toBe(true);
    expect(cell.shapes.get('a').params.layers[0]).toMatchObject({ x: 3, y: 2 });
    expect(cell.shapes.get('b').params.layers[0]).toMatchObject({ x: 3, y: 2 });
    expect(cell._undoStack.length).toBe(history + 1); cell.undo(); expect(cell.toJSON()).toEqual(before);
    expect((await request('/group/shape/move', { name: 'partial', cell: '0,0', dx: 2, dy: 1 })).ok).toBe(true);
    expect(cell.shapes.get('a').params).toMatchObject({ x: 3, y: 2, layers: [layer] });
    expect(cell.shapes.get('b').params).toMatchObject({ x: 2, y: 1, layers: [layer] });
  });
  it('stores an explicit one-shot loop policy and removes it with its group', async () => {
    const { state, request } = setup();
    expect((await request('/group/cell/create', { name: 'once', cells: ['0,0'], loop: false })).ok).toBe(true);
    expect(state.project.animationLoops?.once).toBe(false);
    expect((await request('/group/cell/delete', { name: 'once' })).ok).toBe(true);
    expect(state.project.animationLoops?.once).toBeUndefined();
  });
  it('rejects a malformed loop before writing its group', async () => {
    const { groups, request } = setup();
    const result = await request('/group/cell/create', { name: 'bad', cells: ['0,0'], loop: 'false' });
    expect(result.ok).toBe(false); expect(result.error).toMatch(/loop.*boolean/i); expect(groups).toEqual({});
  });
});
