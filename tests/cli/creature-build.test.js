import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProject } from '../../server/build/project-build.js';

let dir, path, config;
const write = () => writeFileSync(path, JSON.stringify(config));
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sprite-creature-build-'));
  path = join(dir, 'sprite-project.json');
  config = { version: 1, output: 'dist', scale: 4,
    creature: { name: 'hound', plan: 'quadruped', size: 'medium', palette: 'ash', features: ['glow_eyes', 'spikes'] },
    expectedTags: ['idle_front', 'walk_right', 'walk_left', 'attack_back', 'hurt_right', 'down'] };
  write();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('creature source publishes a verified sheet, atlas tags, a report and playback runtime, reproducibly', async () => {
  const result = await buildProject(path);
  expect(result.errors).toEqual([]);
  expect(result.ok).toBe(true);
  const report = JSON.parse(readFileSync(result.artifacts.creatureReport, 'utf8'));
  expect(report).toMatchObject({ version: 1, ok: true, kind: 'creature', plan: 'quadruped', cellSize: { width: 32, height: 24 }, groundAnchor: { x: 16, y: 24 } });
  expect(report.footprint.w).toBeGreaterThan(0);
  const atlas = JSON.parse(readFileSync(result.artifacts.atlas, 'utf8'));
  const tags = atlas.meta.frameTags.map(t => t.name);
  for (const tag of config.expectedTags) expect(tags).toContain(tag);
  expect(atlas.meta.frameTags.find(t => t.name === 'walk_right')).toMatchObject({ from: expect.any(Number) });
  const manifest = JSON.parse(readFileSync(result.artifacts.manifest, 'utf8'));
  expect(manifest).toMatchObject({ source: 'creature', kind: 'creature', report: 'creature-report.json' });
  expect(existsSync(result.artifacts.playbackRuntime)).toBe(true);
  const marker = JSON.parse(readFileSync(join(dir, 'dist', '.agent-sprites-build.json'), 'utf8'));
  expect(marker.files).toContain('creature-report.json');
  const previous = readFileSync(result.artifacts.sheet);
  expect((await buildProject(path)).ok).toBe(true);
  expect(readFileSync(result.artifacts.sheet)).toEqual(previous);
  config.expectedTags.push('fly_right'); write();
  expect((await buildProject(path)).ok).toBe(false);
  expect(readFileSync(result.artifacts.sheet)).toEqual(previous);
}, 30000);

test.each([['ops', 'missing.json'], ['generator', 'missing.mjs'], ['environment', { kind: 'terrain' }], ['ops', null]])('creature cannot be mixed with %s', async (source, value) => {
  config[source] = value; write();
  const result = await buildProject(path);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result.errors)).toMatch(/exactly one.*creature/);
  expect(existsSync(join(dir, 'dist'))).toBe(false);
});

test.each([[null], [[]], ['hound.json']])('creature source must be an inline object: %j', async value => {
  config.creature = value; write();
  const result = await buildProject(path);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result.errors)).toMatch(/creature.*object/i);
  expect(existsSync(join(dir, 'dist'))).toBe(false);
});

test('invalid creature recipes fail before anything is published', async () => {
  config.creature.features = ['stinger']; write();
  const result = await buildProject(path);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result.errors)).toMatch(/not available on the quadruped plan/);
  expect(existsSync(join(dir, 'dist'))).toBe(false);
});

test('trim works with creature builds', async () => {
  config.trim = true; write();
  const result = await buildProject(path);
  expect(result.errors).toEqual([]);
  expect(result.ok).toBe(true);
}, 30000);
