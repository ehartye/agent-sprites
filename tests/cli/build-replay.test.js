import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProject } from '../../server/build/project-build.js';
import { Project } from '../../server/engine/project.js';
import { renderConstructionReplay } from '../../server/engine/construction-replay.js';

let dir, config, operations;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const write = extra => {
  writeFileSync(join(dir,'ops.json'), JSON.stringify(operations, null, 2));
  writeFileSync(config,JSON.stringify({version:1,output:'dist',ops:'ops.json',scale:1,...extra}));
};
beforeEach(() => {
  dir=mkdtempSync(join(tmpdir(),'sprites-replay-')); config=join(dir,'sprite-project.json');
  operations=[{command:'new',name:'detail',size:8,rows:1,cols:1},
    {command:'draw',type:'point',cell:'0,0',name:'eye',x:2,y:3,color:'#ffffff',replay:{label:'Place eye',source:{path:'ops.json',line:1,column:1}}},
    {command:'move',cell:'0,0',shape:'eye',dx:1,dy:0}];
});
afterEach(()=>rmSync(dir,{recursive:true,force:true}));

test('traced builds publish hashed immutable construction evidence without changing final atlas pixels', async()=>{
  write({}); const normal=await buildProject(config); expect(normal.errors).toEqual([]);
  expect(normal.artifacts).not.toHaveProperty('constructionReplay');
  expect(Project.load(normal.artifacts.project).toJSON()).not.toHaveProperty('constructionReplay');
  const png=readFileSync(normal.artifacts.sheet);
  write({replay:{cells:['0,0'],maxSteps:16}});
  const result=await buildProject(config); expect(result.errors).toEqual([]);
  expect(result.artifacts.constructionReplay).toBe(join(dir,'dist','construction-replay.json'));
  expect(readFileSync(result.artifacts.sheet).equals(png)).toBe(true);
  expect(JSON.parse(readFileSync(result.artifacts.operations,'utf8'))).toEqual(operations);
  const trace=JSON.parse(readFileSync(result.artifacts.constructionReplay,'utf8'));
  expect(trace.records).toHaveLength(3);
  expect(trace.records[1]).toMatchObject({operationIndex:1,label:'Place eye',source:{path:'ops.json',pointer:'/1',line:1,column:1,sha256:sha(readFileSync(join(dir,'ops.json')))}});
  const restored=Project.load(result.artifacts.project);
  expect(restored.constructionReplay).toEqual(trace);
  expect(renderConstructionReplay(restored,{cell:'0,0',step:trace.records.length-1}).images.after.equals(png)).toBe(true);
  const manifest=JSON.parse(readFileSync(result.artifacts.manifest,'utf8'));
  const bytes=readFileSync(result.artifacts.constructionReplay);
  expect(manifest.files.constructionReplay).toBe('construction-replay.json');
  expect(manifest.integrity['construction-replay.json']).toEqual({bytes:bytes.length,sha256:sha(bytes)});
});

test('trace overflow and invalid source positions fail before publication preserving the prior build',async()=>{
  write({}); const good=await buildProject(config); expect(good.ok).toBe(true);
  const before=readFileSync(good.artifacts.manifest);
  for(const changes of [
    {replay:{cells:['0,0'],maxSteps:2}},
    {replay:{cells:Array.from({length:17},(_,i)=>`0,${i}`)}},
  ]) {
    write(changes);const bad=await buildProject(config);expect(bad.ok).toBe(false);expect(JSON.stringify(bad.errors)).toMatch(/replay/i);
    expect(readFileSync(good.artifacts.manifest).equals(before)).toBe(true);
  }
  for(const source of [{path:'undeclared.js',line:1,column:1},{path:'ops.json',line:999,column:1},{path:'ops.json',line:1,column:99},{path:'ops.json',line:1,column:2},{path:'ops.json',line:0,column:1}]) {
    operations[1].replay.source=source;write({replay:{cells:['0,0']}});
    const bad=await buildProject(config);expect(bad.ok).toBe(false);expect(JSON.stringify(bad.errors)).toMatch(/source/i);
  }
  expect(readFileSync(good.artifacts.manifest).equals(before)).toBe(true);
});

test('generator identities use declared generator hashes and expanded indices',async()=>{
  delete operations[1].replay;
  const script=`console.log(JSON.stringify(${JSON.stringify(operations)}));`;
  writeFileSync(join(dir,'generate.mjs'),script);
  writeFileSync(config,JSON.stringify({version:1,output:'dist',generator:'generate.mjs',scale:1,replay:{cells:['0,0']}}));
  const result=await buildProject(config);expect(result.errors).toEqual([]);
  const trace=JSON.parse(readFileSync(result.artifacts.constructionReplay,'utf8'));
  expect(trace.records[2].source).toEqual({kind:'generator',path:'generate.mjs',sha256:sha(script),expandedOperationIndex:2});
  expect(trace.operationsSha256).toBe(sha(JSON.stringify(operations)));
  expect(existsSync(result.artifacts.constructionReplay)).toBe(true);
});

test('inline recipes identify their hashed config declaration',async()=>{
  writeFileSync(config,JSON.stringify({version:1,output:'dist',ui:{name:'font',kind:'font',characters:'A'},scale:1,replay:{cells:['0,0']}}));
  const result=await buildProject(config);expect(result.errors).toEqual([]);
  const trace=JSON.parse(readFileSync(result.artifacts.constructionReplay,'utf8'));
  expect(trace.records[0].source).toEqual({kind:'recipe',path:'sprite-project.json',pointer:'/ui',sha256:sha(readFileSync(config))});
});
