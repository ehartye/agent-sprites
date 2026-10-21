import { beforeEach, afterEach, it, expect } from 'vitest';
import { SessionDB } from '../../server/db/session.js';
import { startWebServer } from '../../server/web/http.js';
import { mapCommandToApi } from '../../scripts/batch-commands.js';

let state, server, base;
beforeEach(async () => {
  state = { db: new SessionDB(':memory:'), project: null, sessionId: null };
  server = await startWebServer(state, 0);
  base = `http://localhost:${server.port}`;
});
afterEach(async () => {
  server.wss.close();
  await new Promise(resolve => server.httpServer.close(resolve));
  state.db.close();
});
async function api(path, body, session) {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: {
    'Content-Type': 'application/json', ...(session ? { 'X-Sprite-Session': session } : {}),
  }, body: JSON.stringify(body) });
  return response.json();
}
it('uses the same patch contract for batch/API, persists the result and rejects stale sessions', async () => {
  await api('/api/session/new', { name: 'ASCII study', size: 8, rows: 1, cols: 1 });
  const cmd = { command: 'ascii', sub: 'patch', cell: '0,0', x: 1, y: 2, rows: ['RB', '._'], colors: { R: '#ff0000', B: '#0000ff' }, prefix: 'eyes' };
  const mapped = mapCommandToApi(cmd);
  expect(mapped).toMatchObject({ method: 'POST', path: '/api/cell/ascii-patch' });
  expect((await api(mapped.path, mapped.body, state.sessionId)).ok).toBe(true);
  const saved = JSON.parse(state.db.getSession(state.sessionId).draft_json);
  expect(saved.cells['0,0'].shapes).toHaveLength(3);
  const read = await api('/api/cell/ascii-read', { cell: '0,0', x: 1, y: 2, w: 2, h: 2, colors: cmd.colors });
  expect(read.data.rows).toEqual(['RB', '__']);
  expect((await api(mapped.path, mapped.body, 'stale-session')).ok).toBe(false);
  await api('/api/cell/undo', { cell: '0,0' });
  expect(state.project.cells.getCell('0,0').shapes.listByZ()).toHaveLength(0);
  await api('/api/cell/redo', { cell: '0,0' });
  expect(state.project.cells.getCell('0,0').shapes.listByZ()).toHaveLength(3);
});
