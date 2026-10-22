import { expect, test, vi } from 'vitest';
import { fork } from 'node:child_process';
import { mkdtemp, readdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('real server signal handler awaits import cleanup and leaves a foreign sentinel intact', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sprite-import-shutdown-'));
  const child = fork(new URL('../fixtures/import-owned-server.js', import.meta.url), [], { silent: true, windowsHide: true,
    env: { ...process.env, SPRITE_PORT: '0', SPRITE_DB_PATH: join(directory, 'child.db'), TEMP: directory, TMP: directory, TMPDIR: directory } });
  let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
  const closed = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  try {
    await vi.waitFor(() => expect(stderr).toMatch(/Sprite editor: http:\/\/localhost:(\d+)/), { timeout: 5000 });
    const base = stderr.match(/Sprite editor: (http:\/\/localhost:\d+)/)[1];
    const response = await fetch(`${base}/api/workbench/imports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: 'waiting.json', encoding: 'json' }) });
    expect(response.status).toBe(201);
    await writeFile(join(directory, 'foreign-sentinel'), 'keep');
    expect((await readdir(directory)).some(name => name.startsWith('agent-sprites-import-'))).toBe(true);
    child.send('shutdown'); expect(await closed).toEqual({ code: 0, signal: null });
    expect((await readdir(directory)).some(name => name.startsWith('agent-sprites-import-'))).toBe(false);
    expect(await readFile(join(directory, 'foreign-sentinel'), 'utf8')).toBe('keep');
  } finally {
    if (child.exitCode === null) { child.kill('SIGKILL'); await closed; }
    await rm(directory, { recursive: true, force: true });
  }
}, 10000);
