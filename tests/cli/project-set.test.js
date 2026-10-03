import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildProject } from '../../server/build/project-build.js';
import { buildProjectSet as buildSet } from '../../server/build/project-set.js';

const exec = promisify(execFile);
let dir, list, a, b;
function project(id, config = {}) {
  const root = join(dir, id); mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'ops.json'), JSON.stringify([
    { command: 'new', name: id, size: 8, rows: 1, cols: 1 },
    { command: 'draw', type: 'point', cell: '0,0', name: 'dot', x: 2, y: 2, color: '#ffffff' },
  ]));
  const path = join(root, 'sprite-project.json');
  writeFileSync(path, JSON.stringify({ version: 1, ops: 'ops.json', output: '../../out/' + id, scale: 1, ...config }));
  return path;
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sprite-set-'));
  // Keep both sources and outputs inside the disposable fixture.
  dir = join(dir, 'src'); mkdirSync(dir);
  a = project('a'); b = project('b'); list = join(dir, 'sprite-projects.json');
  writeFileSync(list, JSON.stringify({ version: 1, projects: ['a/sprite-project.json', 'b/sprite-project.json'] }));
});
afterEach(() => rmSync(join(dir, '..'), { recursive: true, force: true }));

test('builds every listed project in order and then reports both as current', async () => {
  const built = await buildSet(list);
  expect(built).toMatchObject({ ok: true, total: 2, attempted: 2, succeeded: 2, failed: 0 });
  expect(built.projects.map(p => p.status)).toEqual(['built', 'built']);
  const checked = await buildSet(list, { check: true });
  expect(checked).toMatchObject({ ok: true, mode: 'check', attempted: 0, stale: 0 });
  expect(checked.projects.map(p => p.status)).toEqual(['current', 'current']);
});

test('check reports unbuilt projects without creating outputs or executing generators', async () => {
  writeFileSync(join(dir, 'a', 'generate.mjs'), "import {writeFileSync} from 'node:fs'; writeFileSync('ran.txt','yes'); throw Error('must not run');");
  writeFileSync(a, JSON.stringify({ version: 1, generator: 'generate.mjs', output: '../../out/a' }));
  const report = await buildSet(list, { check: true });
  expect(report).toMatchObject({ ok: false, attempted: 0, stale: 2 });
  expect(report.projects[0].reasons.map(r => r.code)).toContain('unbuilt');
  expect(existsSync(join(dir, 'a', 'ran.txt'))).toBe(false);
  expect(existsSync(join(dir, '..', 'out'))).toBe(false);
});

test('check distinguishes changed source, old tool version and legacy provenance', async () => {
  await buildProject(a); const built = await buildProject(b);
  writeFileSync(join(dir, 'a', 'ops.json'), '[]');
  const path = built.artifacts.manifest, manifest = JSON.parse(readFileSync(path, 'utf8'));
  manifest.build.tool.version = '0.1.0'; writeFileSync(path, JSON.stringify(manifest));
  const report = await buildSet(list, { check: true });
  expect(report.stale).toBe(2);
  expect(report.projects[0].reasons.map(r => r.code)).toContain('input-changed');
  expect(report.projects[1].reasons.map(r => r.code)).toContain('tool-version');
  delete manifest.build; writeFileSync(path, JSON.stringify(manifest));
  expect((await buildSet(list, { check: true })).projects[1].reasons.map(r => r.code)).toContain('provenance-missing');
});

test('declared external inputs and missing output artifacts require a rebuild', async () => {
  writeFileSync(join(dir, 'palette.json'), 'old');
  project('a', { inputs: ['../palette.json'] });
  const built = await buildSet(list); expect(built.ok).toBe(true);
  writeFileSync(join(dir, 'palette.json'), 'new');
  rmSync(built.projects[1].artifacts.sheet);
  const checked = await buildSet(list, { check: true });
  expect(checked.projects[0].reasons).toContainEqual(expect.objectContaining({ code: 'input-changed', input: '../palette.json' }));
  expect(checked.projects[1].reasons.map(r => r.code)).toContain('output-missing');
  rmSync(join(dir, 'palette.json'));
  expect((await buildSet(list, { check: true })).projects[0].status).toBe('invalid');
});

