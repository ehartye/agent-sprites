import {test,expect,beforeEach,afterEach} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {buildProject} from '../../server/build/project-build.js';
import {generateTilesetRecipe,parseTilesetSource} from '../../server/authoring/tileset.js';

let dir,path,config;
const palette='@palette\ng #6b7d3a #2f3d22\ny #e0b84a\nr #b5532f #5e2a1f\nx #ff00ff\n';
const row=(w,ch='g')=>ch.repeat(w);
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'sprite-tileset-'));path=join(dir,'sprite-project.json');config={version:1,output:'dist',scale:1,tileset:{name:'demo',cell:16,columns:4,sources:['a.pxl']}};});
afterEach(()=>rmSync(dir,{recursive:true,force:true}));
const write=text=>{writeFileSync(path,JSON.stringify(config));writeFileSync(join(dir,'a.pxl'),text);};
const sheet=async result=>{const {data,info}=await sharp(result.artifacts.sheet).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {data,width:info.width};};
const px=(png,x,y)=>{const i=(y*png.width+x)*4;return [...png.data.slice(i,i+4)];};

test('publishes a regular grid whose frame index is the row-major cell, with a name-to-index report',async()=>{
  write(`${palette}@tile one\n${[row(16),...Array(15).fill('.'.repeat(16))].join('\n')}\n@tile two x=2 y=3 w=2 rows=1\nyy\n@copy three two\n`);
  const result=await buildProject(path);expect(result.errors).toEqual([]);expect(result.ok).toBe(true);
  const report=JSON.parse(readFileSync(result.artifacts.tilesetReport));
  expect(report.kind).toBe('tileset');expect(report.index).toEqual({one:0,two:1,three:2});expect(report.columns).toBe(4);expect(report.rows).toBe(1);
  const atlas=JSON.parse(readFileSync(result.artifacts.atlas));
  for(const [name,index] of Object.entries(report.index)){const f=atlas.frames.find(x=>x.filename===name);expect(f.frame).toMatchObject({x:index*16,y:0,w:16,h:16});}
  const png=await sheet(result);expect(png.width).toBe(64);expect(px(png,0,0)).toEqual([0x6b,0x7d,0x3a,255]);expect(px(png,16+2,3)).toEqual([0xe0,0xb8,0x4a,255]);expect(px(png,16+1,3)[3]).toBe(0);
  expect(px(png,32+2,3)).toEqual([0xe0,0xb8,0x4a,255]);
  const manifest=JSON.parse(readFileSync(result.artifacts.manifest));expect(manifest.source).toBe('tileset');expect(manifest.report).toBe('tileset-report.json');
});

test('tracks pxl sources as inputs and rebuilds deterministically',async()=>{
  write(`${palette}@tile one\n${Array(16).fill(row(16)).join('\n')}\n`);
  const a=await buildProject(path);expect(a.ok).toBe(true);
  const manifest=JSON.parse(readFileSync(a.artifacts.manifest));expect(manifest.build.inputs.map(i=>i.path)).toContain('a.pxl');
  const first=readFileSync(a.artifacts.sheet);expect((await buildProject(path)).ok).toBe(true);expect(readFileSync(a.artifacts.sheet)).toEqual(first);
});

test('pads the last grid row without warning about the padding cells',async()=>{
  write(`${palette}@tile one\n${Array(16).fill(row(16)).join('\n')}\n@tile two\n${Array(16).fill(row(16)).join('\n')}\n`);
  const result=await buildProject(path);expect(result.ok).toBe(true);expect(result.warnings).toEqual([]);
  expect(JSON.parse(readFileSync(result.artifacts.tilesetReport)).paddingCells).toBe(2);
});

test('selective outline uses a darker palette step and leaves the cell edge open',async()=>{
  write(`${palette}@tile blob outline x=5 y=5 w=2 rows=2\ngg\ngg\n`);
  const result=await buildProject(path);const png=await sheet(result);
  expect(px(png,4,5)).toEqual([0x2f,0x3d,0x22,255]);expect(px(png,5,4)).toEqual([0x2f,0x3d,0x22,255]);expect(px(png,7,6)).toEqual([0x2f,0x3d,0x22,255]);expect(px(png,3,5)[3]).toBe(0);
});

test('recolor swaps palette characters and template tiles never reach the sheet',async()=>{
  write(`${palette}@tile tpl template x=0 y=0 w=2 rows=1\nxg\n@recolor shiny tpl x=y\n@recolor rusty tpl x=r\n`);
  const result=await buildProject(path);expect(result.ok).toBe(true);
  expect(JSON.parse(readFileSync(result.artifacts.tilesetReport)).index).toEqual({shiny:0,rusty:1});
  const png=await sheet(result);expect(px(png,0,0)).toEqual([0xe0,0xb8,0x4a,255]);expect(px(png,16,0)).toEqual([0xb5,0x53,0x2f,255]);expect(px(png,1,0)).toEqual([0x6b,0x7d,0x3a,255]);
});

