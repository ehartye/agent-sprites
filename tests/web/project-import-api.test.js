import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { Readable } from 'node:stream';
import { request } from 'node:http';
import { SessionDB } from '../../server/db/session.js';
import { Project } from '../../server/engine/project.js';
import { startWebServer } from '../../server/web/http.js';

let state, server, base, temp;
const project = () => Project.create({ name: 'Imported', cellSize: 8, rows: 1, cols: 1, palette: 'pico8' }).toJSON();
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'sprite-import-test-'));
  state = { db: new SessionDB(':memory:'), project: null, sessionId: null };
});
afterEach(async () => {
  await server?.dispose?.();
  if (server) { server.wss.close(); server.httpServer.closeAllConnections(); await new Promise(r => server.httpServer.close(r)); }
  state.db.close(); await rm(temp, { recursive: true, force: true });
});
async function start(options = {}) {
  server = await startWebServer(state, 0, { imports: { directory: temp, ...options } });
  base = `http://localhost:${server.port}/api`;
  await api('/session/new', { name: 'Original', rows: 1, cols: 1 });
}
async function api(path, body, method = body === undefined ? 'GET' : 'POST', headers = {}) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, ...(res.headers.get('content-type')?.includes('application/json') ? await res.json() : { ok: false, error: await res.text() }) };
}
async function create(encoding = 'json', extra = {}) {
  const res = await api('/workbench/imports', { filename: '../../informational.json', encoding, ...extra });
  expect(res.status).toBe(201); return res.data;
}
async function upload(job, data) {
  const response = await fetch(`${base}/workbench/imports/${job.id}/file`, { method: 'PUT', body: data, ...(data instanceof Readable ? { duplex: 'half' } : {}) });
  expect(response.status).toBe(202); return response.json();
}
async function settled(job, expected = 'ready') {
  let result;
  await vi.waitFor(async () => {
    result = await api(`/workbench/imports/${job.id}`);
    expect(result.data.state, result.data.error).toBe(expected);
  }, { timeout: 12000, interval: 20 });
  return result.data;
}
test('streams a project beyond the generic 64 MiB envelope and activates once with a bounded receipt', async () => {
  await start(); const original = state.project, id = state.sessionId, job = await create();
  const json = JSON.stringify(project());
  await upload(job, Readable.from((async function* () { yield json; for (let n = 0; n < 65; n++) yield Buffer.alloc(1024 * 1024, 32); })()));
  const ready = await settled(job);
  expect(ready.source.bytes).toBeGreaterThan(64 * 1024 * 1024);
  expect(ready.limits.maxSourceBytes).toBe(512 * 1024 * 1024);
  expect(JSON.stringify(ready).length).toBeLessThan(5000);
  expect(state.project).toBe(original); expect(state.sessionId).toBe(id);
  const activated = await api(`/workbench/imports/${job.id}/activate`, {});
  expect(activated.ok, activated.error).toBe(true);
  expect(state.project.name).toBe('Imported'); expect(state.sessionId).not.toBe(id);
  expect(state.db.getSession(state.sessionId).destination_folder).toContain(join('assets', 'agent-sprites', state.sessionId));
  expect((await api(`/workbench/imports/${job.id}/activate`, {})).data).toEqual(activated.data);
  expect(await readdir(temp)).toEqual([]);
}, 25000);
test('gzip validates while malformed input and structural metadata fail without touching the draft', async () => {
  await start(); const original = state.project, session = state.db.getSession(state.sessionId);
  const good = await create('gzip'); await upload(good, gzipSync(JSON.stringify(project()))); await settled(good);
  for (const [encoding, bytes] of [['json', '{bad'], ['gzip', gzipSync('{}').subarray(0, 12)], ['json', JSON.stringify({ ...project(), shapeGroups: { '9,9': { broken: ['name'] } } })], ['json', JSON.stringify({ ...project(), shapeGroups: { '0,0': { broken: [4] } } })]]) {
    const bad = await create(encoding); await upload(bad, bytes); const result = await settled(bad, 'failed'); expect(result.error.length).toBeLessThan(1000);
  }
  expect(state.project).toBe(original); expect(state.db.getSession(state.sessionId)).toEqual(session);
});
test('source and expanded gzip budgets are independent trusted server limits', async () => {
  await start({ maxSourceBytes: 2048, maxExpandedBytes: 4096 });
  for (const [encoding, bytes, pattern] of [['json', Buffer.alloc(2049, 32), /source/i], ['gzip', gzipSync(' '.repeat(5000)), /expanded/i]]) {
    const job = await create(encoding, { maxSourceBytes: 100000 }); await upload(job, bytes);
    expect((await settled(job, 'failed')).error).toMatch(pattern);
  }
  expect(await readdir(temp)).toEqual([]);
});
test('pins project identity across A to B to A, while stale clients can inspect and cancel', async () => {
  await start(); const id = state.sessionId, job = await create(); await upload(job, JSON.stringify(project())); await settled(job);
  await api('/session/new', { name: 'Other' }); await api('/session/open-session', { ref: id });
  const result = await api(`/workbench/imports/${job.id}/activate`, {});
  expect(result.ok).toBe(false); expect(result.error).toMatch(/changed/i); expect(state.sessionId).toBe(id);
  await api('/session/new', { name: 'Third' });
  expect((await api(`/workbench/imports/${job.id}`, undefined, 'GET', { 'X-Sprite-Session': id })).ok).toBe(true);
  expect((await api(`/workbench/imports/${job.id}`, undefined, 'DELETE', { 'X-Sprite-Session': id })).ok).toBe(true);
  expect(await readdir(temp)).toEqual([]);
});
test('rejects receipt tampering and rolls back metadata transaction failures', async () => {
  await start(); const original = state.project, count = state.db.listSessions().length;
  const job = await create(); await upload(job, JSON.stringify(project())); await settled(job);
  const dirs = await readdir(temp); await writeFile(join(temp, dirs[0], 'validated.json'), '{}');
  expect((await api(`/workbench/imports/${job.id}/activate`, {})).error).toMatch(/receipt/i);
  const second = await create(); const packet = project(); packet.groups = { idle: ['0,0'] };
  await upload(second, JSON.stringify(packet)); await settled(second);
  const restore = vi.spyOn(state.db, 'setCellGroup').mockImplementation(() => { throw new Error('database unavailable'); });
  expect((await api(`/workbench/imports/${second.id}/activate`, {})).error).toMatch(/database unavailable/);
  restore.mockRestore(); expect(state.project).toBe(original); expect(state.db.listSessions()).toHaveLength(count);
});
test('cancels a slow upload and shutdown removes only owned files', async () => {
  await start(); await writeFile(join(temp, 'foreign-sentinel'), 'keep'); const job = await create();
  const req = request(`${base}/workbench/imports/${job.id}/file`, { method: 'PUT' }); req.on('error', () => {}); req.write('{');
  await vi.waitFor(async () => expect((await api(`/workbench/imports/${job.id}`)).data.source.bytes).toBe(1));
  await api(`/workbench/imports/${job.id}`, undefined, 'DELETE'); req.destroy(); await settled(job, 'canceled');
  await create(); await server.dispose(); expect(await readdir(temp)).toEqual(['foreign-sentinel']);
  expect(await readFile(join(temp, 'foreign-sentinel'), 'utf8')).toBe('keep');
});
test('restricts all import routes to the matching localhost origin and guards mutations', async () => {
  await start(); const job = await create();
  for (const [path, method] of [['', 'POST'], [`/${job.id}`, 'GET'], [`/${job.id}`, 'DELETE'], [`/${job.id}/activate`, 'POST'], [`/${job.id}/file`, 'PUT']]) {
    expect((await api(`/workbench/imports${path}`, method === 'POST' ? {} : undefined, method, { Origin: 'https://foreign.example' })).status).toBe(403);
  }
  expect((await api('/workbench/imports', { filename: 'x', encoding: 'json' }, 'POST', { 'X-Sprite-Session': 'stale' })).status).toBe(409);
});
test('queues only four live jobs behind one worker and cancels validation before starting the next', async () => {
  await start({ workerUrl: new URL('../fixtures/import-worker-hang.js', import.meta.url) });
  const first = await create(), second = await create();
  await upload(first, JSON.stringify(project())); await upload(second, JSON.stringify(project()));
  await create(); await create();
  expect((await api('/workbench/imports', { filename: 'fifth', encoding: 'json' })).status).toBe(429);
  expect((await api(`/workbench/imports/${first.id}`)).data.phase).toBe('validating');
  expect((await api(`/workbench/imports/${second.id}`)).data.phase).toBe('queued');
  await api(`/workbench/imports/${first.id}`, undefined, 'DELETE');
  await vi.waitFor(async () => expect((await api(`/workbench/imports/${second.id}`)).data.phase).toBe('validating'));
  await server.dispose(); expect(await readdir(temp)).toEqual([]);
});
test.each([
  ['timeout', 'import-worker-hang.js', /timed out/],
  ['worker failure', 'import-worker-exit.js', /worker exited/],
])('cleans %s with a bounded diagnostic', async (_label, fixture, error) => {
  await start({ workerUrl: new URL(`../fixtures/${fixture}`, import.meta.url), validationTimeoutMs: 100 });
  const original = state.project, job = await create(); await upload(job, JSON.stringify(project()));
  expect((await settled(job, 'failed')).error).toMatch(error);
  expect(state.project).toBe(original); expect(await readdir(temp)).toEqual([]);
});
test('successful activation remains idempotent for its original session guard', async () => {
  await start(); const original = state.sessionId, job = await create(); await upload(job, JSON.stringify(project())); await settled(job);
  const first = await api(`/workbench/imports/${job.id}/activate`, {}, 'POST', { 'X-Sprite-Session': original });
  const retry = await api(`/workbench/imports/${job.id}/activate`, {}, 'POST', { 'X-Sprite-Session': original });
  expect(retry.ok).toBe(true); expect(retry.data).toEqual(first.data);
});
test('a cleanup error after commit retains the successful receipt and retries on shutdown', async () => {
  await start(); const job = await create(); await upload(job, JSON.stringify(project())); await settled(job);
  const originalCleanup = server.imports.cleanup.bind(server.imports);
  const cleanup = vi.spyOn(server.imports, 'cleanup').mockRejectedValueOnce(new Error('temporary file locked')).mockImplementation(originalCleanup);
  const activated = await api(`/workbench/imports/${job.id}/activate`, {});
  expect(activated.ok, activated.error).toBe(true);
  const done = await settled(job, 'complete'); expect(done.receipt).toEqual(activated.data); expect(done.cleanupWarning).toContain('locked');
  await server.dispose(); expect(await readdir(temp)).toEqual([]); cleanup.mockRestore();
});
test('closing during job allocation cannot leave a newly allocated directory', async () => {
  await start();
  const creating = server.imports.create({ filename: 'race.json', encoding: 'json' });
  const rejection = expect(creating).rejects.toThrow(/shutting down|canceled/i);
  await server.dispose(); await rejection; expect(await readdir(temp)).toEqual([]);
});
