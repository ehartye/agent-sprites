import { beforeEach, afterEach, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SessionDB } from '../../server/db/session.js';
import { startWebServer } from '../../server/web/http.js';

const exec = promisify(execFile);
let state, server, temp;
beforeEach(async () => {
  state = { db: new SessionDB(':memory:'), project: null, sessionId: null };
  server = await startWebServer(state, 0);
  temp = mkdtempSync(join(tmpdir(), 'sprite-ascii-'));
});
afterEach(async () => {
  server.wss.close();
  await new Promise(resolve => server.httpServer.close(resolve));
  state.db.close();
  rmSync(temp, { recursive: true, force: true });
});
async function cli(...args) {
  return exec(process.execPath, [resolve('scripts/sprite.js'), ...args], {
    env: { ...process.env, SPRITE_PORT: String(server.port) }, timeout: 10000, windowsHide: true,
  });
}

it('reads and revises a region through real CLI processes and exposes batch read results', async () => {
  await cli('new', 'ASCII study', '--size', '8', '--rows', '1', '--cols', '1', '--dest', temp);
  const patchPath = join(temp, 'patch.json');
  const patch = { x: 2, y: 3, prefix: 'eyes', rows: ['RB', '.R'], colors: { R: '#ff0000', B: '#0000ff' } };
  writeFileSync(patchPath, JSON.stringify(patch));
  const applied = JSON.parse((await cli('ascii', 'patch', '--cell', '0,0', '--file', patchPath)).stdout);
  expect(applied.changed).toBe(3);
  const readArgs = ['ascii', 'read', '--cell', '0,0', '--x', '2', '--y', '3', '--w', '2', '--h', '2', '--colors', JSON.stringify(patch.colors)];
  expect(JSON.parse((await cli(...readArgs)).stdout).rows).toEqual(['RB', '_R']);
  await cli('undo', '--cell', '0,0');
  expect(JSON.parse((await cli(...readArgs)).stdout).rows).toEqual(['__', '__']);
  await cli('redo', '--cell', '0,0');
  const batchPath = join(temp, 'read.json');
  writeFileSync(batchPath, JSON.stringify([{ command: 'ascii', sub: 'read', cell: '0,0', x: 2, y: 3, w: 2, h: 2, colors: patch.colors }]));
  const report = JSON.parse((await cli('batch', batchPath, '--json')).stdout);
  expect(report.results).toEqual([{ index: 1, command: 'ascii', data: expect.objectContaining({ rows: ['RB', '_R'] }) }]);
});

it('pins ASCII commands to an explicit session before sending a patch', async () => {
  await cli('new', 'Pinned study', '--size', '8', '--rows', '1', '--cols', '1', '--dest', temp);
  const patchPath = join(temp, 'patch.json');
  writeFileSync(patchPath, JSON.stringify({ x: 0, y: 0, rows: ['R'], colors: { R: '#ff0000' } }));
  await expect(cli('ascii', 'patch', '--cell', '0,0', '--file', patchPath, '--session', 'previous-session')).rejects.toMatchObject({ code: 1, stderr: expect.stringMatching(/session changed/) });
  expect(state.project.cells.getCell('0,0').shapes.listByZ()).toHaveLength(0);
  await cli('ascii', 'patch', '--cell', '0,0', '--file', patchPath, '--session', state.sessionId);
  expect(state.project.cells.getCell('0,0').shapes.listByZ()).toHaveLength(1);
});
