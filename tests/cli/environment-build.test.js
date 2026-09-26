import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProject } from '../../server/build/project-build.js';

let dir, path, config;
const write = () => writeFileSync(path, JSON.stringify(config));
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sprite-environment-build-'));
  path = join(dir, 'sprite-project.json');
  config = {version:1, output:'dist', scale:1,
    environment:{name:'terrain', kind:'terrain', materials:['moss'], variants:2, seed:7},
    expectedFrames:['moss_0','moss_1']};
  write();
});
afterEach(() => rmSync(dir, {recursive:true, force:true}));

test('environment source publishes reproducible pixels, editable shapes and an owned geometry report', async () => {
  const result = await buildProject(path);
  expect(result.errors).toEqual([]);
  expect(result.ok).toBe(true);
  const report = JSON.parse(readFileSync(result.artifacts.environmentReport, 'utf8'));
  expect(report).toMatchObject({version:1, ok:true, kind:'terrain', cellSize:{width:32,height:32}});
  expect(report.frames.map(f => f.alias)).toEqual(['moss_0','moss_1']);
  const marker = JSON.parse(readFileSync(join(dir,'dist','.agent-sprites-build.json'),'utf8'));
  expect(marker.files).toContain('environment-report.json');
  const ops = JSON.parse(readFileSync(result.artifacts.operations,'utf8'));
  expect(ops.some(op => op.command==='draw' && typeof op.name==='string')).toBe(true);
  const previous = readFileSync(result.artifacts.sheet);
  expect((await buildProject(path)).ok).toBe(true);
  expect(readFileSync(result.artifacts.sheet)).toEqual(previous);
  config.expectedFrames.push('missing_tile');write();
  expect((await buildProject(path)).ok).toBe(false);
  expect(readFileSync(result.artifacts.sheet)).toEqual(previous);
},20000);

test.each([['ops','missing.json'],['generator','missing.mjs'],['character',{people:[{id:'x'}]}],['ops',null]])('environment cannot be mixed with %s', async (source,value) => {
  config[source]=value;write();
  const result=await buildProject(path);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result.errors)).toMatch(/exactly one.*environment/);
  expect(existsSync(join(dir,'dist'))).toBe(false);
});

test.each([[null], [[]], ['terrain.json']])('environment source must be an inline object: %j', async value => {
  config.environment=value;write();
  const result=await buildProject(path);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result.errors)).toMatch(/environment.*object/i);
  expect(existsSync(join(dir,'dist'))).toBe(false);
});
