import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, renameSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProject } from '../../server/build/project-build.js';

const faults = vi.hoisted(() => ({ rename: null }));
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, renameSync: vi.fn((from, to) => {
    faults.rename?.(from, to);
    return actual.renameSync(from, to);
  }) };
});
vi.mock('node:timers/promises', async importOriginal => ({
  ...await importOriginal(), setTimeout: vi.fn(async () => {}),
}));

let dir, config, output, previous, originalPlatform;
const denied = code => Object.assign(new Error(`rename denied: ${code}`), { code });
const publishing = (from, to) => from.includes('.staging-') && !from.endsWith('.previous') && to === output;
beforeEach(async () => {
  originalPlatform = process.platform;
  Object.defineProperty(process, 'platform', { value: 'win32' });
  faults.rename = null;
  dir = mkdtempSync(join(tmpdir(), 'sprite-publication-'));
  output = join(dir, 'dist'); config = join(dir, 'sprite-project.json');
  writeFileSync(join(dir, 'ops.json'), JSON.stringify([
    { command: 'new', name: 'tiny', size: 16, rows: 1, cols: 1 },
    { command: 'draw', type: 'rect', cell: '0,0', name: 'body', x: 3, y: 3, w: 8, h: 8, color: '#29adff', filled: true },
  ]));
  writeFileSync(config, JSON.stringify({ version: 1, ops: 'ops.json', output: 'dist' }));
  expect((await buildProject(config)).ok).toBe(true);
  previous = readFileSync(join(output, 'tiny.png'));
  vi.mocked(renameSync).mockClear(); vi.mocked(delay).mockClear();
});
afterEach(() => {
  faults.rename = null;
  Object.defineProperty(process, 'platform', { value: originalPlatform });
  rmSync(dir, { recursive: true, force: true });
});

test.each(['EPERM', 'EACCES', 'EBUSY'])('retries transient Windows %s when publishing verified output', async code => {
  let attempts = 0;
  faults.rename = (from, to) => { if (publishing(from, to) && ++attempts <= 2) throw denied(code); };
  const result = await buildProject(config);
  expect(result.errors).toEqual([]); expect(result.ok).toBe(true);
  expect(attempts).toBe(3);
  expect(vi.mocked(delay).mock.calls).toEqual([[50], [100]]);
  expect(readFileSync(join(output, 'tiny.png'))).toEqual(previous);
  expect(readdirSync(dir).some(name => /staging|previous|build-lock/.test(name))).toBe(false);
});

test('retries the backup rename before publishing', async () => {
  let attempts = 0;
  faults.rename = from => { if (from === output && ++attempts <= 2) throw denied('EBUSY'); };
  expect((await buildProject(config)).ok).toBe(true);
  expect(attempts).toBe(3);
  expect(vi.mocked(delay).mock.calls).toEqual([[50], [100]]);
});

test('exhausts six publication attempts then retries restoration without deleting prior output', async () => {
  let publishAttempts = 0, restoreAttempts = 0;
  faults.rename = (from, to) => {
    if (publishing(from, to)) { publishAttempts++; throw denied('EPERM'); }
    if (from.endsWith('.previous') && ++restoreAttempts <= 2) throw denied('EACCES');
  };
  const result = await buildProject(config);
  expect(result.ok).toBe(false);
  expect(result.errors[0].message).toContain('rename denied: EPERM');
  expect(publishAttempts).toBe(6); expect(restoreAttempts).toBe(3);
  expect(vi.mocked(delay).mock.calls).toEqual([[50], [100], [200], [400], [800], [50], [100]]);
  expect(readFileSync(join(output, 'tiny.png'))).toEqual(previous);
  expect(readdirSync(dir).some(name => /staging|previous|build-lock/.test(name))).toBe(false);
});

test('backup retry exhaustion leaves existing output in place', async () => {
  let attempts = 0;
  faults.rename = from => { if (from === output) { attempts++; throw denied('EPERM'); } };
  expect((await buildProject(config)).ok).toBe(false);
  expect(attempts).toBe(6); expect(delay).toHaveBeenCalledTimes(5);
  expect(readFileSync(join(output, 'tiny.png'))).toEqual(previous);
});

test('restoration retry exhaustion retains the backup and identifies its recovery path', async () => {
  let backup, restoreAttempts = 0;
  faults.rename = (from, to) => {
    if (from === output) backup = to;
    if (publishing(from, to)) throw denied('EPERM');
    if (from.endsWith('.previous')) { restoreAttempts++; throw denied('EBUSY'); }
  };
  const result = await buildProject(config);
  expect(result.ok).toBe(false); expect(restoreAttempts).toBe(6);
  expect(result.errors[0].message).toContain(backup);
  expect(readFileSync(join(backup, 'tiny.png'))).toEqual(previous);
  expect(existsSync(output)).toBe(false);
});

test.each(['ENOENT', 'EIO', 'EXDEV', 'ENOTEMPTY'])('does not retry unexpected %s errors', async code => {
  let attempts = 0;
  faults.rename = (from, to) => { if (publishing(from, to)) { attempts++; throw denied(code); } };
  expect((await buildProject(config)).ok).toBe(false);
  expect(attempts).toBe(1); expect(delay).not.toHaveBeenCalled();
  expect(readFileSync(join(output, 'tiny.png'))).toEqual(previous);
});

test('does not retry permission errors on other platforms', async () => {
  Object.defineProperty(process, 'platform', { value: 'linux' });
  let attempts = 0;
  faults.rename = (from, to) => { if (publishing(from, to)) { attempts++; throw denied('EPERM'); } };
  expect((await buildProject(config)).ok).toBe(false);
  expect(attempts).toBe(1); expect(delay).not.toHaveBeenCalled();
  expect(readFileSync(join(output, 'tiny.png'))).toEqual(previous);
});

test('foreign output remains rejected before any rename or retry', async () => {
  writeFileSync(join(output, 'personal-notes.txt'), 'keep');
  expect((await buildProject(config)).ok).toBe(false);
  expect(renameSync).not.toHaveBeenCalled(); expect(delay).not.toHaveBeenCalled();
  expect(readFileSync(join(output, 'personal-notes.txt'), 'utf8')).toBe('keep');
});