test('animations become cell groups with a tag per name',async()=>{
  write(`${palette}@anim flame fps=4 x=0 y=0 w=1 rows=1\ng\n---\ny\n---\nr\n`);
  const result=await buildProject(path);expect(result.ok).toBe(true);
  const atlas=JSON.parse(readFileSync(result.artifacts.atlas));expect(atlas.meta.frameTags).toEqual([expect.objectContaining({name:'flame',direction:'forward'})]);
  expect(atlas.frames.find(f=>f.filename==='flame_2')).toBeTruthy();
  expect(JSON.parse(readFileSync(result.artifacts.tilesetReport)).animations.flame).toEqual({fps:4,frames:[0,1,2]});
});

test('omit leaves out the bulky review and editable artifacts and still publishes a marker',async()=>{
  config.omit=['project','operations','preview','contactSheet'];
  write(`${palette}@tile one\n${Array(16).fill(row(16)).join('\n')}\n`);
  const result=await buildProject(path);expect(result.ok).toBe(true);
  expect(readdirSync(join(dir,'dist')).sort()).toEqual(['.agent-sprites-build.json','demo.atlas.json','demo.png','sprite-manifest.json','tileset-report.json','verification.json']);
  const manifest=JSON.parse(readFileSync(result.artifacts.manifest));expect(manifest.files.project).toBeUndefined();
  config.omit=['sheet'];write(`${palette}@tile one\n${Array(16).fill(row(16)).join('\n')}\n`);expect((await buildProject(path)).ok).toBe(false);
});

test.each([
  ['a row of the wrong width',`${palette}@tile one\n${Array(16).fill(row(15)).join('\n')}\n`,/a\.pxl:\d+: Tile one row 1 is 15 wide/],
  ['too few rows before the next directive',`${palette}@tile one\n${Array(10).fill(row(16)).join('\n')}\n@tile two x=0 y=0 w=1 rows=1\ng\n`,/a\.pxl:\d+: Tile one needs 16 rows, found 10/],
  ['an extra row after a full tile',`${palette}@tile one\n${Array(17).fill(row(16)).join('\n')}\n`,/Expected a directive.*extra row after tile one/],
  ['an animation frame cut short by ---',`${palette}@anim a fps=2 x=0 y=0 w=2 rows=2\ngg\n---\ngg\ngg\n`,/Animation a frame 0 needs 2 rows, found 1 before "---"/],
  ['a character with no palette entry',`${palette}@tile one x=0 y=0 w=1 rows=1\nq\n`,/palette has no entry for "q"/],
  ['a duplicate name',`${palette}@tile one x=0 y=0 w=1 rows=1\ng\n@tile one x=0 y=0 w=1 rows=1\ng\n`,/Duplicate tile name "one"/],
  ['a block that does not fit',`${palette}@tile one x=15 y=0 w=2 rows=1\ngg\n`,/does not fit/],
  ['an unknown material',`${palette}@autotile wall marshmallow as w\n`,/Unknown auto-tile material "marshmallow"/],
  ['a recolor target without a palette entry',`${palette}@tile one template x=0 y=0 w=1 rows=1\nx\n@recolor two one x=q\n`,/no palette entry/],
])('rejects %s before publication with the file and line',async(_,text,message)=>{
  write(text);const result=await buildProject(path);expect(result.ok).toBe(false);expect(result.errors[0].message).toMatch(message);expect(existsSync(join(dir,'dist'))).toBe(false);
});

test('rejects mixed sources and unknown recipe fields',async()=>{
  write(`${palette}@tile one\n${Array(16).fill(row(16)).join('\n')}\n`);
  config.ui={kind:'font'};writeFileSync(path,JSON.stringify(config));expect((await buildProject(path)).errors[0].message).toMatch(/exactly one/);
  delete config.ui;config.tileset.bogus=1;writeFileSync(path,JSON.stringify(config));expect((await buildProject(path)).errors[0].message).toMatch(/Unknown tileset field: bogus/);
});

test('generateTilesetRecipe is pure for the same sources',()=>{
  write(`${palette}@tile one x=0 y=0 w=1 rows=1\ng\n`);
  const a=generateTilesetRecipe(config.tileset,dir),b=generateTilesetRecipe(config.tileset,dir);
  expect(createHash('sha256').update(JSON.stringify(a)).digest('hex')).toBe(createHash('sha256').update(JSON.stringify(b)).digest('hex'));
});

