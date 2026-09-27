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

test('organic terrain source exports every canonical neighborhood through the normal verified build',async()=>{
  config.environment={name:'paths',kind:'terrain-transition',variants:1,seed:7};
  config.expectedFrames=['path_0_0','path_5_0','path_7_0','path_255_0'];write();
  const result=await buildProject(path);expect(result.ok).toBe(true);expect(result.errors).toEqual([]);expect(result.warnings).toEqual([]);
  const report=JSON.parse(readFileSync(result.artifacts.environmentReport,'utf8'));
  expect(report.frames).toHaveLength(47);expect(report.neighbors.nw).toBe(128);
},20000);

test.each([[null], [[]], ['terrain.json']])('environment source must be an inline object: %j', async value => {
  config.environment=value;write();
  const result=await buildProject(path);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result.errors)).toMatch(/environment.*object/i);
  expect(existsSync(join(dir,'dist'))).toBe(false);
});

test.each(['cottage','workshop','kitchen','barn'])('styled %s habitat publishes verified layers and its geometry contract',async style=>{
  config.environment={name:`habitat-${style}`,kind:'habitat',style};
  config.expectedFrames=['habitat_floor','habitat_back','habitat_front','habitat_roof'];write();
  const result=await buildProject(path);expect(result.ok).toBe(true);expect(result.errors).toEqual([]);expect(result.warnings).toEqual([]);
  const report=JSON.parse(readFileSync(result.artifacts.environmentReport,'utf8'));
  expect(report.style).toBe(style);expect(report.layout.door).toEqual({x:136,y:220,w:48,h:36});
  const marker=JSON.parse(readFileSync(join(dir,'dist','.agent-sprites-build.json'),'utf8'));
  expect(marker.version).toBe(2);expect(marker.config).toBe('../sprite-project.json');
},20000);
