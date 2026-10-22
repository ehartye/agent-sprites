import { expect, test, vi } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { editCells } from '../../server/handlers/edit.js';
import { publishPayload } from '../../server/project-publication.js';

test('scoped publications stay buffered until validation and geometry-free consumers never materialize payloads', () => {
  const project = Project.create({ name: 'Publication', cellSize: 8, rows: 1, cols: 1 });
  const cell = project.cells.getCell('0,0'), messages = [];
  const broadcast = message => messages.push(message);
  broadcast.supportsLazyPayloads = true;
  broadcast.needsPayload = () => false;
  const state = { project, broadcast }, payload = vi.fn(() => ({ cellData: cell.toJSON() }));
  expect(() => editCells(state, [cell], scoped => {
    cell.draw('point', { x: 1, y: 2 }, '#fff');
    publishPayload(scoped, { type: 'cell_update', cell: '0,0' }, payload);
    throw new Error('Rejected edit');
  })).toThrow('Rejected edit');
  expect(cell.shapes._byId.size).toBe(0); expect(cell._undoStack).toHaveLength(0);
  expect(payload).not.toHaveBeenCalled(); expect(messages).toEqual([]);
  editCells(state, [cell], scoped => {
    cell.draw('point', { x: 3, y: 4 }, '#fff');
    publishPayload(scoped, { type: 'cell_update', cell: '0,0' }, payload);
    expect(payload).not.toHaveBeenCalled(); expect(messages).toEqual([]);
  });
  expect(payload).not.toHaveBeenCalled(); expect(cell._undoStack).toHaveLength(1);
  expect(messages).toEqual([{ type: 'cell_update', cell: '0,0' }]);
});

test('ordinary handler test states retain canonical expanded payloads', () => {
  const project = Project.create({ name: 'Publication', cellSize: 8, rows: 1, cols: 1 });
  const cell = project.cells.getCell('0,0'); cell.draw('point', { x: 1, y: 2 }, '#fff');
  const messages = [], state = { project, broadcast: message => messages.push(message) };
  editCells(state, [cell], scoped => publishPayload(scoped, { type: 'cell_update', cell: '0,0' }, () => ({ cellData: cell.toJSON() })));
  expect(messages).toEqual([{ type: 'cell_update', cell: '0,0', cellData: cell.toJSON() }]);
});

test.each([false, true])('legacy payloads retain their event-time geometry before later scoped moves with lazy=%s', lazy => {
  const project = Project.create({ name: 'Publication', cellSize: 8, rows: 1, cols: 1 });
  const cell = project.cells.getCell('0,0'), messages = [];
  const broadcast = (message, payload) => messages.push({ ...message, ...payload?.() });
  if (lazy) { broadcast.supportsLazyPayloads = true; broadcast.needsPayload = () => true; }
  const state = { project, broadcast };
  editCells(state, [cell], scoped => {
    const shape = cell.draw('point', { x: 1, y: 2 }, '#fff', 'dot');
    publishPayload(scoped, { type: 'draw', cell: '0,0' }, () => ({ shape: shape.toJSON() }));
    cell.moveShape('dot', 2, 0);
    scoped.broadcast({ type: 'shape_moved', cell: '0,0', name: 'dot', dx: 2, dy: 0 });
    expect(messages).toEqual([]);
  });
  expect(messages[0].shape.params).toEqual({ x: 1, y: 2 });
  expect(messages[0].shape.params.x + messages[1].dx).toBe(cell.shapes.getByName('dot').params.x);
});
