import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { request } from 'node:http';
import { SessionDB } from '../../server/db/session.js';
import { Project } from '../../server/engine/project.js';
import { startWebServer } from '../../server/web/http.js';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';

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
test.each([1, 2])('owned V%s imports publish a compact receipt without expanding the activated project', async version => {
  await start(); const packet = project();
  packet.cells['0,0'] = { name: null, reference: null, shapes: [{ id: 's1', name: 'dot', type: 'point', params: { x: 1, y: 2 }, color: 'red', zIndex: 0, visible: true }] };
  const data = version === 2 ? Project.fromJSON(packet).toSharedJSON() : packet;
  const source = Buffer.from(JSON.stringify(data)), job = await create(); await upload(job, source);
  const ready = await settled(job), internal = server.imports.jobs.get(job.id);
  expect(internal.worker).toBeNull();
  const output = await readFile(join(internal.dir, 'validated.json'));
  expect(JSON.parse(output).version).toBe(2);
  expect(ready.source).toMatchObject({ bytes: source.length, sha256: createHash('sha256').update(source).digest('hex') });
  expect(ready.expanded).toMatchObject({ bytes: source.length, sha256: createHash('sha256').update(source).digest('hex') });
  expect(ready.output).toMatchObject({ bytes: output.length, sha256: createHash('sha256').update(output).digest('hex') });
  const expanded = vi.spyOn(Project.prototype, 'toJSON').mockImplementation(() => { throw new Error('expanded activation snapshot'); });
  try {
    const activated = await api(`/workbench/imports/${job.id}/activate`, {});
    expect(activated.ok, activated.error).toBe(true); expect(expanded).not.toHaveBeenCalled();
    expect(state.project.storageVersion).toBe(2);
    expect(JSON.parse(state.db.getSession(state.sessionId).draft_json).version).toBe(2);
  } finally { expanded.mockRestore(); }
});
test.each([1, 2])('owned V%s imports reject nearest lighting after palette hydration without changing session or ID allocation', async version => {
  await start();
  const baseline = await api('/draw', { type: 'point', cell: '0,0', x: 0, y: 0, color: '#fff' });
  const beforeId = BigInt(baseline.data.shapeId.slice(1)), original = state.project, id = state.sessionId, saved = state.db.getSession(id), count = state.db.listSessions().length;
  const packet = project();
  packet.cells['0,0'] = { name: null, reference: null, lighting: { palettePolicy: 'nearest' }, shapes: [{ id: 's900000', name: 'dot', type: 'point', params: { x: 1, y: 2 }, color: '#fff', zIndex: 0, visible: true }] };
  if (version === 2) {
    packet.version = 2; packet.geometry = { g0: { type: 'point', params: { x: 1, y: 2 } } };
    packet.cells['0,0'].shapes = packet.cells['0,0'].shapes.map(({ type, params, ...instance }) => ({ ...instance, geometryRef: 'g0' }));
  }
  packet.palette = [{ name: 'same', color: '#fff' }, { name: 'same', color: 'transparent' }];
  const job = await create(); await upload(job, JSON.stringify(packet));
  let result;
  await vi.waitFor(async () => { result = (await api(`/workbench/imports/${job.id}`)).data; expect(['uploading', 'validating']).not.toContain(result.state); });
  expect(result.state).toBe('failed'); expect(result.error).toMatch(/nonempty opaque palette/);
  expect((await api(`/workbench/imports/${job.id}/activate`, {})).ok).toBe(false);
  expect(state.project).toBe(original); expect(state.sessionId).toBe(id); expect(state.db.getSession(id)).toEqual(saved); expect(state.db.listSessions()).toHaveLength(count);
  expect(await readdir(temp)).toEqual([]);
  const next = await api('/draw', { type: 'point', cell: '0,0', x: 1, y: 0, color: '#fff' });
  expect(next.data.shapeId).toBe(`s${beforeId + 1n}`);
});
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
  for (const [encoding, bytes] of [['json', '{bad'], ['gzip', gzipSync('{}').subarray(0, 12)], ['json', JSON.stringify({ ...project(), shapeGroups: { '0,0': ['not a group map'] } })], ['json', JSON.stringify({ ...project(), shapeGroups: { '0,0': { broken: [4] } } })]]) {
    const bad = await create(encoding); await upload(bad, bytes); const result = await settled(bad, 'failed'); expect(result.error.length).toBeLessThan(1000);
  }
  expect(state.project).toBe(original); expect(state.db.getSession(state.sessionId)).toEqual(session);
});

