import { afterEach, beforeEach, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionDB } from '../../server/db/session.js';
import { startWebServer } from '../../server/web/http.js';

let state, server, base, temp;
beforeEach(async () => {
  state = { db: new SessionDB(':memory:'), project: null, sessionId: null };
  server = await startWebServer(state, 0);
  base = `http://localhost:${server.port}/api/`;
  temp = mkdtempSync(join(tmpdir(), 'sprite-frame-timing-'));
  await api('session/new', { name: 'Timing', size: 2, rows: 1, cols: 3, dest: temp });
});
afterEach(async () => {
  server.wss.close();
  await new Promise(resolve => server.httpServer.close(resolve));
  state.db.close();
  rmSync(temp, { recursive: true, force: true });
});
async function api(path, body, session) {
  return (await fetch(`${base}${path}`, {
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
    headers: { 'Content-Type': 'application/json', ...(session ? { 'X-Sprite-Session': session } : {}) },
  })).json();
}

test('aliases write and read the canonical coordinate across groups and clearing restores each group rate', async () => {
  await api('cell/name', { cell: '0,0', name: 'hold' });
  await api('group/cell/create', { name: 'walk', cells: ['0,0', '0,1'], fps: 20 });
  await api('group/cell/create', { name: 'idle', cells: ['0,0'], fps: 5 });
  expect((await api('cell/duration?cell=hold&group=walk')).data).toEqual({ cell: '0,0', group: 'walk', overrideMs: null, effectiveMs: 50, source: 'group' });
  expect((await api('cell/duration', { cell: 'hold', ms: 17 })).data).toEqual({ cell: '0,0', overrideMs: 17, effectiveMs: 17, source: 'frame' });
  expect(state.project.frameDurations).toEqual({ '0,0': 17 });
  expect((await api('cell/duration?cell=hold&group=idle')).data.effectiveMs).toBe(17);
  expect((await api('cell/duration', { cell: 'hold', ms: null, group: 'idle' })).data).toEqual({ cell: '0,0', group: 'idle', overrideMs: null, effectiveMs: 200, source: 'group' });
  expect((await api('cell/duration?cell=0,0&group=walk')).data.effectiveMs).toBe(50);
  expect((await api('cell/duration?cell=hold')).data).toMatchObject({ overrideMs: null, effectiveMs: 125, source: 'default' });
});

test('invalid durations, unknown groups and stale requests leave the timing map and draft unchanged', async () => {
  await api('cell/duration', { cell: '0,0', ms: 31 });
  const before = state.db.getSession(state.sessionId).draft_json;
  for (const ms of [0, -1, 1.5, '20', Number.MAX_SAFE_INTEGER + 1]) {
    expect((await api('cell/duration', { cell: '0,0', ms })).ok).toBe(false);
  }
  expect((await api('cell/duration', { cell: '0,0', ms: 22, group: 'missing' })).ok).toBe(false);
  expect((await api('cell/duration?cell=0,0&group=constructor')).ok).toBe(false);
  expect((await api('cell/duration', { cell: '0,0', ms: null }, 'old-session')).ok).toBe(false);
  expect(state.project.frameDurations).toEqual({ '0,0': 31 });
  expect(state.db.getSession(state.sessionId).draft_json).toBe(before);
});

test('unrepresentable group FPS rejects before creating or changing a group', async () => {
  await api('group/cell/create', { name: 'walk', cells: ['0,0'], fps: 10 });
  const before = state.db.getSession(state.sessionId).draft_json;
  for (const fps of [5000, 0, -1, 1e-20, '10', null]) {
    expect((await api('group/cell/create', { name: 'bad', cells: ['0,1'], fps })).ok).toBe(false);
    expect((await api('group/cell/create', { name: 'walk', cells: ['0,2'], fps })).ok).toBe(false);
    expect((await api('group/cell/fps', { name: 'walk', fps })).ok).toBe(false);
  }
  expect(state.db.getCellGroups(state.sessionId)).toEqual({ walk: ['0,0'] });
  expect(state.db.getCellGroupFps(state.sessionId)).toEqual({ walk: 10 });
  expect(state.db.getSession(state.sessionId).draft_json).toBe(before);
});

test('invalid group names cannot author timing metadata that fails to reopen',async()=>{
  const before=state.db.getSession(state.sessionId).draft_json;
  for(const name of ['',null,42,[],{}]) {
    expect((await api('group/cell/create',{name,cells:['0,0'],fps:8,loop:false})).ok).toBe(false);
    expect((await api('group/cell/add',{name,cells:['0,0']})).ok).toBe(false);
  }
  expect(state.db.getCellGroups(state.sessionId)).toEqual({});
  expect(state.db.getSession(state.sessionId).draft_json).toBe(before);
});

