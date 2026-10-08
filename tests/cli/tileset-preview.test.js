import {test,expect,beforeEach,afterEach} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,cpSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {buildProject} from '../../server/build/project-build.js';
import {renderTilesetPreview,connectMask} from '../../server/build/tileset-preview.js';

const exec=promisify(execFile);
let dir;
const raw=async file=>{const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {data,width:info.width,height:info.height};};
const px=(png,x,y)=>[...png.data.slice((y*png.width+x)*4,(y*png.width+x)*4+4)];
beforeEach(()=>{
  dir=mkdtempSync(join(tmpdir(),'sprite-preview-'));mkdirSync(join(dir,'set'));
  // cells of 2x2 pixels: solid tiles, wall masks 0 and 20, and fence pieces with one or two opaque pixels
  const pxl='@palette\nr #ff0000\ng #00ff00\nb #0000ff\n@tile a\nrr\nrr\n@tile b\ngg\ngg\n@tile wall_0\nbb\nbb\n@tile wall_20\n.b\nbb\n@tile fence_4\nr.\n..\n@tile fence_64\n.g\n..\n@tile fence_68\nrg\n..\n';
  writeFileSync(join(dir,'set','t.pxl'),pxl);
  writeFileSync(join(dir,'set','sprite-project.json'),JSON.stringify({version:1,output:'../out',scale:1,tileset:{name:'t',cell:2,columns:3,sources:['t.pxl']}}));
});
afterEach(()=>rmSync(dir,{recursive:true,force:true}));
const layout=async (sheets,extra={})=>{
  expect((await buildProject(join(dir,'set','sprite-project.json'))).ok).toBe(true);
  writeFileSync(join(dir,'layout.json'),JSON.stringify({version:1,atlases:{t:'out/t.atlas.json'},cell:2,background:'#102030',sheets,...extra}));
  return renderTilesetPreview(join(dir,'layout.json'),{outDir:join(dir,'o'),scale:extra.scale});
};

test('connectMask keeps a diagonal only when both adjacent sides are joined',()=>{
  expect(connectMask(1|2)).toBe(1);expect(connectMask(1|4|2)).toBe(1|4|2);expect(connectMask(255)).toBe(255);expect(connectMask(2|8|32|128)).toBe(0);
});

test('stamps frames over the background with hard alpha and scales by whole numbers',async()=>{
  const r=await layout({s:{size:[2,1],layers:[{frame:'a',at:[0,0]},{frame:'fence_4',at:[1,0]}]}},{scale:3});
  expect(r.errors).toEqual([]);expect(r.sheets).toEqual([expect.objectContaining({name:'s',width:12,height:6})]);
  const png=await raw(join(dir,'o','s.png'));
  expect(px(png,0,0)).toEqual([255,0,0,255]);expect(px(png,5,5)).toEqual([255,0,0,255]);
  expect(px(png,6,0)).toEqual([255,0,0,255]);
  expect(px(png,9,0)).toEqual([0x10,0x20,0x30,255]);
});

test('autotile glyphs pick the frame from joined neighbours in fence mode',async()=>{
  const r=await layout({s:{size:[3,1],layers:[{at:[0,0],rows:['fff'],glyphs:{f:{autotile:'fence',mode:'fence'}}}]}},{scale:1});
  expect(r.errors).toEqual([]);
  const png=await raw(join(dir,'o','s.png'));
  expect(px(png,0,0)).toEqual([255,0,0,255]);
  expect(px(png,2*2+1,0)).toEqual([0,255,0,255]);
  expect(px(png,1*2,0)).toEqual([255,0,0,255]);
  expect(px(png,1*2+1,0)).toEqual([0,255,0,255]);
});