test('tolerates a BOM, CRLF, indentation, tabs, trailing comments and non-ASCII palette characters',async()=>{
  const text=`﻿@palette\r\n  é\t#6b7d3a\t#2f3d22   % accent\r\ny #e0b84a\r\n@tile one x=0 y=0 w=2 rows=1 % note\r\néy\r\n`;
  write(text);const result=await buildProject(path);expect(result.errors).toEqual([]);expect(result.ok).toBe(true);
  const png=await sheet(result);expect(px(png,0,0)).toEqual([0x6b,0x7d,0x3a,255]);expect(px(png,1,0)).toEqual([0xe0,0xb8,0x4a,255]);
});

test.each([
  ['face on a floor',`${palette}@autotile floor slab as f face=2\n`,/face= applies to wall, roof and door/],
  ['a non-numeric face',`${palette}@autotile wall brick as w face=abc\n`,/face= must be an integer from 1 to 8/],
  ['an oversized face',`${palette}@autotile wall brick as w face=40\n`,/face= must be an integer from 1 to 8/],
  ['leaf on a fence',`${palette}@autotile fence wood as f leaf=wood\n`,/leaf= applies only to door sets/],
  ['a recolor that matches no pixels',`${palette}@tile t template x=0 y=0 w=1 rows=1\ng\n@recolor u t y=r\n`,/has no "y" pixels to replace/],
  ['a whitespace palette character',`@palette\n\t #112233\n`,/Palette lines start with one character/],
  ['a stray line without echoing it',`${palette}@tile one x=0 y=0 w=1 rows=1\ng\nsecret-looking text\n`,/Expected a directive/],
])('rejects %s with a file and line',async(_,text,message)=>{
  write(text);const result=await buildProject(path);expect(result.ok).toBe(false);expect(result.errors[0].message).toMatch(message);
  expect(result.errors[0].message).not.toMatch(/secret-looking/);
});

test('accepts a source shared from outside the config directory, rejects missing files and oversized cells',async()=>{
  const shared=join(dir,'..','shared.pxl');writeFileSync(shared,palette);
  write('@tile one x=0 y=0 w=1 rows=1\ng\n');config.tileset.sources=['../shared.pxl','a.pxl'];writeFileSync(path,JSON.stringify(config));
  const ok=await buildProject(path);expect(ok.errors).toEqual([]);expect(ok.ok).toBe(true);
  expect(JSON.parse(readFileSync(ok.artifacts.manifest)).build.inputs.map(i=>i.path)).toContain('../shared.pxl');
  rmSync(shared,{force:true});
  config.tileset.sources=['nope.pxl'];writeFileSync(path,JSON.stringify(config));expect((await buildProject(path)).errors[0].message).toMatch(/tileset\.sources\[0\] "nope\.pxl" is not a file/);
  config.tileset.sources=['a.pxl'];config.tileset.cell=100000;writeFileSync(path,JSON.stringify(config));expect((await buildProject(path)).errors[0].message).toMatch(/integer from 1 to 512/);
});

test('build-set --check accepts intentionally omitted artifacts but flags a missing one otherwise',async()=>{
  const {buildProjectSet}=await import('../../server/build/project-set.js');
  const list=join(dir,'sprite-projects.json');writeFileSync(list,JSON.stringify({version:1,projects:['sprite-project.json']}));
  config.omit=['project','operations','preview','contactSheet'];write(`${palette}@tile one\n${Array(16).fill(row(16)).join('\n')}\n`);
  expect((await buildProjectSet(list)).ok).toBe(true);expect((await buildProjectSet(list,{check:true})).projects[0].status).toBe('current');
  // without omit the same manifest shape is invalid
  delete config.omit;writeFileSync(path,JSON.stringify(config));
  const checked=await buildProjectSet(list,{check:true});expect(checked.projects[0].status).not.toBe('current');
});

test('@shadow and @shade build hard-alpha shadow frames and a shade mask set with a report',async()=>{
  config.tileset.cell=16;config.tileset.columns=8;
  write(`@shadow shadow_small w=10 h=5 color=#102030\n@shadow shadow_edge w=4 h=2 x=0 y=14\n@shade edge_wall n=3 w=2 e=1 color=#102030\n`);
  const result=await buildProject(path);expect(result.errors).toEqual([]);expect(result.ok).toBe(true);
  const report=JSON.parse(readFileSync(result.artifacts.tilesetReport));
  expect(report.count).toBe(11);expect(report.index.shadow_small).toBe(0);
  expect(report.autotiles.edge_wall.kind).toBe('shade');expect(report.autotiles.edge_wall.masks).toEqual([1,4,5,64,65,68,69,128,132]);
  const png=await sheet(result);
  // centre of the lens is opaque shadow colour, a corner is transparent, and nothing is semi-transparent
  expect(px(png,8,8)).toEqual([0x10,0x20,0x30,255]);expect(px(png,0,0)[3]).toBe(0);
  for(let i=3;i<png.data.length;i+=4)expect([0,255]).toContain(png.data[i]);
});