test('a failed project stops the set, preserving its previous output and skipping later projects', async () => {
  const prior = await buildProject(a), bytes = readFileSync(prior.artifacts.sheet);
  writeFileSync(join(dir, 'a', 'ops.json'), '[]');
  const report = await buildSet(list);
  expect(report).toMatchObject({ ok: false, attempted: 1, succeeded: 0, failed: 1 });
  expect(report.projects.map(p => p.status)).toEqual(['failed', 'skipped']);
  expect(readFileSync(prior.artifacts.sheet).equals(bytes)).toBe(true);
  expect(existsSync(join(dir, '..', 'out', 'b'))).toBe(false);
});

test.each([
  { version: 1, projects: [] },
  { version: 2, projects: ['a/sprite-project.json'] },
  { version: 1, projects: ['a/sprite-project.json', 'a/../a/sprite-project.json'] },
  { version: 1, projects: ['a/sprite-project.json', 42] },
  { version: 1, projects: ['a/sprite-project.json', 'missing.json'] },
])('invalid project lists fail before any build: %j', async manifest => {
  writeFileSync(list, JSON.stringify(manifest));
  const report = await buildSet(list);
  expect(report).toMatchObject({ ok: false, attempted: 0 });
  expect(report.errors.length).toBeGreaterThan(0);
  expect(existsSync(join(dir, '..', 'out'))).toBe(false);
});

test.each(['../../out/a', '../../out/a/nested', '../a'])('overlapping outputs or source directories fail before publication: %s', async output => {
  project('b', { output });
  const report = await buildSet(list);
  expect(report).toMatchObject({ ok: false, attempted: 0 });
  expect(report.errors.length).toBeGreaterThan(0);
  expect(existsSync(join(dir, '..', 'out'))).toBe(false);
});

test('relative provenance survives relocating the full project tree', async () => {
  expect((await buildSet(list)).ok).toBe(true);
  const moved = join(tmpdir(), 'sprite-set-moved-' + Date.now());
  try {
    cpSync(join(dir, '..'), moved, { recursive: true });
    expect((await buildSet(join(moved, 'src', 'sprite-projects.json'), { check: true })).ok).toBe(true);
  } finally { rmSync(moved, { recursive: true, force: true }); }
});

test('check identifies malformed mixed source declarations as invalid', async () => {
  project('a', { character: null });
  const report = await buildSet(list, { check: true });
  expect(report.projects[0].status).toBe('invalid');
  expect(report.projects[0].reasons[0].message).toContain('exactly one');
});

test('check rejects a manifest that omits a required artifact entry', async () => {
  const built = await buildSet(list);
  const path = built.projects[0].artifacts.manifest, manifest = JSON.parse(readFileSync(path, 'utf8'));
  delete manifest.files.sheet; writeFileSync(path, JSON.stringify(manifest));
  const report = await buildSet(list, { check: true });
  expect(report.projects[0].status).toBe('stale');
  expect(report.projects[0].reasons.map(reason => reason.code)).toContain('manifest-invalid');
});

test('CLI JSON checks fail on stale sets, then build and check succeed without a sprite server', async () => {
  const cli = fileURLToPath(new URL('../../scripts/sprite.js', import.meta.url));
  const options = { cwd: dir, env: { ...process.env, SPRITE_PORT: '1' } };
  try {
    await exec(process.execPath, [cli, 'build-set', list, '--check', '--json'], options);
    throw Error('Expected stale exit status');
  } catch (error) {
    expect(error.code).toBe(1);
    expect(JSON.parse(error.stdout)).toMatchObject({ ok: false, stale: 2 });
  }
  const built = JSON.parse((await exec(process.execPath, [cli, 'build-set', list, '--json'], options)).stdout);
  expect(built).toMatchObject({ ok: true, succeeded: 2 });
  expect(JSON.parse((await exec(process.execPath, [cli, 'build-set', list, '--check', '--json'], options)).stdout).ok).toBe(true);
}, 20000);
