import { afterEach, beforeEach, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SessionDB } from '../../server/db/session.js';
import { Project } from '../../server/engine/project.js';
import { startWebServer } from '../../server/web/http.js';
import { mapCommandToApi } from '../../scripts/batch-commands.js';
let dir, state, server, input;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sprite-cli-storage-')); input = join(dir, 'project.json');
  writeFileSync(input, JSON.stringify(Project.create({ name: 'Formats', cellSize: 8, rows: 1, cols: 1, palette: 'pico8' }).toSharedJSON()));
  state = { db: new SessionDB(':memory:'), project: null, sessionId: null }; server = await startWebServer(state, 0);
});
afterEach(async () => {
  await server.dispose(); server.wss.close(); server.httpServer.closeAllConnections(); await new Promise(resolve => server.httpServer.close(resolve));
  state.db.close(); rmSync(dir, { recursive: true, force: true });
});
const cli = (...args) => promisify(execFile)(process.execPath, ['scripts/sprite.js', ...args], {
  cwd: join(import.meta.dirname, '..', '..'), env: { ...process.env, SPRITE_PORT: String(server.port) }, timeout: 15000,
});
test('save format flags reach the actual API and retain the session storage choice', async () => {
  await cli('open', input);
  await cli('save', '--format', 'expanded'); expect(JSON.parse(readFileSync(input, 'utf8')).version).toBe(1);
  expect(state.project.storageVersion).toBe(2);
  await cli('save'); expect(JSON.parse(readFileSync(input, 'utf8')).version).toBe(2);
  await cli('save', '--format', 'shared'); expect(JSON.parse(readFileSync(input, 'utf8')).version).toBe(2);
  await expect(cli('save', '--format', 'unknown')).rejects.toMatchObject({ stderr: expect.stringContaining('format') });
});
test('batch save maps the optional format without dropping it', () => {
  expect(mapCommandToApi({ command: 'save', format: 'expanded' })).toMatchObject({ body: { format: 'expanded' } });
});