test('@shadow and @shade report mistakes with the line',()=>{
  config.tileset.cell=16;
  write(`@shadow big w=20 h=5\n`);expect(()=>generateTilesetRecipe(config.tileset,dir)).toThrow(/does not fit/);
  write(`@shade s n=3\n`);expect(()=>generateTilesetRecipe(config.tileset,dir)).toThrow(/a.pxl:1/);
});

test('expectedFrames fails the build naming each missing tile frame',async()=>{
  config.expectedFrames=['one','nope'];config.expectedTags=['flame'];
  write(`${palette}@tile one x=0 y=0 w=1 rows=1\ng\n`);
  const result=await buildProject(path);expect(result.ok).toBe(false);
  const text=JSON.stringify(result.errors);expect(text).toContain('Required frame is missing: nope');expect(text).not.toContain('missing: one');expect(text).toMatch(/flame/);
  config.expectedFrames=['one'];delete config.expectedTags;write(`${palette}@tile one x=0 y=0 w=1 rows=1\ng\n`);expect((await buildProject(path)).ok).toBe(true);
});

test('contact sheet puts each label directly beneath its own art in every row',async()=>{
  write(`${palette}@tile one\n${Array(16).fill(row(16)).join('\n')}\n@tile two\n${Array(16).fill(row(16)).join('\n')}\n`);
  config.tileset.columns=1;config.scale=4;writeFileSync(path,JSON.stringify(config));
  const result=await buildProject(path);expect(result.ok).toBe(true);
  const {data,info}=await sharp(result.artifacts.contactSheet).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const at=(x,y)=>{const i=(y*info.width+x)*4;return [...data.slice(i,i+3)].join(',');};
  // card: gap 6, pad 8, art 16*4 tall, pad 8, label band 40; cards one gutter apart
  const cardH=8+64+8+40, top=card=>6+card*(cardH+6);
  for(const card of [0,1]){
    expect(at(30,top(card)+8+2)).toBe('107,125,58');
    expect(at(info.width-10,top(card)+8+64+8+20)).toBe('37,37,37');
    expect(at(info.width-10,top(card)+cardH+2)).toBe('90,90,90');
  }
  expect(info.height).toBe(6+2*(cardH+6));
});

test('check lists every short row and unknown palette character with file, line and expected width, writing nothing',async()=>{
  write(`${palette}@tile one\n${[row(15),row(16),'gggggggggggggggq',...Array(13).fill(row(16))].join('\n')}\n@tile two\n${[row(14),...Array(15).fill(row(16))].join('\n')}\n`);
  const {checkBuildSources}=await import('../../server/build/source-check.js');
  const report=checkBuildSources(path);
  expect(report.ok).toBe(false);
  expect(report.errors.map(e=>[e.code,e.kind,e.file,e.line,e.expected,e.actual])).toEqual([
    ['pxl-invalid','row-width','a.pxl',7,16,15],['pxl-invalid','palette','a.pxl',9,undefined,undefined],['pxl-invalid','row-width','a.pxl',24,16,14]]);
  expect(report.errors[0].message).toBe('a.pxl:7: Tile one row 1 is 15 wide; expected 16.');
  expect(existsSync(join(dir,'dist'))).toBe(false);
});

test('check passes a clean tileset and reports structural errors at their line',async()=>{
  write(`${palette}@tile one\n${Array(16).fill(row(16)).join('\n')}\n`);
  const {checkBuildSources}=await import('../../server/build/source-check.js');
  expect(checkBuildSources(path)).toMatchObject({ok:true,tiles:1,errors:[]});
  write(`${palette}@tile one\n${Array(16).fill(row(16)).join('\n')}\n@tile one\n${Array(16).fill(row(16)).join('\n')}\n`);
  const bad=checkBuildSources(path);expect(bad.ok).toBe(false);expect(bad.errors[0]).toMatchObject({file:'a.pxl',line:23,kind:'parse'});
});

test('check refuses a build config that has no tileset source',async()=>{
  writeFileSync(path,JSON.stringify({version:1,output:'dist',ops:'o.json'}));
  const {checkBuildSources}=await import('../../server/build/source-check.js');
  expect(checkBuildSources(path)).toMatchObject({ok:false,errors:[{code:'check-input'}]});
});
