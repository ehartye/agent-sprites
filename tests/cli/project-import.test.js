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
test('postcommit interruption returns the completed receipt through the real import helper', async () => {
  const abort = new AbortController(), progress = [];
  const originalCleanup = server.imports.cleanup.bind(server.imports);
  const cleanup = vi.spyOn(server.imports, 'cleanup').mockImplementation(async job => {
    if (job.state === 'complete') abort.abort();
    await originalCleanup(job);
  });
  try {
    const receipt = await importProjectFile(input, { baseUrl, signal: abort.signal, pollMs: 1, onProgress: value => progress.push(value) });
    expect(abort.signal.aborted).toBe(true);
    expect(receipt).toMatchObject({ session_id: state.sessionId, project_name: 'Source' });
    expect(progress.at(-1).state).toBe('complete');
    expect([...server.imports.jobs.values()].every(job => job.state === 'complete')).toBe(true);
    expect(await readdir(temp)).toEqual(['source.json']);
  } finally { cleanup.mockRestore(); }
});
test('interruption immediately before activation still cancels without activating', async () => {
  const abort = new AbortController();
  await expect(importProjectFile(input, { baseUrl, signal: abort.signal, pollMs: 1, onProgress: progress => {
    if (progress.state === 'activating') abort.abort();
  } })).rejects.toThrow(/abort|cancel/i);
  expect(state.project).toBeNull(); expect(state.sessionId).toBeNull();
  expect([...server.imports.jobs.values()].every(job => job.state === 'canceled')).toBe(true);
  expect(await readdir(temp)).toEqual(['source.json']);
});
test('SIGINT after commit prints the committed CLI receipt and exits successfully', async () => {
  const child = fork(new URL('../fixtures/import-cli-interrupt.js', import.meta.url), [input], {
    silent: true, windowsHide: true, env: { ...process.env, SPRITE_PORT: String(server.port) },
  });
  let stdout = '', stderr = '', interrupted = false, signalAcknowledged = false;
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  const acknowledged = new Promise(resolve => child.on('message', message => { if (message === 'interrupted') { signalAcknowledged = true; resolve(); } }));
  const closed = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  const originalCleanup = server.imports.cleanup.bind(server.imports);
  const cleanup = vi.spyOn(server.imports, 'cleanup').mockImplementation(async job => {
    if (job.state === 'complete' && !interrupted) {
      interrupted = true; child.send('interrupt'); let deadline;
      try { await Promise.race([acknowledged, new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Owned CLI did not acknowledge SIGINT')), 2000); })]); }
      finally { clearTimeout(deadline); }
    }
    await originalCleanup(job);
  });
  try {
    expect(await closed).toEqual({ code: 0, signal: null }); expect(interrupted).toBe(true); expect(signalAcknowledged).toBe(true);
    expect(JSON.parse(stdout)).toMatchObject({ session_id: state.sessionId, project_name: 'Source' });
    expect(stderr).not.toContain('Import canceled.'); expect(await readdir(temp)).toEqual(['source.json']);
  } finally {
    cleanup.mockRestore();
    if (child.exitCode === null) { child.kill('SIGKILL'); await closed; }
  }
});

test.each([false, true])('a lost activation response recovers the committed receipt (interrupted: %s)', async interrupted => {
  const abort = new AbortController(), progress = [], calls = [];
  state.sessionId = 'original'; state.project = Project.create({ name: 'Original', cellSize: 8, rows: 1, cols: 1, palette: 'pico8' });
  const fetchImpl = async (url, options) => {
    calls.push({ url, ...options });
    const response = await fetch(url, options);
    if (url.endsWith('/activate')) {
      await response.json();
      if (interrupted) abort.abort();
      throw new Error('Activation response lost');
    }
    return response;
  };
  const receipt = await importProjectFile(input, { baseUrl, sessionId: 'original', signal: abort.signal, fetchImpl, pollMs: 1, onProgress: value => progress.push(value) });
  expect(receipt).toMatchObject({ session_id: state.sessionId, project_name: 'Source' });
  expect(progress.at(-1)).toMatchObject({ state: 'complete', receipt });
  expect(calls.filter(call => call.url.endsWith('/activate'))).toHaveLength(1);
  expect(calls.find(call => call.url.endsWith('/activate')).headers['X-Sprite-Session']).toBe('original');
  expect(calls.find(call => call.method === 'DELETE').headers['X-Sprite-Session']).toBeUndefined();
  expect(calls.find(call => call.method === 'DELETE').signal).toBeUndefined();
  expect([...server.imports.jobs.values()].every(job => job.state === 'complete')).toBe(true);
  expect(await readdir(temp)).toEqual(['source.json']);
});

test('job status recovers a committed receipt when both activation and cleanup responses are lost', async () => {
  let activationSent = false;
  const fetchImpl = async (url, options) => {
    const response = await fetch(url, options);
    if (url.endsWith('/activate')) { activationSent = true; await response.json(); throw new Error('Activation response lost'); }
    if (activationSent && options.method === 'DELETE') { await response.json(); throw new Error('Cleanup response lost'); }
    return response;
  };
  expect(await importProjectFile(input, { baseUrl, fetchImpl, pollMs: 1 })).toMatchObject({ session_id: state.sessionId, project_name: 'Source' });
  expect(await readdir(temp)).toEqual(['source.json']);
});

test('unavailable recovery leaves postcommit interruption unconfirmed with bounded diagnostics', async () => {
  const abort = new AbortController(); let activationSent = false;
  const fetchImpl = async (url, options) => {
    if (activationSent) throw new Error(`${options.method === 'DELETE' ? 'Cleanup unavailable' : 'Status unavailable'} ${'x'.repeat(1000)}`);
    const response = await fetch(url, options);
    if (url.endsWith('/activate')) { activationSent = true; await response.json(); abort.abort(); throw new Error(`Activation response lost ${'x'.repeat(1000)}`); }
    return response;
  };
  const error = await importProjectFile(input, { baseUrl, signal: abort.signal, fetchImpl, pollMs: 1 }).catch(error => error);
  expect(error).toMatchObject({ importState: 'unconfirmed' });
  expect(error.message).toMatch(/activation outcome unconfirmed.*inspect.*before retrying/i);
  expect(error.message).toContain('Activation response lost'); expect(error.message).toContain('Cleanup unavailable'); expect(error.message).toContain('Status unavailable');
  expect(error.message.length).toBeLessThanOrEqual(600);
  expect(state.project.name).toBe('Source'); expect(await readdir(temp)).toEqual(['source.json']);
});

test.each([false, true])('the command recovers a lost activation receipt (SIGINT: %s)', async interrupted => {
  const { stdout, stderr } = await promisify(execFile)(process.execPath, ['tests/fixtures/import-cli-activation-loss.js', input, 'recover', String(interrupted)], {
    cwd: join(import.meta.dirname, '..', '..'), env: { ...process.env, SPRITE_PORT: String(server.port) }, timeout: 15000, windowsHide: true,
  });
  expect(JSON.parse(stdout)).toMatchObject({ session_id: state.sessionId, project_name: 'Source' });
  expect(stderr).not.toContain('Import canceled.'); expect(await readdir(temp)).toEqual(['source.json']);
});

test('the command reports an unconfirmed activation when SIGINT coincides with lost recovery', async () => {
  const error = await promisify(execFile)(process.execPath, ['tests/fixtures/import-cli-activation-loss.js', input, 'unconfirmed', 'true'], {
    cwd: join(import.meta.dirname, '..', '..'), env: { ...process.env, SPRITE_PORT: String(server.port) }, timeout: 15000, windowsHide: true,
  }).catch(error => error);
  expect(error.code).toBe(1); expect(error.stdout).toBe('');
  expect(error.stderr).toMatch(/activation outcome unconfirmed.*inspect.*before retrying/i);
  expect(error.stderr).not.toContain('Import canceled.'); expect(state.project.name).toBe('Source');
  expect(await readdir(temp)).toEqual(['source.json']);
});
