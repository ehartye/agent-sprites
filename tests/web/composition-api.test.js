import { beforeEach, afterEach, it, expect } from 'vitest';
import { SessionDB } from '../../server/db/session.js';
import { startWebServer } from '../../server/web/http.js';
import { mapCommandToApi } from '../../scripts/batch-commands.js';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';

let state, server, base;
beforeEach(async () => {
  state = { db: new SessionDB(':memory:'), project: null, sessionId: null };
  server = await startWebServer(state, 0); base = `http://localhost:${server.port}`;
});
afterEach(async () => {
  server.wss.close(); await new Promise(resolve => server.httpServer.close(resolve)); state.db.close();
});
async function api(path, body) {
  return (await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
}

it('applies and revises reusable part instances through the canonical API, preserving drafts and undo', async () => {
  await api('/api/session/new', { name: 'Composition study', size: 16, rows: 1, cols: 1 });
  const command = { command: 'compose', cell: '0,0', prefix: 'garden',
    parts: { tuft: { shapes: [{ name: 'stem', type: 'line', params: { x1: 0, y1: 0, x2: 0, y2: 2 }, color: '#00ff00' }] } },
    placements: [{ kind: 'tile', part: 'tuft', name: 'bed', x: 1, y: 2, cols: 2, rows: 2, stepX: 4, stepY: 4 }] };
  const mapped = mapCommandToApi(command);
  expect(mapped.path).toBe('/api/cell/compose');
  const initial = await api(mapped.path, mapped.body);
  expect(initial.ok, initial.error).toBe(true);
  expect(initial.data.instances).toHaveLength(4);
  const before = state.project.cells.getCell('0,0').toJSON();
  expect(before.shapes).toHaveLength(4);
  command.parts.tuft.shapes[0].color = '#ff0000';
  const revised = await api(mapped.path, mapCommandToApi(command).body);
  expect(revised.ok, revised.error).toBe(true);
  expect(state.project.cells.getCell('0,0').shapes.listByZ().map(s => s.id)).toEqual(before.shapes.map(s => s.id));
  const saved = JSON.parse(state.db.getSession(state.sessionId).draft_json);
  expect(saved.cells['0,0'].shapes.every(s => s.color === '#ff0000')).toBe(true);
  await api('/api/cell/undo', { cell: '0,0' });
  expect(state.project.cells.getCell('0,0').toJSON()).toEqual(before);
});

it('replays expanded draw operations with the same ownership, visibility and pixels', async () => {
  await api('/api/session/new', { name: 'Replay study', size: 8, rows: 1, cols: 2 });
  for (const cell of ['0,0', '0,1']) {
    await api('/api/draw', { cell, type: 'point', x: 2, y: 3, color: '#00ff00', shape_name: 'underlay' });
    await api('/api/shape/set-z', { cell, name: 'underlay', z: 500 });
  }
  const composed = await api('/api/cell/compose', { cell: '0,0', prefix: 'study', parts: { motif: { shapes: [
    { name: 'paint', type: 'point', params: { x: 0, y: 0 }, color: '#ff0000' },
    { name: 'hidden', type: 'point', params: { x: 1, y: 0 }, color: '#0000ff', visible: false },
  ] } }, placements: [{ kind: 'stamp', part: 'motif', name: 'one', x: 2, y: 3 }] });
  expect(composed.ok, composed.error).toBe(true);
  for (const operation of composed.data.operations) {
    const request = mapCommandToApi({ ...operation, cell: '0,1' });
    const response = await api(request.path, request.body);
    expect(response.ok, response.error).toBe(true);
  }
  const descriptors = ref => state.project.cells.getCell(ref).shapes.listByZ().map(({ name, type, params, color, visible }) => ({ name, type, params, color, visible }));
  expect(descriptors('0,1')).toEqual(descriptors('0,0'));
  const renderer = new CanvasRenderer(state.project.palette);
  expect(renderer.renderCellRaw(state.project.cells.getCell('0,1'))).toEqual(renderer.renderCellRaw(state.project.cells.getCell('0,0')));
});

it('plans deterministic placement without changing the draft, history or next paint order', async () => {
  await api('/api/session/new', { name: 'Plan study', size: 16, rows: 1, cols: 1 });
  const before = state.project.toJSON(), draft = state.db.getSession(state.sessionId).draft_json;
  const command = { command: 'compose-plan', cell: '0,0', prefix: 'origins', parts: { dot: { shapes: [
    { name: 'origin', type: 'point', params: { x: 0, y: 0 }, color: '#000000' },
  ] } }, placements: [{ kind: 'scatter', part: 'dot', name: 'all', x: 0, y: 0, w: 16, h: 16, count: 2000, seed: 'orchard' }] };
  const mapped = mapCommandToApi(command);
  const planned = await api(mapped.path, mapped.body);
  expect(planned.ok, planned.error).toBe(true);
  expect(planned.data.instances).toHaveLength(2000);
  expect(state.project.toJSON()).toEqual(before);
  expect(state.db.getSession(state.sessionId).draft_json).toBe(draft);
  expect(state.project.cells.getCell('0,0').undo()).toBe(false);
  expect(state.project.cells.getCell('0,0')._nextZ).toBe(0);
});