test('safe alias and orphan shape groups survive import and draft roundtrip without adopting orphan ownership', async () => {
  await start();
  const packet = project();
  packet.cells['0,0'] = { name: 'named', reference: null, shapes: [{ id: 's1', name: 'dot', type: 'point', params: { x: 1, y: 1 }, color: 'red', zIndex: 0, visible: true }] };
  packet.shapeGroups = {
    named: { ['__proto__']: ['dot'], same: ['legacy-member'] },
    '0,0': { same: ['dot'] },
    '9,9': { orphan: ['dot'] },
    missing: { old: ['missing-member'] },
  };
  const job = await create(); await upload(job, JSON.stringify(packet)); await settled(job);
  expect((await api(`/workbench/imports/${job.id}/activate`, {})).ok).toBe(true);
  const stored = JSON.parse(state.db.getSession(state.sessionId).draft_json);
  expect(stored.version).toBe(2); expect(state.project.storageVersion).toBe(2);
  expect(stored.shapeGroups).toEqual(packet.shapeGroups);
  expect(Project.fromJSON(stored).toJSON().shapeGroups).toEqual(packet.shapeGroups);
  const summary = (await api('/workbench/project-summary')).data;
  expect(Object.keys(summary.shapeGroups)).toEqual(['0,0']);
  expect(summary.shapeGroups['0,0'].toSorted()).toEqual(['__proto__', 'same']);
  const pins = new URLSearchParams({ sessionId: summary.sessionId, projectId: summary.projectId, revision: summary.revision });
  const frame = await api(`/workbench/frames?refs=0,0&${pins}`);
  expect(frame.data.shapeGroups['0,0']).toEqual({ ['__proto__']: ['dot'], same: ['dot'] });
  expect(state.db.getAllShapeGroups(state.sessionId)).toEqual(packet.shapeGroups);
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

test('optional project pins reject stale import activation without consuming the ready job', async () => {
  await start(); const job = await create(); await upload(job, JSON.stringify(project())); await settled(job);
  const original = state.project, summary = (await api('/workbench/project-summary')).data;
  const headers = { 'X-Sprite-Session': summary.sessionId, 'X-Sprite-Project': summary.projectId, 'X-Sprite-Revision': String(summary.revision) };
  expect((await api(`/workbench/imports/${job.id}/activate`, {}, 'POST', { 'X-Sprite-Project': summary.projectId })).status).toBe(400);
  await api('/cell/name', { cell: '0,0', name: 'edited' });
  expect((await api(`/workbench/imports/${job.id}/activate`, {}, 'POST', headers)).status).toBe(409);
  expect(state.project).toBe(original); expect((await settled(job)).state).toBe('ready');
  expect((await api(`/workbench/imports/${job.id}`, undefined, 'GET', headers)).ok).toBe(true);
  const current = (await api('/workbench/project-summary')).data;
  const fresh = { ...headers, 'X-Sprite-Revision': String(current.revision) };
  const activated = await api(`/workbench/imports/${job.id}/activate`, {}, 'POST', fresh);
  expect(activated.ok).toBe(true);
  const replayed = await api(`/workbench/imports/${job.id}/activate`, {}, 'POST', fresh);
  expect(replayed.ok).toBe(true); expect(replayed.data).toEqual(activated.data);
});

test('optional import pins are rechecked after asynchronous activation I/O', async () => {
  await start(); const job = await create(); await upload(job, JSON.stringify(project())); await settled(job);
  const original = state.project, summary = (await api('/workbench/project-summary')).data;
  const headers = { 'X-Sprite-Session': summary.sessionId, 'X-Sprite-Project': summary.projectId, 'X-Sprite-Revision': String(summary.revision) };
  const pins = server.imports.pins.bind(server.imports); let calls = 0;
  const check = vi.spyOn(server.imports, 'pins').mockImplementation(candidate => {
    pins(candidate); if (++calls === 2) state.broadcast({ type: 'animation_timing' });
  });
  try {
    expect((await api(`/workbench/imports/${job.id}/activate`, {}, 'POST', headers)).status).toBe(409);
    expect(state.project).toBe(original); expect((await settled(job)).state).toBe('ready');
    expect((await api(`/workbench/imports/${job.id}`, undefined, 'DELETE', headers)).ok).toBe(true);
  } finally { check.mockRestore(); }
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
test('failed activation restores ID allocation as well as the active project and database', async () => {
  await start();
  const baseline = await api('/draw', { type: 'point', cell: '0,0', x: 0, y: 0, color: 'red' });
  const lastId = BigInt(baseline.data.shapeId.slice(1));
  const original = state.project, originalJSON = JSON.stringify(original.toJSON());
  const originalSession = state.db.getSession(state.sessionId), sessionCount = state.db.listSessions().length;
  const packet = project();
  packet.cells['0,0'] = { name: null, shapes: [{ id: 's1000000000000', name: null, type: 'point', params: { x: 1, y: 1 }, color: 'red', zIndex: 0, visible: true }] };
  const job = await create(); await upload(job, JSON.stringify(packet)); await settled(job);
  const update = vi.spyOn(state.db, 'updateSession').mockImplementation(() => { throw new Error('forced destination update failure'); });
  try { expect((await api(`/workbench/imports/${job.id}/activate`, {})).error).toMatch(/forced destination/); }
  finally { update.mockRestore(); }
  expect(state.project).toBe(original); expect(JSON.stringify(state.project.toJSON())).toBe(originalJSON);
  expect(state.db.getSession(state.sessionId)).toEqual(originalSession); expect(state.db.listSessions()).toHaveLength(sessionCount);
  const drawn = [];
  for (let i = 1; i <= 6; i++) {
    const result = await api('/draw', { type: 'point', cell: '0,0', x: i, y: 0, color: 'red' });
    expect(result.ok, result.error).toBe(true); drawn.push(result.data.shapeId);
  }
  expect(drawn).toEqual(Array.from({ length: 6 }, (_, index) => `s${lastId + BigInt(index + 1)}`));
});
test.each([
  ['single near-limit ID', ['s9007199254740990']],
  ['allocation while hydrating later shapes', ['s9007199254740989', 's1']],
])('rejects imported IDs that exhaust drawing before readiness: %s', async (_label, ids) => {
  await start(); const original = state.project, originalJSON = JSON.stringify(original.toJSON());
  const originalSession = state.db.getSession(state.sessionId), packet = project();
  packet.cells['0,0'] = { name: null, shapes: ids.map((id, index) => ({ id, name: null, type: 'point', params: { x: index, y: 1 }, color: 'red', zIndex: index, visible: true })) };
  const job = await create(); await upload(job, JSON.stringify(packet));
  let result;
  await vi.waitFor(async () => { result = (await api(`/workbench/imports/${job.id}`)).data; expect(['uploading', 'validating']).not.toContain(result.state); });
  expect(result.state).toBe('failed'); expect(result.error).toMatch(/ID.*exhaust|ID.*space/i);
  expect(state.project).toBe(original); expect(JSON.stringify(original.toJSON())).toBe(originalJSON);
  expect(state.db.getSession(state.sessionId)).toEqual(originalSession);
  for (let i = 1; i <= 6; i++) expect((await api('/draw', { type: 'point', cell: '0,0', x: i, y: 0, color: 'red' })).ok).toBe(true);
});
test('cancels a slow upload and shutdown removes only owned files', async () => {
  await start(); await writeFile(join(temp, 'foreign-sentinel'), 'keep'); const job = await create();
  let closed = false;
  const req = request(`${base}/workbench/imports/${job.id}/file`, { method: 'PUT' }); req.on('error', () => {}); req.on('close', () => { closed = true; }); req.write('{');
  await vi.waitFor(async () => expect((await api(`/workbench/imports/${job.id}`)).data.source.bytes).toBe(1));
  await api(`/workbench/imports/${job.id}`, undefined, 'DELETE'); await vi.waitFor(() => expect(closed).toBe(true)); await settled(job, 'canceled');
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
  await start({ workerUrl: new URL(`../fixtures/${fixture}`, import.meta.url), validationTimeoutMs: fixture.includes('hang') ? 100 : 2000 });
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
test('notification failure after commit retains the successful activated session', async () => {
  await start(); const job = await create(); await upload(job, JSON.stringify(project())); await settled(job);
  const original = state.sessionId, logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  state.broadcast = () => { throw new Error('notification unavailable'); };
  try {
    const activated = await api(`/workbench/imports/${job.id}/activate`, {});
    expect(activated.ok, activated.error).toBe(true); expect(state.sessionId).not.toBe(original);
    expect(state.db.getSession(activated.data.session_id).project_name).toBe('Imported');
    expect((await settled(job, 'complete')).receipt).toEqual(activated.data);
    expect(logged).toHaveBeenCalledWith('Project activated; notification failed:', 'notification unavailable');
  } finally { logged.mockRestore(); }
});
test('closing during job allocation cannot leave a newly allocated directory', async () => {
  await start();
  const creating = server.imports.create({ filename: 'race.json', encoding: 'json' });
  const rejection = expect(creating).rejects.toThrow(/shutting down|canceled/i);
  await server.dispose(); await rejection; expect(await readdir(temp)).toEqual([]);
});
test('expiry keeps ownership when temporary file removal fails so shutdown can retry', async () => {
  await start(); const job = await create(); const internal = server.imports.jobs.get(job.id);
  const cleanup = vi.spyOn(server.imports, 'cleanup').mockRejectedValueOnce(new Error('temporary file locked'));
  internal.touched -= server.imports.limits.expiryMs + 1;
  await server.imports.expire(); expect(server.imports.jobs.has(job.id)).toBe(true);
  cleanup.mockRestore(); await server.dispose(); expect(await readdir(temp)).toEqual([]);
});
test('storage diagnostics do not expose owned temporary paths', async () => {
  await start(); const job = await create(); await upload(job, JSON.stringify(project())); await settled(job);
  const [dir] = await readdir(temp); await rm(join(temp, dir, 'validated.json'));
  const result = await api(`/workbench/imports/${job.id}/activate`, {});
  expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain(temp);
  const failed = await settled(job, 'failed'); expect(failed.error).not.toContain(temp);
});
test.each([
  ['unknown primitive', shape => { shape.type = 'unknown'; }],
  ['missing geometry', shape => { delete shape.params.x; }],
  ['nonfinite geometry', shape => { shape.params.x = 'OVERFLOW'; }],
  ['malformed points', shape => { shape.type = 'polygon'; shape.params = { points: [{ x: 0, y: 0 }, { x: 1 }, { x: 2, y: 2 }] }; }],
  ['unsafe ID', shape => { shape.id = 's9007199254740991'; }],
  ['unsafe z', shape => { shape.zIndex = 1e30; }],
  ['retained layer without lighting', shape => { shape.params.layers = [{ id: 'bad-layer' }]; }],
  ['runaway primitive work', shape => { shape.type = 'line'; shape.params = { x1: 0, y1: 0, x2: 1e12, y2: 1e12 }; }],
  ['unsafe patterned rectangle endpoint', shape => { shape.type = 'rect'; shape.params = { x: Number.MAX_SAFE_INTEGER, y: 0, w: 3, h: 1, filled: true, pattern: 'checker', color2: 'blue' }; }],
])('rejects %s during worker validation before readiness', async (_label, mutate) => {
  await start(); const original = state.project, packet = project();
  const shape = { id: 's1', name: null, type: 'point', params: { x: 1, y: 2 }, color: 'red', zIndex: 0, visible: true }; mutate(shape);
  packet.cells['0,0'] = { name: null, shapes: [shape] }; const job = await create(); await upload(job, JSON.stringify(packet).replace('"OVERFLOW"', '1e309'));
  let result; await vi.waitFor(async () => { result = (await api('/workbench/imports/' + job.id)).data; expect(['uploading', 'validating']).not.toContain(result.state); }); expect(result.state).toBe('failed'); expect(result.error).toMatch(/shape|geometry|layer|ID|z/i); expect(state.project).toBe(original);
});
test('preserves fractional V1 geometry and z, exhausted z, and native snapping through import', async () => {
  await start(); const packet = project();
  packet.cells['0,0'] = { name: null, shapes: [
    { id: 's1', name: 'fractional', type: 'line', params: { x1: 0.4, y1: 0.6, x2: 4.2, y2: 5.8 }, color: 'red', zIndex: 500.25, visible: true },
    { id: 's2', name: 'exhausted', type: 'point', params: { x: 7.2, y: 1.6 }, color: 'blue', zIndex: Number.MAX_SAFE_INTEGER, visible: true },
  ] };
  const canonical = Project.fromJSON(packet), renderer = new CanvasRenderer(canonical.palette);
  const expected = renderer.renderCellRaw(canonical.cells.getCell('0,0'));
  const job = await create(); await upload(job, JSON.stringify(packet));
  let ready; await vi.waitFor(async () => { ready = (await api('/workbench/imports/' + job.id)).data; expect(['uploading', 'validating']).not.toContain(ready.state); });
  expect(ready.state, ready.error).toBe('ready');
  expect((await api(`/workbench/imports/${job.id}/activate`, {})).ok).toBe(true);
  expect(state.project.toJSON()).toEqual(canonical.toJSON());
  expect(renderer.renderCellRaw(state.project.cells.getCell('0,0'))).toEqual(expected);
});
test('accepts a patterned rectangle whose snapped endpoint stays within the safe numeric range', async () => {
  await start(); const packet = project();
  const params = { x: Number.MAX_SAFE_INTEGER - 3, y: 0.4, w: 3, h: 1.2, filled: true, pattern: 'checker', color2: 'blue' };
  packet.cells['0,0'] = { name: null, shapes: [{ id: 's1', name: null, type: 'rect', params, color: 'red', zIndex: 500.25, visible: true }] };
  const job = await create(); await upload(job, JSON.stringify(packet)); await settled(job);
  expect((await api(`/workbench/imports/${job.id}/activate`, {})).ok).toBe(true);
  expect(state.project.cells.getCell('0,0').shapes.get('s1').params).toEqual(params);
  const pixels = new CanvasRenderer(state.project.palette).renderCellRaw(state.project.cells.getCell('0,0'));
  expect(pixels).toEqual(new Uint8ClampedArray(8 * 8 * 4));
});
test.each([false, true])('layered fractional art roundtrips and renders with surface=%s', async surface => {
  await start(); const packet = project();
  const layers = [{ id: 'outer', x: 1, y: 1, w: 6, h: 6, z: 0, background: { mode: 'transparent' } },
    { id: 'inner', x: 2, y: 2, w: 4, h: 4, z: 0, background: { mode: 'transparent' } }];
  packet.cells['0,0'] = { name: null, shapes: [
    { id: 's1', name: 'pattern', type: 'rect', params: { x: 2.2, y: 2.3, w: 2.7, h: 2.6, filled: true, pattern: 'checker', color2: 'blue', layers }, color: 'red', zIndex: 500.25, visible: true },
    { id: 's2', name: 'line', type: 'line', params: { x1: 2.4, y1: 2.2, x2: 5.1, y2: 5.3, layers }, color: 'white', zIndex: 501.5, visible: true },
  ] };
  if (surface) for (const shape of packet.cells['0,0'].shapes) shape.params.surface = { normal: { mode: 'flat' } };
  const canonical = Project.fromJSON(packet), renderer = new CanvasRenderer(canonical.palette);
  const expected = renderer.renderCellRaw(canonical.cells.getCell('0,0'));
  expect(expected.some(value => value !== 0)).toBe(true);
  const job = await create(); await upload(job, JSON.stringify(packet)); await settled(job);
  expect((await api(`/workbench/imports/${job.id}/activate`, {})).ok).toBe(true);
  expect(state.project.toJSON()).toEqual(canonical.toJSON());
  expect(renderer.renderCellRaw(state.project.cells.getCell('0,0'))).toEqual(expected);
});
