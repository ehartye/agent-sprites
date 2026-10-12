import { test, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { ownedCli } from '../support/owned-cli.js';

const fixture = fileURLToPath(new URL('../fixtures/delayed-cli.js', import.meta.url));
function ready(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const clean = () => { clearTimeout(timer); child.stdout.off('data', data); child.off('close', closed); };
    const data = bytes => { output += bytes; if (output.includes('READY\n')) { clean(); resolve(); } };
    const closed = () => { clean(); reject(Error('CLI closed before READY')); };
    const timer = setTimeout(() => { clean(); reject(Error('CLI READY timed out')); }, 3000);
    child.stdout.on('data', data); child.once('close', closed);
  });
}

test('timeout teardown waits for pending CLI close and blocks a late continuation before server cleanup', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'sprite-owned-cli-')), launches = join(directory, 'launches.txt');
  const owner = ownedCli(process.execPath, [fixture], { timeout: 20000 });
  const command = owner.run('pending', launches), child = command.child;
  const closed = new Promise(resolve => child.once('close', resolve));
  const events = [];
  child.once('close', () => events.push('cli-close'));
  const lateContinuation = command.catch(() => owner.run('later', launches)).then(() => ({ success: true }), error => ({ error }));
  try {
    await ready(child);
    await owner.close(); events.push('server-cleanup');
    const result = await lateContinuation;
    expect(readFileSync(launches, 'utf8')).toBe('pending\n');
    expect(result.error?.message).toBe('CLI owner is closing');
    expect(events).toEqual(['cli-close', 'server-cleanup']);
  } finally {
    child.kill('SIGKILL'); await closed; await owner.close(); await lateContinuation;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('completed CLI commands preserve output and permit the next ordinary command', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'sprite-owned-cli-')), launches = join(directory, 'launches.txt');
  const owner = ownedCli(process.execPath, [fixture], { timeout: 20000 });
  try {
    expect((await owner.run('first', launches)).stdout).toBe('completed\n');
    expect((await owner.run('second', launches)).stdout).toBe('completed\n');
    expect(readFileSync(launches, 'utf8')).toBe('first\nsecond\n');
  } finally { await owner.close(); rmSync(directory, { recursive: true, force: true }); }
});
