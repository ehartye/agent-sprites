import { beforeEach, afterEach, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SessionDB } from '../../server/db/session.js';
import { startWebServer } from '../../server/web/http.js';

const exec = promisify(execFile);
let state, server, temp;
beforeEach(async () => {
  state = { db: new SessionDB(':memory:'), project: null, sessionId: null };
  server = await startWebServer(state, 0); temp = mkdtempSync(join(tmpdir(), 'sprite-composition-'));
});
afterEach(async () => {
  server.wss.close(); await new Promise(resolve => server.httpServer.close(resolve)); state.db.close();
  rmSync(temp, { recursive: true, force: true });
});
async function cli(...args) {
  return exec(process.execPath, [resolve('scripts/sprite.js'), ...args], {
    env: { ...process.env, SPRITE_PORT: String(server.port) }, timeout: 20000, windowsHide: true,
  });
}
it('creates and revises a deterministic composition through the real CLI and session guard', async () => {
  await cli('new', 'Garden', '--size', '16', '--rows', '1', '--cols', '1', '--dest', temp);
  await cli('draw', 'point', '--cell', '0,0', '--name', 'hidden-marker', '--x', '0', '--y', '0', '--color', '#ffffff', '--z', '1000', '--visible', 'false');
  expect(state.project.cells.getCell('0,0').shapes.getByName('hidden-marker')).toMatchObject({ zIndex: 1000, visible: false });
  const file = join(temp, 'composition.json');
  const spec = { cell: '0,0', prefix: 'garden', parts: { seed: { shapes: [
    { name: 'tip', type: 'point', params: { x: 0, y: 0 }, color: '#00ff00' },
  ] } }, placements: [{ kind: 'scatter', part: 'seed', name: 'flowers', x: 1, y: 1, w: 12, h: 12, count: 8, seed: 'orchard' }] };
  writeFileSync(file, JSON.stringify(spec));
  const empty = state.project.toJSON();
  const planned = JSON.parse((await cli('compose', '--file', file, '--plan', '--session', state.sessionId)).stdout);
  expect(planned.instances).toHaveLength(8);
  expect(state.project.toJSON()).toEqual(empty);
  const first = JSON.parse((await cli('compose', '--file', file, '--session', state.sessionId)).stdout);
  expect(first.instances).toHaveLength(8);
  const before = state.project.cells.getCell('0,0').toJSON();
  spec.parts.seed.shapes[0].color = '#ff0000'; writeFileSync(file, JSON.stringify(spec));
  await expect(cli('compose', '--file', file, '--session', 'old-session')).rejects.toMatchObject({ code: 1, stderr: expect.stringMatching(/session changed/) });
  expect(state.project.cells.getCell('0,0').toJSON()).toEqual(before);
  await cli('compose', '--file', file, '--session', state.sessionId);
  expect(state.project.cells.getCell('0,0').shapes.listByZ().map(s => s.id)).toEqual(before.shapes.map(s => s.id));
  await cli('undo', '--cell', '0,0');
  expect(state.project.cells.getCell('0,0').toJSON()).toEqual(before);
});

it('builds the copied composition example through the normal verified publication pipeline', async () => {
  cpSync(resolve('examples/composition'), join(temp, 'composition'), { recursive: true });
  const built = JSON.parse((await cli('build', join(temp, 'composition/sprite-project.json'), '--json')).stdout);
  expect(built.ok, built.errors?.join('\n')).toBe(true);
  const project = JSON.parse(readFileSync(join(temp, 'composition/dist/garden.project.json'), 'utf8'));
  expect(project.cells['0,0'].shapes.some(shape => shape.params.composition?.part === 'flower')).toBe(true);
  expect(state.project).toBeNull();
});

it('accepts a valid dense composition through the same payload policy in isolated builds', async () => {
  const compose = { command: 'compose', cell: '0,0', prefix: 'dense', parts: { dots: { shapes:
    Array.from({ length: 1600 }, (_, i) => ({ name: `detail-${i}`, type: 'point', params: { x: i % 16, y: Math.floor(i / 16) % 16 }, color: '#00ff00' })),
  } }, placements: [{ kind: 'stamp', part: 'dots', name: 'one', x: 0, y: 0 }] };
  expect(Buffer.byteLength(JSON.stringify(compose))).toBeGreaterThan(102400);
  writeFileSync(join(temp, 'operations.json'), JSON.stringify([{ command: 'new', name: 'dense', size: 16, rows: 1, cols: 1 }, compose]));
  writeFileSync(join(temp, 'sprite-project.json'), JSON.stringify({ version: 1, ops: 'operations.json', output: 'dist' }));
  const built = JSON.parse((await cli('build', join(temp, 'sprite-project.json'), '--json')).stdout);
  expect(built.ok, built.errors?.join('\n')).toBe(true);
  expect(JSON.parse(readFileSync(join(temp, 'dist/dense.project.json'), 'utf8')).cells['0,0'].shapes).toHaveLength(1600);
});
