// @risk standard
// Subject is the test-support helper tests/support/owned-child-process.js, which has no risk-map area.
import { test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { readFileSync, realpathSync } from 'node:fs';
import { ownedChildProcess } from '../support/owned-child-process.js';

const fixture = fileURLToPath(new URL('../fixtures/owned-child-http.js', import.meta.url));
function message(child, type) {
  return new Promise((resolve, reject) => {
    const clean = () => { clearTimeout(timer); child.off('message', receive); child.off('close', closed); };
    const receive = value => { if (value.type === type) { clean(); resolve(value); } };
    const closed = () => { clean(); reject(Error(`Child closed before ${type}`)); };
    const timer = setTimeout(() => { clean(); reject(Error(`Child IPC ${type} timed out`)); }, 3000);
    child.on('message', receive); child.once('close', closed);
  });
}

test('owned server cleanup remains pending after HTTP acknowledgement until the child closes', async () => {
  const owner = ownedChildProcess(process.execPath, [fixture], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let cleanup;
  try {
    const { port } = await message(owner.child, 'ready');
    await owner.waitUntilReady(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
      return response.ok;
    }, { startupMessage: `Sprite editor: http://localhost:${port}` });
    let acknowledged;
    const acknowledgement = new Promise(resolve => { acknowledged = resolve; });
    cleanup = owner.shutdown(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/shutdown`, { method: 'POST', signal: AbortSignal.timeout(1000) });
      expect(await response.json()).toEqual({ ok: true }); acknowledged();
    });
    await Promise.race([acknowledgement, cleanup.then(() => { throw Error('Cleanup returned before acknowledging shutdown'); })]);
    const held = message(owner.child, 'exit-barrier-held');
    owner.child.send('probe');
    expect(await Promise.race([cleanup.then(() => 'cleanup-finished'), held.then(() => 'barrier-held')])).toBe('barrier-held');
    owner.child.send('release');
    await cleanup;
    expect(await owner.closed).toEqual({ code: 0, signal: null });
  } finally {
    await owner.terminate();
    await cleanup;
  }
});

test.each(['startup', 'shutdown'])('failed %s closes the owned child before returning its error', async phase => {
  const owner = ownedChildProcess(process.execPath, [fixture], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  try {
    await message(owner.child, 'ready');
    const failure = async () => { throw Error(`${phase} failed`); };
    await expect(phase === 'startup' ? owner.waitUntilReady(failure) : owner.shutdown(failure)).rejects.toThrow(`${phase} failed`);
    const held = owner.child.connected ? message(owner.child, 'exit-barrier-held').then(() => 'still-alive', () => 'closed') : Promise.resolve('closed');
    if (owner.child.connected) owner.child.send('probe');
    expect(await Promise.race([owner.closed.then(() => 'closed'), held])).toBe('closed');
    await owner.closed;
  } finally { await owner.terminate(); }
});

test('occupied matching-checkout port receives no health, CLI or shutdown requests from the failed owner', async () => {
  const requests = [], runtimeRoot = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
  const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
  const identity = { ok: true, service: 'agent-sprites', protocol: 1, version, runtimeRoot };
  const foreign = http.createServer((req, res) => { requests.push(req.url); res.end(JSON.stringify(identity)); });
  await new Promise(resolve => foreign.listen(0, '127.0.0.1', resolve));
  const port = foreign.address().port, baseUrl = `http://127.0.0.1:${port}`;
  const owner = ownedChildProcess(process.execPath, [fixture], { env: { ...process.env, SPRITE_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let cliInvocations = 0;
  const startup = owner.waitUntilReady(async () => {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1000) });
    expect(await response.json()).toEqual(identity); return true;
  }, { startupMessage: `Sprite editor: http://localhost:${port}` }).then(async () => {
    cliInvocations++; await fetch(`${baseUrl}/api/session/new`, { method: 'POST', signal: AbortSignal.timeout(1000) });
  }).then(() => ({ success: true }), error => ({ error }));
  try {
    await message(owner.child, 'listen-failed');
    await owner.shutdown(() => fetch(`${baseUrl}/api/control/shutdown`, { method: 'POST', signal: AbortSignal.timeout(1000) }), { timeoutMs: 200 }).catch(() => {});
    const result = await startup;
    await owner.closed;
    expect(requests).toEqual([]); expect(cliInvocations).toBe(0);
    expect(result).toMatchObject({ error: expect.any(Error) });
    expect(result.error.message).toMatch(/Owned child closed before startup/);
    // The foreign listener remains alive; the owner's failure cleanup targeted only its own child.
    expect((await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1000) })).ok).toBe(true);
    expect(requests).toEqual(['/health']);
  } finally {
    await owner.terminate(); foreign.closeAllConnections(); await new Promise(resolve => foreign.close(resolve));
  }
});
