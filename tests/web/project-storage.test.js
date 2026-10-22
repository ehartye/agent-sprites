import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionDB } from '../../server/db/session.js';
import { Project } from '../../server/engine/project.js';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';
import { createConstructionRecorder } from '../../server/engine/construction-replay.js';
import { startWebServer } from '../../server/web/http.js';

let state, server, base, dir;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sprite-storage-'));
  state = { db: new SessionDB(':memory:'), project: null, sessionId: null };
  server = await startWebServer(state, 0); base = `http://localhost:${server.port}/api`;
});
afterEach(async () => {
  vi.restoreAllMocks(); await server.dispose(); server.wss.close(); server.httpServer.closeAllConnections();
  await new Promise(resolve => server.httpServer.close(resolve)); state.db.close(); rmSync(dir, { recursive: true, force: true });
});
async function api(path, body) {
  return (await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })).json();
}
function fixture(version) {
  const p = Project.create({ name: 'portable', cellSize: 8, rows: 1, cols: 3, palette: 'pico8' });
  p.cells.getCell('0,0').name = 'start';
  p.cells.getCell('0,0').draw('point', { x: 1, y: 1,
    layers: [{ id: 'clip', x: 1, y: 1, w: 4, h: 4, z: 0, background: { mode: 'transparent' } }],
    surface: { normal: { mode: 'grid', x: 1, y: 1, rows: ['6'] }, material: { solid: true }, lamps: [{ name: 'key', x: 1, y: 1 }] },
  }, '#fff', 'dot');
  p.cells.getCell('0,0').setLighting({ palettePolicy: 'rgb', ambient: 0.5 });
  p.cells.copyCell('0,0', '0,1');
  p.cells.getCell('0,2').reference = { path: 'reference.png', opacity: 0.3 };
  p.frameDurations = { '0,0': 150 }; p.animationLoops = { idle: false }; p.groups.create('idle', ['0,0', '0,1']);
  p.animationDirections = { idle: 'pingpong' }; p.animationFps = { idle: 6 };
  p.shapeGroups = { start: { legacy: ['dot'] }, '0,0': { current: ['dot'] }, orphan: { old: ['missing'] } };
  p.review = { note: 'Keep this', author: 'Artist' }; p.pivot = { x: 4, y: 7 };
  const replay = createConstructionRecorder({ cells: ['0,0'] }, { operations: [{ command: 'new' }], source: { kind: 'ops', path: 'ops.json' }, inputs: [{ path: 'ops.json', sha256: '0'.repeat(64) }] });
  replay.capture(p, 0); replay.finish(p);
  return version === 2 ? p.toSharedJSON() : p.toJSON();
}
test.each([1, 2])('V%s storage survives open, draft edits, restart hydration, session switching and copy', async version => {
  const file = join(dir, 'input.json'); writeFileSync(file, JSON.stringify(fixture(version)));
  expect((await api('/session/open', { path: file })).ok).toBe(true);
  const id = state.sessionId;
  expect(JSON.parse(state.db.getSession(id).draft_json).version).toBe(version);
  expect((await api('/shape/move', { cell: '0,0', name: 'dot', dx: 1, dy: 0 })).ok).toBe(true);
  const draft = JSON.parse(state.db.getSession(id).draft_json);
  expect(draft.version).toBe(version);
  state.project = Project.fromJSON(draft); // The restart loader uses this same storage-preserving entry point.
  expect(state.project.storageVersion).toBe(version);
  await api('/session/new', { name: 'other', rows: 1, cols: 1 });
  expect((await api('/session/open-session', { ref: id })).ok).toBe(true);
  expect(state.project.storageVersion).toBe(version);
  const source = state.project;
  const expected = source.toJSON(); expected.name = 'variation';
  const expanded = version === 2 ? vi.spyOn(source, 'toJSON').mockImplementation(() => { throw new Error('expanded source copy'); }) : null;
  const copy = await api('/session/copy', { name: 'variation' });
  expect(copy.ok, copy.error).toBe(true);
  if (expanded) expect(expanded).not.toHaveBeenCalled();
  expect(state.project.storageVersion).toBe(version); expect(state.sessionId).not.toBe(id);
  expect(JSON.parse(state.db.getSession(state.sessionId).draft_json).version).toBe(version);
  expect(state.project.cells.getCell('0,0').shapes.get('dot').params.x).toBe(2);
  expect(state.project.review.note).toBe('Keep this'); expect(state.project.frameDurations['0,0']).toBe(150);
  expect(state.project.toJSON()).toEqual(expected);
  for (const channel of ['color', 'normal']) {
    const renderer = new CanvasRenderer(source.palette);
    expect(renderer.renderCellRaw(state.project.cells.getCell('0,0'), { channel })).toEqual(renderer.renderCellRaw(source.cells.getCell('0,0'), { channel }));
  }
});
test.each([1, 2])('V%s file download and save honor current storage and explicit formats without changing it', async version => {
  const file = join(dir, 'input.json'); writeFileSync(file, JSON.stringify(fixture(version)));
  await api('/session/open', { path: file });
  for (const [format, expected] of [[undefined, version], ['shared', 2], ['expanded', 1]]) {
    const response = await fetch(base + '/workbench/project-file' + (format ? `?format=${format}` : ''));
    expect(response.ok).toBe(true); expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('content-disposition')).toContain('portable.project.json');
    const data = await response.json(); expect(data.version).toBe(expected); expect(data).not.toHaveProperty('ok');
    expect(Project.fromJSON(data).toJSON()).toEqual(state.project.toJSON());
    expect((await api('/session/save', format ? { format } : {})).ok).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(expected);
    expect(state.project.storageVersion).toBe(version);
  }
  expect((await api('/workbench/project')).data.version).toBe(1);
  expect((await api('/workbench/project-summary')).data.storageVersion).toBe(version);
  const before = readFileSync(file, 'utf8');
  expect((await api('/session/save', { format: 'unknown' })).ok).toBe(false);
  expect(readFileSync(file, 'utf8')).toBe(before);
  expect((await api('/workbench/project-file?format=unknown')).ok).toBe(false);
  expect((await fetch(base + '/workbench/project-file?format=unknown')).status).toBe(400);
});
test('project file download fails as an HTTP error when no session is active', async () => {
  const response = await fetch(base + '/workbench/project-file'); expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ ok: false, error: 'No active project' });
});
test('a failed open leaves the active project, session, and database unchanged', async () => {
  await api('/session/new', { name: 'active', rows: 1, cols: 1 });
  const original = state.project, id = state.sessionId, sessions = state.db.listSessions(20);
  const file = join(dir, 'bad.json'); writeFileSync(file, JSON.stringify({ ...fixture(2), geometry: {} }));
  expect((await api('/session/open', { path: file })).ok).toBe(false);
  expect(state.project).toBe(original); expect(state.sessionId).toBe(id); expect(state.db.listSessions(20)).toEqual(sessions);
});
test('database failure opening a valid shared file preserves the active session', async () => {
  await api('/session/new', { name: 'active', rows: 1, cols: 1 });
  const original = state.project, id = state.sessionId;
  const file = join(dir, 'valid.json'); writeFileSync(file, JSON.stringify(fixture(2)));
  vi.spyOn(state.db, 'setCellGroup').mockImplementation(() => { throw new Error('metadata write failed'); });
  expect((await api('/session/open', { path: file })).ok).toBe(false);
  expect(state.project).toBe(original); expect(state.sessionId).toBe(id); expect(state.db.listSessions(20)).toHaveLength(1);
});
test('failed first save does not record an unwritten file path', async () => {
  const blocker = join(dir, 'blocked'); writeFileSync(blocker, 'keep');
  await api('/session/new', { name: 'active', rows: 1, cols: 1, dest: blocker });
  const id = state.sessionId, before = state.db.getSession(id);
  expect((await api('/session/save', {})).ok).toBe(false);
  expect(state.db.getSession(id)).toEqual(before); expect(readFileSync(blocker, 'utf8')).toBe('keep');
});
test('failed new session database write preserves the active project', async () => {
  await api('/session/new', { name: 'active', rows: 1, cols: 1 });
  const project = state.project, id = state.sessionId;
  vi.spyOn(state.db, 'createSession').mockImplementation(() => { throw new Error('database unavailable'); });
  expect((await api('/session/new', { name: 'uncommitted', rows: 1, cols: 1 })).ok).toBe(false);
  expect(state.project).toBe(project); expect(state.sessionId).toBe(id);
});
