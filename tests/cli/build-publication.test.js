import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, renameSync, realpathSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { buildProject } from '../../server/build/project-build.js';

const faults = vi.hoisted(() => ({ rename: null, write: null, platform: 'win32' }));
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, writeFileSync: vi.fn((path, ...args) => {
    const result = actual.writeFileSync(path, ...args);
    faults.write?.(path, actual.writeFileSync);
    return result;
  }), renameSync: vi.fn((from, to) => {
    // Simulate retry platform only at the publication fault boundary, after
    // source/process identity fences. Builds retain the actual startup platform.
    if (faults.rename) Object.defineProperty(process, 'platform', { value: faults.platform });
    faults.rename?.(from, to);
    return actual.renameSync(from, to);
  }) };
});
vi.mock('node:timers/promises', async importOriginal => ({
  ...await importOriginal(), setTimeout: vi.fn(async () => {}),
}));

let dir, config, output, previous, previousManifest, originalPlatform;
const denied = code => Object.assign(new Error(`rename denied: ${code}`), { code });
const publishing = (from, to) => from.includes('.staging-') && !from.endsWith('.previous') && to === output;
const outputBytes = () => Object.fromEntries(readdirSync(output).sort().map(file => [file, readFileSync(join(output, file)).toString('hex')]));
beforeEach(async () => {
  originalPlatform = process.platform;
  faults.platform = 'win32';
  faults.rename = null;
  faults.write = null;
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'sprite-publication-')));
  output = join(dir, 'dist'); config = join(dir, 'sprite-project.json');
  writeFileSync(join(dir, 'ops.json'), JSON.stringify([
    { command: 'new', name: 'tiny', size: 16, rows: 1, cols: 1 },
    { command: 'draw', type: 'rect', cell: '0,0', name: 'body', x: 3, y: 3, w: 8, h: 8, color: '#29adff', filled: true },
  ]));
  writeFileSync(config, JSON.stringify({ version: 1, ops: 'ops.json', output: 'dist' }));
  expect((await buildProject(config)).ok).toBe(true);
  previous = readFileSync(join(output, 'tiny.png'));
  previousManifest = readFileSync(join(output, 'sprite-manifest.json'));
  vi.mocked(renameSync).mockClear(); vi.mocked(delay).mockClear();
});
afterEach(() => {
  faults.rename = null;
  faults.write = null;
  Object.defineProperty(process, 'platform', { value: originalPlatform });
  rmSync(dir, { recursive: true, force: true });
});

test('an unlisted final staged emission is refused before replacing the previous good output', async () => {
  const before = outputBytes();
  let injected = false;
  faults.write = (path, writeOriginal) => {
    if (typeof path === 'string' && path.includes('.staging-') && path.endsWith('.agent-sprites-build.json')) {
      writeOriginal(join(dirname(path), 'unlisted-stage.bin'), 'unexpected final emission');
      injected = true;
    }
  };
  const result = await buildProject(config);
  expect(injected).toBe(true);
  expect(result.ok).toBe(false);
  expect(result.errors[0].message).toContain('inventory');
  expect(renameSync).not.toHaveBeenCalled();
  expect(outputBytes()).toEqual(before);
  expect(readdirSync(dir).some(name => /staging|previous|build-lock/.test(name))).toBe(false);
});

test('a legal font name colliding with the proof artifact is refused before publication', async () => {
  const before = outputBytes();
  writeFileSync(config, JSON.stringify({ version: 1, ui: { name: 'font-proof', kind: 'font', characters: 'A' }, output: 'dist', scale: 1 }));
  const result = await buildProject(config);
  expect(result.ok).toBe(false);
  expect(result.errors[0].message).toContain('unique portable basenames');
  expect(renameSync).not.toHaveBeenCalled();
  expect(outputBytes()).toEqual(before);
  expect(readdirSync(dir).some(name => /staging|previous|build-lock/.test(name))).toBe(false);
});

test('the existing verifier refuses the contact sheet collision and preserves previous output', async () => {
  const before = outputBytes();
  const operations = JSON.parse(readFileSync(join(dir, 'ops.json'), 'utf8'));
  operations[0].name = 'contact';
  writeFileSync(join(dir, 'ops.json'), JSON.stringify(operations));
  const result = await buildProject(config);
  expect(result.ok).toBe(false);
  expect(result.errors).toContainEqual(expect.objectContaining({ code: 'output-path' }));
  expect(renameSync).not.toHaveBeenCalled();
  expect(outputBytes()).toEqual(before);
});

test.each(['EPERM', 'EACCES', 'EBUSY'])('retries transient Windows %s when publishing verified output', async code => {
  let attempts = 0;
  let stagedManifest;
  faults.rename = (from, to) => {
    if (!publishing(from, to)) return;
    const manifest = JSON.parse(readFileSync(join(from, 'sprite-manifest.json'), 'utf8'));
    const emitted = readdirSync(from).filter(file => file !== 'sprite-manifest.json').sort();
    expect(Object.keys(manifest.integrity ?? {}).sort()).toEqual(emitted);
    for (const file of emitted) {
      const bytes = readFileSync(join(from, file));
      expect(manifest.integrity[file], file).toEqual({ bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    stagedManifest = readFileSync(join(from, 'sprite-manifest.json'));
    if (++attempts <= 2) throw denied(code);
  };
  const result = await buildProject(config);
  expect(result.errors).toEqual([]); expect(result.ok).toBe(true);
  expect(attempts).toBe(3);
  expect(vi.mocked(delay).mock.calls).toEqual([[50], [100]]);
  expect(readFileSync(join(output, 'tiny.png'))).toEqual(previous);
  expect(readFileSync(join(output, 'sprite-manifest.json'))).toEqual(stagedManifest);
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
  expect(readFileSync(join(output, 'sprite-manifest.json'))).toEqual(previousManifest);
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
  faults.platform = 'linux';
  let attempts = 0;
  faults.rename = (from, to) => { if (publishing(from, to)) { attempts++; throw denied('EPERM'); } };
  expect((await buildProject(config)).ok).toBe(false);
  expect(attempts).toBe(1); expect(delay).not.toHaveBeenCalled();
  expect(readFileSync(join(output, 'tiny.png'))).toEqual(previous);
});

test('foreign output remains rejected before any rename or retry', async () => {
  writeFileSync(join(output, 'personal-notes.txt'), 'keep');
  const before = outputBytes();
  expect((await buildProject(config)).ok).toBe(false);
  expect(renameSync).not.toHaveBeenCalled(); expect(delay).not.toHaveBeenCalled();
  expect(readFileSync(join(output, 'personal-notes.txt'), 'utf8')).toBe('keep');
  expect(outputBytes()).toEqual(before);
});
