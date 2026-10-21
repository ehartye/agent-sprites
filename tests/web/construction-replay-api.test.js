import { beforeEach, afterEach, test, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionDB } from '../../server/db/session.js';
import { startWebServer } from '../../server/web/http.js';
import { constructionReplayFixture } from '../helpers/construction-replay-fixture.js';
let dir, state, server, base;
async function api(path, body, sessionId) {
  return (await fetch(`${base}/api${path}`, { method: body === undefined ? 'GET' : 'POST', headers: {
    'Content-Type': 'application/json', ...(sessionId ? { 'X-Sprite-Session': sessionId } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })).json();
}
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sprite-replay-api-'));
  state = { db: new SessionDB(':memory:'), project: null, sessionId: null };
  server = await startWebServer(state, 0); base = `http://localhost:${server.port}`;
});
afterEach(async () => { server.wss.close(); await new Promise(resolve => server.httpServer.close(resolve)); state.db.close(); rmSync(dir, { recursive: true, force: true }); });
test('scrubs source-linked construction while preserving persisted session and live undo history', async () => {
  const built = await constructionReplayFixture(dir);
  await api('/session/open', { path: built.artifacts.project });
  const active = state.sessionId, cell = state.project.cells.getCell('0,0');
  await api('/shape/move', { cell: '0,0', name: 'eye', dx: 1, dy: 0 });
  const before = state.project.toJSON(), row = state.db.getSession(active), undoCount = cell._undoStack.length;
  const metadata = await api('/workbench/replay', undefined, active);
  expect(metadata.ok, JSON.stringify(metadata)).toBe(true);
  expect(metadata.data.kind).toBe('construction');
  expect(metadata.data.cells).toEqual(['0,0']);
  const eye = metadata.data.steps.find(step => step.operationIndex === 2);
  expect(eye.source).toMatchObject({ path: 'operations.json' });
  const frame = await api('/workbench/replay', { cell: '0,0', step: eye.step, scale: 2 }, active);
  expect(frame.ok, JSON.stringify(frame)).toBe(true);
  expect(frame.data).toMatchObject({ kind: 'construction', changedPixels: 1, current: { samePixels: false, sameState: false } });
  expect(frame.images.after).toMatch(/^data:image\/png;base64,/);
  expect(frame.images.contribution).toMatch(/^data:image\/png;base64,/);
  expect(frame.data.images).toBeUndefined();
  expect(state.project.toJSON()).toEqual(before); expect(state.db.getSession(active)).toEqual(row);
  expect(cell._undoStack).toHaveLength(undoCount);
  await api('/cell/undo', { cell: '0,0' });
  const restored = await api('/workbench/replay', { cell: '0,0', step: eye.step });
  expect(restored.data.current.samePixels).toBe(true);
  expect(state.project.constructionReplay).toEqual(before.constructionReplay);
});
test('absent traces and stale session requests fail explicitly', async () => {
  await api('/session/new', { name: 'Live only', size: 8, rows: 1, cols: 1 });
  const noTrace = await api('/workbench/replay');
  expect(noTrace.ok).toBe(false); expect(noTrace.error).toMatch(/construction|trace|replay/i);
  const response = await fetch(`${base}/api/workbench/replay`, { headers: { 'X-Sprite-Session': 'stale' } });
  expect(response.status).toBe(409);
});
