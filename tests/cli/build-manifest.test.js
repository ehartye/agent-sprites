import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildProject } from '../../server/build/project-build.js';

let dir, path;
const write = config => writeFileSync(path, JSON.stringify({ version: 1, output: 'dist', scale: 1, ...config }));
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sprite-manifest-')); path = join(dir, 'sprite-project.json'); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('recipe builds publish a portable manifest naming the recipe kind and every emitted file', async () => {
  write({ environment: { name: 'furnishings', kind: 'furniture', seed: 7 } });
  const result = await buildProject(path);
  expect(result.errors).toEqual([]);
  const manifest = JSON.parse(readFileSync(result.artifacts.manifest, 'utf8'));
  expect(manifest).toMatchObject({ format: 'agent-sprites-build-manifest', version: 1, name: 'furnishings', source: 'environment', kind: 'furniture', report: 'environment-report.json' });
  expect(manifest.files).toMatchObject({ sheet: 'furnishings.png', atlas: 'furnishings.atlas.json', environmentReport: 'environment-report.json' });
  // Relative names only: the manifest keeps working after the directory is copied.
  for (const file of Object.values(manifest.files)) expect(file).not.toMatch(/[\\/]/);
  expect(manifest.files.manifest).toBeUndefined();
  const moved = join(dir, 'public', 'furnishings');
  cpSync(join(dir, 'dist'), moved, { recursive: true });
  for (const file of Object.values(manifest.files)) expect(existsSync(join(moved, file))).toBe(true);
  const marker = JSON.parse(readFileSync(join(dir, 'dist', '.agent-sprites-build.json'), 'utf8'));
  expect(marker.files).toContain('sprite-manifest.json');
  // The ownership marker still permits an unchanged rebuild over its own output.
  expect((await buildProject(path)).ok).toBe(true);
}, 20000);

test('UI manifests list the runtime and font bootstrap', async () => {
  write({ ui: { name: 'ui-font', kind: 'font', characters: ' Ag' } });
  const result = await buildProject(path);
  expect(result.errors).toEqual([]);
  const manifest = JSON.parse(readFileSync(result.artifacts.manifest, 'utf8'));
  expect(manifest).toMatchObject({ source: 'ui', kind: 'font', report: 'ui-report.json' });
  expect(manifest.files).toMatchObject({ uiRuntime: 'ui-runtime.mjs', uiBoot: 'ui-boot.mjs' });
}, 20000);

test('operation builds have no recipe kind or report', async () => {
  writeFileSync(join(dir, 'ops.json'), JSON.stringify([{ command: 'new', name: 'dot', size: 8, rows: 1, cols: 1 }, { command: 'draw', type: 'point', cell: '0,0', name: 'p', x: 1, y: 1, color: '#ffffff' }]));
  write({ ops: 'ops.json' });
  const result = await buildProject(path);
  expect(result.errors).toEqual([]);
  const manifest = JSON.parse(readFileSync(result.artifacts.manifest, 'utf8'));
  expect(manifest).toMatchObject({ source: 'ops', name: 'dot' });
  expect(manifest).not.toHaveProperty('kind');
  expect(manifest).not.toHaveProperty('report');
});

test('build provenance records the tool version and declared generator inputs by content', async () => {
  writeFileSync(join(dir, 'palette.json'), '{"ink":"#112233"}');
  write({ ui: { name: 'font', kind: 'font', characters: 'A' }, inputs: ['palette.json'] });
  const result = await buildProject(path);
  expect(result.errors).toEqual([]);
  const manifest = JSON.parse(readFileSync(result.artifacts.manifest, 'utf8'));
  const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
  expect(manifest.build).toMatchObject({ tool: { name: 'agent-sprites', version } });
  expect(manifest.build.inputs.map(input => input.path)).toEqual(['sprite-project.json', 'palette.json']);
  for (const input of manifest.build.inputs) expect(input.sha256).toMatch(/^[a-f0-9]{64}$/);
});

test('a missing declared input fails before publication and preserves the previous build', async () => {
  write({ ui: { name: 'font', kind: 'font', characters: 'A' } });
  const good = await buildProject(path);
  const before = readFileSync(good.artifacts.manifest);
  write({ ui: { name: 'font', kind: 'font', characters: 'A' }, inputs: ['missing.json'] });
  const bad = await buildProject(path);
  expect(bad.ok).toBe(false);
  expect(JSON.stringify(bad.errors)).toContain('missing.json');
  expect(readFileSync(good.artifacts.manifest).equals(before)).toBe(true);
});

test.each([null, 'palette.json', [42], ['']])('rejects invalid declared inputs: %j', async inputs => {
  write({ ui: { name: 'font', kind: 'font', characters: 'A' }, inputs });
  const result = await buildProject(path);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result.errors)).toContain('inputs must be an array');
  expect(existsSync(join(dir, 'dist'))).toBe(false);
});

test('a generator that changes its declared input cannot publish misleading provenance', async () => {
  writeFileSync(join(dir, 'input.txt'), 'before');
  writeFileSync(join(dir, 'generate.mjs'), `import {writeFileSync} from 'node:fs';
    writeFileSync('input.txt', 'after');
    console.log(JSON.stringify([{command:'new',name:'dot',size:8,rows:1,cols:1}]));`);
  write({ generator: 'generate.mjs', inputs: ['input.txt'] });
  const result = await buildProject(path);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result.errors)).toContain('Build inputs changed during generation');
  expect(existsSync(join(dir, 'dist'))).toBe(false);
});

test('character and environment builds publish the portable playback runtime', async () => {
  write({ character: { people: [{ id: 'ada' }], mode: 'walk', directions: ['right'] } });
  const result = await buildProject(path);
  expect(result.errors).toEqual([]);
  expect(JSON.parse(readFileSync(result.artifacts.manifest, 'utf8')).files.playbackRuntime).toBe('playback-runtime.mjs');
  const runtime = await import(pathToFileURL(result.artifacts.playbackRuntime).href);
  const report = JSON.parse(readFileSync(result.artifacts.characterReport, 'utf8'));
  const walker = runtime.createWalker([report], { person: 'ada', outfit: 'casual', mode: 'authored-contact', facing: 'right' });
  expect(walker.update(1, 0).alias).toBe('ada_casual_right_walk_0');
  write({ environment: { name: 'f', kind: 'furniture' } });
  rmSync(join(dir, 'dist'), { recursive: true, force: true });
  expect((await buildProject(path)).artifacts.playbackRuntime).toMatch(/playback-runtime\.mjs$/);
}, 30000);
