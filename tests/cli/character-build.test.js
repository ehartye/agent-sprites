import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProject } from '../../server/build/project-build.js';
import { Project } from '../../server/engine/project.js';

let dir, configPath, config;
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const writeConfig = () => writeFileSync(configPath, JSON.stringify(config));
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sprite-character-build-'));
  configPath = join(dir, 'sprite-project.json');
  config = {
    version: 1, output: 'dist', scale: 1,
    character: {
      name: 'community', mode: 'idle', fps: 10,
      people: [
        { id: 'mara', body: 'adult-sturdy', hair: 'bun', skin: 'umber' },
        { id: 'child', body: 'child', hair: 'puffs', skin: 'umber' },
      ],
      outfits: ['casual', 'field'], directions: ['down'],
    },
    expectedFrames: ['mara_casual_down_idle', 'mara_field_down_idle', 'child_casual_down_idle', 'child_field_down_idle'],
  };
  writeConfig();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('inline character recipe publishes editable cast, required aliases and owned anatomical report', async () => {
  const result = await buildProject(configPath);
  expect(result.errors).toEqual([]);
  expect(result.ok).toBe(true);
  expect(result.artifacts.characterReport).toBe(join(dir, 'dist', 'character-report.json'));
  for (const path of Object.values(result.artifacts)) expect(existsSync(path)).toBe(true);
  const atlas = readJson(result.artifacts.atlas);
  expect(atlas.frames.map(frame => frame.filename)).toEqual(expect.arrayContaining(config.expectedFrames));
  expect(atlas.frames.every(frame => frame.sourceSize.w === 40 && frame.sourceSize.h === 56)).toBe(true);
  const project = Project.load(result.artifacts.project);
  expect(project.cellWidth).toBe(40);
  expect(project.cellHeight).toBe(56);
  const report = readJson(result.artifacts.characterReport);
  expect(report.ok).toBe(true);
  expect(report.frames).toHaveLength(4);
  expect(readJson(join(dir, 'dist', '.agent-sprites-build.json')).files).toContain('character-report.json');
  expect(readJson(result.artifacts.operations)[0]).toMatchObject({ command: 'new', name: 'community' });
  const previous = readFileSync(result.artifacts.sheet);
  expect((await buildProject(configPath)).ok).toBe(true);
  expect(readFileSync(result.artifacts.sheet)).toEqual(previous);
}, 20000);

test('walk recipes export eight-frame animation tags and preserve timing', async () => {
  config.character.mode = 'walk';
  config.character.people = [config.character.people[0]];
  config.character.outfits = ['field'];
  config.expectedFrames = Array.from({ length: 8 }, (_, i) => `mara_field_down_walk_${i}`);
  config.expectedTags = ['mara_field_down_walk'];
  writeConfig();
  const result = await buildProject(configPath);
  expect(result.errors).toEqual([]);
  expect(result.ok).toBe(true);
  const atlas = readJson(result.artifacts.atlas);
  const tag = atlas.meta.frameTags.find(tag => tag.name === 'mara_field_down_walk');
  expect(tag.to - tag.from + 1).toBe(8);
  expect(atlas.frames.slice(tag.from, tag.to + 1).every(frame => frame.duration === 100)).toBe(true);
  expect(readJson(result.artifacts.characterReport).frames).toHaveLength(8);
}, 20000);

test('nonhuman recipe publishes four-arm joints and distinct clothing states through the managed build pipeline', async () => {
  config.character.people=[{id:'vey',head:'insectoid',arms:4,body:'rangy',equipment:'survey-rig'}];
  config.character.outfits=['wayfarer','phase-suit'];
  config.character.directions=['down','right'];
  config.expectedFrames=['vey_wayfarer_down_idle','vey_wayfarer_right_idle','vey_phase-suit_down_idle','vey_phase-suit_right_idle'];
  writeConfig();
  const result=await buildProject(configPath);expect(result.errors).toEqual([]);expect(result.ok).toBe(true);
  const report=readJson(result.artifacts.characterReport);
  expect(report.frames.map(f=>f.sealed)).toEqual([false,false,true,true]);
  expect(report.frames.every(f=>f.headKind==='insectoid'&&f.arms.length===4)).toBe(true);
  expect(readJson(result.artifacts.operations).some(op=>op.command==='shape-group'&&op.name==='left_lower_arm')).toBe(true);
},20000);

test('required aliases are verified before replacing character output', async () => {
  const first = await buildProject(configPath);
  expect(first.ok).toBe(true);
  const previous = readFileSync(first.artifacts.atlas);
  config.expectedFrames.push('missing_character_idle');
  writeConfig();
  const result = await buildProject(configPath);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result.errors)).toContain('Required frame is missing: missing_character_idle');
  expect(readFileSync(first.artifacts.atlas)).toEqual(previous);
}, 20000);

test.each([
  ['ops', 'does-not-exist.json'], ['generator', 'does-not-exist.json'],
  ['ops', null], ['generator', ''],
])('rejects character mixed with %s=%j before reading that source', async (source, value) => {
  config[source] = value;
  writeConfig();
  const result = await buildProject(configPath);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result.errors)).toMatch(/exactly one.*character/);
  expect(existsSync(join(dir, 'dist'))).toBe(false);
});

test('character output cannot contain its inline source configuration', async () => {
  config.output = '.';
  writeConfig();
  const result = await buildProject(configPath);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result.errors)).toContain('Output cannot contain the config or source files');
  expect(readJson(configPath)).toEqual(config);
});

test.each([[null], [[]], ['character.json']])('rejects non-object character source %j', async character => {
  config.character = character;
  writeConfig();
  const result = await buildProject(configPath);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result.errors)).toMatch(/character.*object/i);
  expect(existsSync(join(dir, 'dist'))).toBe(false);
});

test('invalid character configuration preserves every previously published artifact', async () => {
  const first = await buildProject(configPath);
  expect(first.ok).toBe(true);
  const output = join(dir, 'dist');
  const previous = Object.fromEntries(readdirSync(output).map(file => [file, readFileSync(join(output, file))]));
  config.character.people[1].body = 'unsupported-body';
  writeConfig();
  const result = await buildProject(configPath);
  expect(result.ok).toBe(false);
  expect(result.artifacts).toEqual({});
  expect(readdirSync(output).sort()).toEqual(Object.keys(previous).sort());
  for (const [file, contents] of Object.entries(previous)) expect(readFileSync(join(output, file))).toEqual(contents);
  expect(readdirSync(dir).some(file => /staging|previous|build-lock/.test(file))).toBe(false);
}, 20000);
