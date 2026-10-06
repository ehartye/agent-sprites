import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProject } from '../../server/build/project-build.js';

let dir, path, config;
const write = () => writeFileSync(path, JSON.stringify(config));
const tags = ['walk', 'swing', 'water', 'hurt', 'down'].flatMap(a => ['front', 'right', 'back', 'left'].map(d => `${a}_${d}`)).concat('down');
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sprite-native-build-'));
  path = join(dir, 'sprite-project.json');
  config = { version: 1, output: 'dist', scale: 1, native: { name: 'wanderer', preset: 'scavenger-rags' }, expectedFrames: ['front', 'right_swing_3', 'left_water_0', 'back_hurt', 'front_down'], expectedTags: tags };
  write();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('a native source builds from JSON alone: sheet, atlas tags, character report, runtime and portable ownership', async () => {
  const result = await buildProject(path);
  expect(result.errors).toEqual([]);
  expect(result.ok).toBe(true);
  expect(existsSync(join(dir, 'wanderer.png'))).toBe(false);
  const manifest = JSON.parse(readFileSync(result.artifacts.manifest, 'utf8'));
  expect(manifest).toMatchObject({ name: 'wanderer', source: 'native', kind: 'character', report: 'character-report.json' });
  expect(manifest.files.playbackRuntime).toBe('playback-runtime.mjs');
  const report = JSON.parse(readFileSync(result.artifacts.characterReport, 'utf8'));
  expect(report).toMatchObject({ kind: 'character', system: 'native', cellSize: { width: 16, height: 32 }, ground: 29 });
  expect(report.frames).toHaveLength(60);
  const atlas = JSON.parse(readFileSync(result.artifacts.atlas, 'utf8'));
  const names = atlas.meta.frameTags.map(t => t.name);
  for (const tag of tags) expect(names).toContain(tag);
  const swing = atlas.meta.frameTags.find(t => t.name === 'swing_right');
  expect(swing.to - swing.from).toBe(3);
  expect(atlas.meta.size).toEqual({ w: 240, h: 128 });
  const marker = JSON.parse(readFileSync(join(dir, 'dist', '.agent-sprites-build.json'), 'utf8'));
  expect(marker.files).toContain('character-report.json');
  expect(marker.config).toBe('../sprite-project.json');
  expect(manifest.build.inputs.map(i => i.path)).toEqual(['sprite-project.json']);
  const previous = readFileSync(result.artifacts.sheet);
  expect((await buildProject(path)).ok).toBe(true);
  expect(readFileSync(result.artifacts.sheet)).toEqual(previous);
}, 30000);

test('a bad native source fails the build with the recipe error and keeps prior output', async () => {
  const first = await buildProject(path);
  expect(first.ok).toBe(true);
  const previous = readFileSync(first.artifacts.sheet);
  config.native.motifs = ['not-a-motif'];
  write();
  const result = await buildProject(path);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result.errors)).toMatch(/Unknown wasteland motif/);
  expect(readFileSync(first.artifacts.sheet)).toEqual(previous);
}, 30000);

test.each([['ops', 'missing.json'], ['generator', 'missing.mjs'], ['environment', { name: 'e', kind: 'terrain' }], ['character', { people: [{ id: 'x' }] }]])('native cannot be mixed with %s', async (source, value) => {
  config[source] = value;
  write();
  const result = await buildProject(path);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result.errors)).toMatch(/exactly one.*native/);
  expect(existsSync(join(dir, 'dist'))).toBe(false);
});

test.each([[null], [[]], ['wanderer.json']])('native source must be an inline object: %j', async value => {
  config.native = value;
  write();
  const result = await buildProject(path);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result.errors)).toMatch(/native.*object/i);
  expect(existsSync(join(dir, 'dist'))).toBe(false);
});

test('omit ships only the runtime files and the build stays current for build-set --check', async () => {
  const { buildProjectSet } = await import('../../server/build/project-set.js');
  config.omit = ['project', 'operations', 'preview', 'contactSheet'];
  config.native = { name: 'wanderer', wig: 'short', motifs: ['scarf'] };
  config.expectedFrames = ['front']; config.expectedTags = ['walk_front'];
  write();
  const result = await buildProject(path);
  expect(result.errors).toEqual([]);
  expect(Object.keys(result.artifacts).sort()).toEqual(['atlas', 'characterReport', 'manifest', 'playbackRuntime', 'sheet', 'verification']);
  const marker = JSON.parse(readFileSync(join(dir, 'dist', '.agent-sprites-build.json'), 'utf8'));
  expect(marker.files.sort()).toEqual(['character-report.json', 'playback-runtime.mjs', 'sprite-manifest.json', 'verification.json', 'wanderer.atlas.json', 'wanderer.png']);
  writeFileSync(join(dir, 'projects.json'), JSON.stringify({ version: 1, projects: ['sprite-project.json'] }));
  const check = await buildProjectSet(join(dir, 'projects.json'), { check: true });
  expect(check.projects[0].status).toBe('current');
}, 30000);
