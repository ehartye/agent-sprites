import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile, fork } from 'node:child_process';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { SessionDB } from '../../server/db/session.js';
import { Project } from '../../server/engine/project.js';
import { startWebServer } from '../../server/web/http.js';
import { importProjectFile } from '../../scripts/project-import-client.js';

let temp, state, server, baseUrl, input;
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'sprite-import-cli-'));
  state = { db: new SessionDB(':memory:'), project: null, sessionId: null };
  server = await startWebServer(state, 0, { imports: { directory: temp } }); baseUrl = `http://localhost:${server.port}`;
  input = join(temp, 'source.json'); await writeFile(input, JSON.stringify(Project.create({ name: 'Source', cellSize: 8, rows: 1, cols: 1, palette: 'pico8' }).toJSON()));
});
afterEach(async () => {
  await server.dispose(); server.wss.close(); server.httpServer.closeAllConnections(); await new Promise(r => server.httpServer.close(r)); state.db.close(); await rm(temp, { recursive: true, force: true });
});
test('CLI client streams a local file to the shared job API, reports progress and activates a copy', async () => {
  const progress = []; const receipt = await importProjectFile(input, { baseUrl, name: 'CLI copy', onProgress: data => progress.push(data), pollMs: 1 });
  expect(receipt.project_name).toBe('CLI copy'); expect(receipt.session_id).toBe(state.sessionId);
  expect(progress.some(item => item.state === 'uploading' && item.loaded > 0)).toBe(true);
  expect(progress.at(-1).state).toBe('complete'); expect(await readdir(temp)).toEqual(['source.json']);
});
test('client cancellation during validation deletes owned files after the active session changes', async () => {
  server.imports.workerUrl = new URL('../fixtures/import-worker-hang.js', import.meta.url);
  const abort = new AbortController(); const original = Project.create({ name: 'Other', cellSize: 8, rows: 1, cols: 1, palette: 'pico8' });
  const importing = importProjectFile(input, { baseUrl, signal: abort.signal, pollMs: 1, onProgress: progress => {
    if (progress.state === 'validating') { state.project = original; state.sessionId = 'different'; abort.abort(); }
  } });
  await expect(importing).rejects.toThrow(/abort|cancel/i);
  expect(state.project).toBe(original); expect(await readdir(temp)).toEqual(['source.json']);
  expect([...server.imports.jobs.values()].every(job => job.state === 'canceled')).toBe(true);
});
test('the import command accepts gzip and emits only the activation receipt on stdout', async () => {
  const gzip = join(temp, 'source.json.gz'); await writeFile(gzip, gzipSync(await readFile(input)));
  const { stdout, stderr } = await promisify(execFile)(process.execPath, ['scripts/sprite.js', 'import', gzip, '--name', 'Command copy'], {
    cwd: join(import.meta.dirname, '..', '..'), env: { ...process.env, SPRITE_PORT: String(server.port) }, timeout: 15000,
  });
  expect(JSON.parse(stdout)).toMatchObject({ project_name: 'Command copy', session_id: state.sessionId }); expect(stderr).toMatch(/upload|validat|complete/i);
});
test('SIGINT waits for cancellation and owned file cleanup before the CLI exits', async () => {
  server.imports.workerUrl = new URL('../fixtures/import-worker-hang.js', import.meta.url);
  const child = fork(new URL('../fixtures/import-cli-interrupt.js', import.meta.url), [input], {
    silent: true, windowsHide: true, env: { ...process.env, SPRITE_PORT: String(server.port) },
  });
  let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
  const closed = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  try {
    await vi.waitFor(() => expect(stderr).toMatch(/validating/), { timeout: 5000 }); child.send('interrupt');
    expect(await closed).toEqual({ code: 130, signal: null });
    expect(stderr).toContain('Import canceled.'); expect(await readdir(temp)).toEqual(['source.json']);
    expect([...server.imports.jobs.values()].every(job => job.state === 'canceled')).toBe(true);
  } finally { if (child.exitCode === null) { child.kill('SIGKILL'); await closed; } }
});