test('group alias edits preserve repeated holds and reject invalid references before changing stored groups', async () => {
  await api('cell/name', { cell: '0,0', name: 'hold' });
  await api('cell/name', { cell: '0,1', name: 'next' });
  expect((await api('group/cell/create', { name: 'walk', cells: ['hold', '0,0', 'next'], fps: 20 })).ok).toBe(true);
  expect(state.db.getCellGroups(state.sessionId)).toEqual({ walk: ['0,0', '0,0', '0,1'] });
  expect((await api('group/cell/add', { name: 'walk', cells: ['hold', 'next', '0,2', '0,2'] })).ok).toBe(true);
  expect(state.db.getCellGroups(state.sessionId)).toEqual({ walk: ['0,0', '0,0', '0,1', '0,2'] });
  const before = state.db.getSession(state.sessionId).draft_json;
  for (const cells of [['0,1', 'missing'], ['0,1', '0,99']]) {
    expect((await api('group/cell/create', { name: 'bad', cells })).ok).toBe(false);
    expect((await api('group/cell/create', { name: 'walk', cells })).ok).toBe(false);
    expect((await api('group/cell/add', { name: 'walk', cells })).ok).toBe(false);
    expect((await api('group/cell/remove', { name: 'walk', cells })).ok).toBe(false);
  }
  expect(state.db.getCellGroups(state.sessionId)).toEqual({ walk: ['0,0', '0,0', '0,1', '0,2'] });
  expect(state.db.getSession(state.sessionId).draft_json).toBe(before);
  expect((await api('group/cell/remove', { name: 'walk', cells: ['hold'] })).ok).toBe(true);
  expect(state.db.getCellGroups(state.sessionId)).toEqual({ walk: ['0,1', '0,2'] });
});

test('group loop editing persists and safely distinguishes prototype names from unknown groups', async () => {
  expect((await api('group/cell/loop', { name: 'constructor', loop: false })).ok).toBe(false);
  await api('group/cell/create', { name: '__proto__', cells: ['0,0'], fps: 20 });
  expect((await api('group/cell/loop', { name: '__proto__', loop: false })).ok).toBe(true);
  expect((await api('group/cell/fps', { name: '__proto__', fps: 25 })).ok).toBe(true);
  expect((await api('group/cell/direction', { name: '__proto__', direction: 'reverse' })).ok).toBe(true);
  const original = state.sessionId;
  const draft = state.db.getSession(original).draft_json;
  expect(JSON.parse(draft).animationLoops.__proto__).toBe(false);
  expect((await api('group/cell/loop', { name: '__proto__', loop: 'false' })).ok).toBe(false);
  expect(state.db.getSession(original).draft_json).toBe(draft);
  await api('session/new', { name: 'Other' });
  await api('session/open-session', { ref: original });
  expect(state.project.animationLoops.__proto__).toBe(false);
  expect((await api('cell/duration?cell=0,0&group=__proto__')).data.effectiveMs).toBe(40);
});

test('copying and clearing shapes keeps destination timing while drafts, copy, save and import preserve independent maps', async () => {
  await api('cell/duration', { cell: '0,0', ms: 31 });
  await api('cell/duration', { cell: '0,1', ms: 72 });
  await api('cell/copy', { from: '0,0', to: '0,1' });
  await api('cell/clear', { cell: '0,1' });
  await api('cell/name', { cell: '0,1', name: 'destination' });
  expect((await api('cell/duration?cell=destination')).data.effectiveMs).toBe(72);
  const original = state.sessionId;
  await api('session/copy', { name: 'Timing copy' });
  await api('cell/duration', { cell: '0,0', ms: 99 });
  await api('session/open-session', { ref: original });
  expect(state.project.frameDurations).toEqual({ '0,0': 31, '0,1': 72 });
  await api('session/save', {});
  const saved = JSON.parse(readFileSync(state.db.getSession(original).json_file, 'utf8'));
  expect(saved.frameDurations).toEqual({ '0,0': 31, '0,1': 72 });
  expect((await api('session/import', { project: saved, name: 'Imported timing' })).ok).toBe(true);
  expect(state.project.frameDurations).toEqual(saved.frameDurations);
  await api('cell/duration', { cell: '0,0', ms: null });
  await api('session/open-session', { ref: original });
  expect(state.project.frameDurations).toEqual(saved.frameDurations);
});