test('a lone blob cell is mask 0, and a missing mask is named',async()=>{
  const r=await layout({s:{size:[3,3],layers:[{rows:['...','.#.','...'],glyphs:{'#':{autotile:'wall'}}}]}},{scale:1});
  expect(r.errors).toEqual([]);expect(px(await raw(join(dir,'o','s.png')),3,3)).toEqual([0,0,255,255]);
  const j=await layout({s:{size:[3,3],layers:[{rows:['.#.','.#.','...'],glyphs:{'#':{autotile:'wall'}}}]}});
  expect(j.errors[0].message).toContain('no frame "wall_16"');
});

test('each repeats a sheet or layer per item with substitution and numeric positions',async()=>{
  const r=await layout({'tile_${id}':{each:[{id:'one',f:'a'},{id:'two',f:'b'}],size:[1,1],layers:[{frame:'${f}',at:[0,0]}]},
    pair:{size:[2,1],layers:[{each:[{x:0,f:'a'},{x:1,f:'b'}],frame:'${f}',at:['${x}',0]}]}},{scale:1});
  expect(r.errors).toEqual([]);expect(r.sheets.map(s=>s.name)).toEqual(['tile_one','tile_two','pair']);
  expect(px(await raw(join(dir,'o','tile_two.png')),0,0)).toEqual([0,255,0,255]);
  expect(px(await raw(join(dir,'o','pair.png')),2,0)).toEqual([0,255,0,255]);
});

test('night tint multiplies the colours, and optional frames only warn',async()=>{
  const r=await layout({s:{size:[1,1],layers:[{frame:'a',at:[0,0]},{frame:'nope',at:[0,0],optional:true}]}},{scale:1});
  expect(r.ok).toBe(true);expect(r.warnings[0].code).toBe('missing-frame');
  const night=await renderTilesetPreview(join(dir,'layout.json'),{outDir:join(dir,'n'),night:true,scale:1});
  expect(night.ok).toBe(true);
  expect(px(await raw(join(dir,'n','s.png')),0,0)).toEqual([Math.round(255*.34),0,24,255]);
});

test('errors name the sheet and layer, and the scale must be a whole number',async()=>{
  expect((await layout({s:{size:[1,1],layers:[{frame:'zzz',at:[0,0]}]}})).errors[0].message).toContain('sheet s: layer 0: t has no frame "zzz"');
  expect((await layout({s:{size:[1,1],layers:[{rows:['x'],glyphs:{}}]}})).errors[0].message).toContain('glyph "x"');
  expect((await layout({s:{size:[0,1],layers:[]}})).errors[0].message).toContain('size must be');
  expect((await renderTilesetPreview(join(dir,'layout.json'),{outDir:join(dir,'o'),scale:1.5})).errors[0].message).toContain('whole number');
});

test('the CLI writes sheets and exits nonzero on a bad layout',async()=>{
  const cli=fileURLToPath(new URL('../../scripts/sprite.js',import.meta.url));
  await layout({s:{size:[1,1],layers:[{frame:'a',at:[0,0]}]}});
  const ok=await exec(process.execPath,[cli,'tileset-preview',join(dir,'layout.json'),'--out',join(dir,'cli'),'--json']);
  expect(JSON.parse(ok.stdout)).toMatchObject({ok:true,sheets:[{name:'s'}]});expect(existsSync(join(dir,'cli','s.png'))).toBe(true);
  writeFileSync(join(dir,'bad.json'),'{"version":2}');
  await expect(exec(process.execPath,[cli,'tileset-preview',join(dir,'bad.json'),'--out',join(dir,'cli')])).rejects.toMatchObject({code:1});
});

test('the shipped example layout renders against the shipped tileset example',async()=>{
  cpSync(new URL('../../examples/tileset',import.meta.url),join(dir,'ex'),{recursive:true});
  expect((await buildProject(join(dir,'ex','sprite-project.json'))).ok).toBe(true);
  const r=await renderTilesetPreview(join(dir,'ex','preview-layout.json'),{outDir:join(dir,'ex-out')});
  expect(r.errors).toEqual([]);expect(r.sheets.map(s=>[s.name,s.width,s.height])).toEqual([['room',18*16*4,7*16*4],['ruins',8*16*4,3*16*4]]);
});
