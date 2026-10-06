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
