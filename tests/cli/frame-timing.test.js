import { afterEach, beforeEach, expect, test } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionDB } from '../../server/db/session.js';
import { startWebServer } from '../../server/web/http.js';

const exec = promisify(execFile);
let state, server, temp;
beforeEach(async () => {
  state = { db: new SessionDB(':memory:'), project: null, sessionId: null };
  server = await startWebServer(state, 0);
  temp = mkdtempSync(join(tmpdir(), 'sprite-timing-cli-'));
  await cli('new', 'Timing', '--size', '2', '--rows', '1', '--cols', '3', '--dest', temp);
});
afterEach(async () => {
  server.wss.close();
  await new Promise(resolve => server.httpServer.close(resolve));
  state.db.close();
  rmSync(temp, { recursive: true, force: true });
});
function cli(...args) {
  return exec(process.execPath, [resolve('scripts/sprite.js'), ...args], {
    env: { ...process.env, SPRITE_PORT: String(server.port) }, timeout: 10000, windowsHide: true,
  });
}
async function json(...args) { return JSON.parse((await cli(...args)).stdout); }

test('duration CLI reads, sets and clears canonical aliases with optional session guards', async () => {
  await cli('name', '--cell', '0,0', '--as', 'hold');
  await cli('group', 'create', 'walk', '0,0', '0,1', '--fps', '20');
  expect(await json('duration', 'read', '--cell', 'hold', '--group', 'walk')).toEqual({ cell: '0,0', group: 'walk', overrideMs: null, effectiveMs: 50, source: 'group' });
  expect(await json('duration', 'set', '21', '--cell', 'hold', '--session', state.sessionId)).toMatchObject({ cell: '0,0', overrideMs: 21, effectiveMs: 21 });
  await expect(cli('duration', 'clear', '--cell', 'hold', '--session', 'old-session')).rejects.toMatchObject({ code: 1, stderr: expect.stringMatching(/session changed/) });
  expect(state.project.frameDurations).toEqual({ '0,0': 21 });
  expect(await json('duration', 'clear', '--cell', 'hold')).toMatchObject({ cell: '0,0', overrideMs: null, effectiveMs: 125 });
  for (const ms of ['0', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992']) {
    await expect(cli('duration', 'set', ms, '--cell', 'hold')).rejects.toMatchObject({ code: 1 });
  }
  expect(state.project.frameDurations).toEqual({});
});

test('batch duration reads return results and batch group loop edits persist', async () => {
  const path = join(temp, 'timing.json');
  writeFileSync(path, JSON.stringify([
    { command: 'group', sub: 'create', name: 'walk', cells: ['0,0', '0,1'], fps: 20 },
    { command: 'duration', cell: '0,0', ms: 42 },
    { command: 'duration', sub: 'read', cell: '0,0', group: 'walk' },
    { command: 'duration', cell: '0,0', ms: null },
    { command: 'duration', sub: 'read', cell: '0,0', group: 'walk' },
    { command: 'group', sub: 'loop', name: 'walk', loop: false },
  ]));
  const report = await json('batch', path, '--json');
  expect(report.succeeded).toBe(6);
  expect(report.results).toEqual([
    { index: 3, command: 'duration', data: { cell: '0,0', group: 'walk', overrideMs: 42, effectiveMs: 42, source: 'frame' } },
    { index: 5, command: 'duration', data: { cell: '0,0', group: 'walk', overrideMs: null, effectiveMs: 50, source: 'group' } },
  ]);
  expect(JSON.parse(state.db.getSession(state.sessionId).draft_json).animationLoops.walk).toBe(false);
  await cli('group', 'loop', 'walk', 'true', '--session', state.sessionId);
  expect(state.project.animationLoops.walk).toBe(true);
  await expect(cli('group', 'loop', 'walk', 'maybe')).rejects.toMatchObject({ code: 1 });
  await expect(cli('group', 'create', 'bad-loop', '0,0', '--loop', 'maybe')).rejects.toMatchObject({ code: 1 });
  expect(state.project.animationLoops.walk).toBe(true);
});

test('standalone group timing commands and export honor explicit session guards',async()=>{
  await cli('group','create','walk','0,0','0,1','--fps','10');
  const before=state.db.getSession(state.sessionId).draft_json;
  const requests=[
    ['group','fps','walk','6'],['group','direction','walk','reverse'],['group','loop','walk','false'],
    ['group','create','later','0,0'],['group','add','walk','0,2'],['group','remove','walk','0,0'],
    ['group','delete','walk'],['group','list'],['export','--dest',join(temp,'stale-export')],
  ];
  for(const args of requests)await expect(cli(...args,'--session','previous-session')).rejects.toMatchObject({code:1,stderr:expect.stringMatching(/session changed/)});
  expect(state.db.getSession(state.sessionId).draft_json).toBe(before);
  expect(state.db.getCellGroupFps(state.sessionId)).toEqual({walk:10});
});

test('real terminal animation follows reverse order, explicit milliseconds and one-shot default then leaves the final frame visible', async () => {
  await cli('group', 'create', 'once', '0,0', '0,1', '0,2', '--fps', '1000', '--direction', 'reverse', '--loop', 'false');
  await cli('duration', 'set', '2', '--cell', '0,0');
  await cli('duration', 'set', '3', '--cell', '0,1');
  const { stdout, stderr } = await cli('view-anim', 'once', '--fps', '500');
  expect(stderr).toBe('');
  expect([...stdout.matchAll(/Frame (\d)\/3[^\n]*\n/g)].map(match => match[0])).toEqual([
    expect.stringContaining('0,2 · 2 ms'), expect.stringContaining('0,1 · 3 ms'), expect.stringContaining('0,0 · 2 ms'),
  ]);
  expect(stdout.trimEnd()).toMatch(/Frame 3\/3[^\n]*0,0 · 2 ms$/);
  expect(stdout.split('Frame ')).toHaveLength(4);
  await expect(cli('view-anim', 'once', '--loops', '-1')).rejects.toMatchObject({ code: 1 });
  await expect(cli('view-anim', 'once', '--loops', '1.5')).rejects.toMatchObject({ code: 1 });
  await expect(cli('view-anim', 'once', '--fps', '5000')).rejects.toMatchObject({ code: 1 });
});
