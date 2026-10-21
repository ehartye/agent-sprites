import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionDB } from '../../server/db/session.js';
import sharp from 'sharp';
import { startWebServer } from '../../server/web/http.js';
import { atlasProofFixture } from '../helpers/atlas-proof-fixture.js';
let dir, config, state, server, base;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sprite-proof-api-')); config = atlasProofFixture(dir);
  state = { db: new SessionDB(':memory:'), project: null, sessionId: null };
  server = await startWebServer(state, 0); base = `http://localhost:${server.port}`;
  await fetch(`${base}/api/session/new`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Untouched', size: 8, rows: 1, cols: 1 }) });
});
afterEach(async () => { server.wss.close(); await new Promise(resolve => server.httpServer.close(resolve)); state.db.close(); rmSync(dir, { recursive: true, force: true }); });
test('same shared server produces GIF preview and report without changing the active project', async () => {
  const before = state.project.toJSON();
  const beforeSessions = state.db.listSessions(), active = state.sessionId, draft = state.db.getSession(active);
  const response = await fetch(`${base}/api/workbench/atlas-proof`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: config, out: join(dir, 'review') }) });
  const result = await response.json();
  expect(result.ok, JSON.stringify(result)).toBe(true);
  expect(result.data).toMatchObject({ ok: true, frameCount: 2 });
  expect(result.preview).toMatch(/^data:image\/gif;base64,R0lGOD/);
  expect(result.data.preview).toBeUndefined();
  expect(state.project.toJSON()).toEqual(before);
  expect(state.sessionId).toBe(active);
  expect(state.db.getSession(active)).toEqual(draft);
  expect(state.db.listSessions()).toEqual(beforeSessions);
  const commands = await (await fetch(`${base}/api/workbench/commands`)).json();
  expect(commands.data).toContainEqual(expect.objectContaining({ id: 'atlas-proof', path: '/api/workbench/atlas-proof' }));
});
test('later tracks source-over earlier tracks at the same canonical pixel', async () => {
  const value = JSON.parse(readFileSync(config, 'utf8'));
  value.tracks = [
    { name: 'red', atlas: 'motion.atlas.json', frames: [0], x: 1, y: 1 },
    { name: 'blue', atlas: 'motion.atlas.json', frames: [1], x: 0, y: 0 },
  ];
  writeFileSync(config, JSON.stringify(value));
  const response = await fetch(`${base}/api/workbench/atlas-proof`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: config, out: join(dir, 'overlap') }) });
  const result = await response.json(); expect(result.ok, JSON.stringify(result)).toBe(true);
  const pixels = await sharp(result.data.artifacts.frames[0]).ensureAlpha().raw().toBuffer();
  expect([...pixels.subarray((1 * 3 + 1) * 4, (1 * 3 + 2) * 4)]).toEqual([0, 0, 255, 255]);
});
test('proof route rejects requests from a foreign origin before touching local files', async () => {
  const response = await fetch(`${base}/api/workbench/atlas-proof`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://foreign.example' }, body: JSON.stringify({ path: config, out: join(dir, 'blocked') }) });
  expect(response.status).toBe(403);
});
