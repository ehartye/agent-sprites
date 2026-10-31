// @subject scripts/sprite.js
// @subject server/build/ui-software.mjs
import { test, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
const exec = promisify(execFile);
// Anchored to this file, not the process working directory.
const repo = fileURLToPath(new URL('../../', import.meta.url));
const stems = ['ui-runtime', 'ui-action-group', 'ui-theme', 'ui-components', 'ui-layout', 'ui-interaction', 'ui-phaser-runtime', 'ui-index'];
const owned = stems.flatMap(stem => [`${stem}.mjs`, `${stem}.d.mts`]);
const manifest = 'ui-software-manifest.json';
let dir, out;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sprite-ui-export-')); out = join(dir, 'runtime'); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));
// Resolves with the exit code instead of rejecting, so each case can assert on failures.
const cli = (...args) => exec(process.execPath, [join(repo, 'scripts', 'sprite.js'), ...args], {
  env: { ...process.env, SPRITE_PORT: '1' }, windowsHide: true, timeout: 20000,
}).then(({ stdout, stderr }) => ({ code: 0, stdout, stderr }), error => ({ code: error.code, stdout: error.stdout, stderr: error.stderr }));

test('export writes the 16 files plus the manifest in LF and verify then passes', async () => {
  const result = await cli('ui-runtime-export', '--out', out);
  expect(result.code, result.stderr).toBe(0);
  expect(readdirSync(out).sort()).toEqual([...owned, manifest].sort());
  expect(owned).toHaveLength(16);
  for (const name of [...owned, manifest]) expect(readFileSync(join(out, name)).includes(13), `${name} has no CR`).toBe(false);
  const verified = await cli('ui-runtime-export', '--out', out, '--verify');
  expect(verified.code, verified.stdout + verified.stderr).toBe(0);
});

test('verify is read-only and names the one file that differs, and a deleted one as missing', async () => {
  expect((await cli('ui-runtime-export', '--out', out)).code).toBe(0);
  const target = join(out, 'ui-theme.mjs'), bytes = readFileSync(target);
  const changed = Buffer.from(bytes); changed[0] ^= 1; writeFileSync(target, changed);
  const differs = await cli('ui-runtime-export', '--out', out, '--verify');
  expect(differs.code).not.toBe(0);
  expect(differs.stdout).toContain('ui-theme.mjs');
  expect(readFileSync(target).equals(changed), 'verify rewrote nothing').toBe(true);
  writeFileSync(target, bytes); rmSync(join(out, 'ui-index.d.mts'));
  const missing = await cli('ui-runtime-export', '--out', out, '--verify', '--json');
  expect(missing.code).not.toBe(0);
  expect(JSON.parse(missing.stdout)).toMatchObject({ ok: false, missing: ['ui-index.d.mts'], differing: [] });
  expect(existsSync(join(out, 'ui-index.d.mts')), 'verify did not restore it').toBe(false);
});

test('a second export into the same directory refuses and leaves the files untouched', async () => {
  expect((await cli('ui-runtime-export', '--out', out)).code).toBe(0);
  const before = readFileSync(join(out, manifest));
  const again = await cli('ui-runtime-export', '--out', out);
  expect(again.code).not.toBe(0);
  expect(again.stderr).toMatch(/already holds/);
  expect(readFileSync(join(out, manifest)).equals(before)).toBe(true);
});

test('an unrelated file in the directory is not a collision, a same-named file is', async () => {
  const { mkdirSync } = await import('node:fs');
  mkdirSync(out); writeFileSync(join(out, 'notes.txt'), 'keep');
  expect((await cli('ui-runtime-export', '--out', out)).code).toBe(0);
  expect(readFileSync(join(out, 'notes.txt'), 'utf8')).toBe('keep');
  const other = join(dir, 'other'); mkdirSync(other); writeFileSync(join(other, 'ui-layout.mjs'), 'mine');
  const clash = await cli('ui-runtime-export', '--out', other);
  expect(clash.code).not.toBe(0);
  expect(readFileSync(join(other, 'ui-layout.mjs'), 'utf8')).toBe('mine');
  expect(existsSync(join(other, manifest))).toBe(false);
});

test('usage errors exit non-zero and help lists the command', async () => {
  const noOut = await cli('ui-runtime-export');
  expect(noOut.code).not.toBe(0);
  expect(noOut.stderr).toMatch(/Usage: agent-sprites ui-runtime-export --out/);
  expect((await cli('ui-runtime-export', '--out', out, '--bogus')).code).not.toBe(0);
  expect((await cli('ui-runtime-export', 'stray', '--out', out)).code).not.toBe(0);
  const missingDir = await cli('ui-runtime-export', '--out', join(dir, 'never'), '--verify');
  expect(missingDir.code).not.toBe(0);
  expect(existsSync(join(dir, 'never')), 'verify never creates the directory').toBe(false);
  expect((await cli('--help')).stdout).toContain('ui-runtime-export');
});
