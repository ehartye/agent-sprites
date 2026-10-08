import {test,expect,beforeEach,afterEach} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {buildProject} from '../../server/build/project-build.js';
import {buildAppIcons} from '../../server/build/app-icons.js';
import {decodePng} from '../../server/engine/png-decode.js';

const exec=promisify(execFile);
let dir;
const palette='@palette\na #204060\nb #e0b84a\nc #b5532f\nd #6b7d3a\n';
// a recognisable opaque picture: diagonal bands of four colours, so any mis-scaling or mis-crop changes pixels
const picture=size=>Array.from({length:size},(_,y)=>Array.from({length:size},(_,x)=>'abcd'[((x>>1)+(y>>2))%4]).join('')).join('\n');
const read=name=>decodePng(readFileSync(join(dir,'icons',name)));
const px=(p,x,y)=>[...p.data.slice((y*p.width+x)*4,(y*p.width+x)*4+4)];
beforeEach(()=>{
  dir=mkdtempSync(join(tmpdir(),'sprite-icons-'));mkdirSync(join(dir,'set'));
  writeFileSync(join(dir,'set','i.pxl'),`${palette}@tile icon_master x=0 y=0 w=64 rows=64\n${picture(64)}\n@tile icon_32 x=0 y=0 w=32 rows=32\n${picture(32)}\n@tile icon_16 x=0 y=0 w=16 rows=16\n${picture(16)}\n`);
  writeFileSync(join(dir,'set','sprite-project.json'),JSON.stringify({version:1,output:'../built',scale:1,tileset:{name:'icons',cell:64,columns:3,sources:['i.pxl']}}));
  writeFileSync(join(dir,'app-icons.json'),JSON.stringify({version:1,atlas:'built/icons.atlas.json',output:'icons'}));
});
afterEach(()=>rmSync(dir,{recursive:true,force:true}));
const build=async(extra={},opts)=>{
  expect((await buildProject(join(dir,'set','sprite-project.json'))).ok).toBe(true);
  writeFileSync(join(dir,'app-icons.json'),JSON.stringify({version:1,atlas:'built/icons.atlas.json',output:'icons',...extra}));
  return buildAppIcons(join(dir,'app-icons.json'),opts);
};
const masterPx=(x,y)=>{const c='abcd'[((x>>1)+(y>>2))%4];return {a:[0x20,0x40,0x60],b:[0xe0,0xb8,0x4a],c:[0xb5,0x53,0x2f],d:[0x6b,0x7d,0x3a]}[c];};

test('writes the whole set as whole-number scales of the tiles, all opaque RGB',async()=>{
  const r=await build();expect(r.errors).toEqual([]);expect(r.ok).toBe(true);
  expect(r.files.map(f=>[f.name,f.width,f.height])).toEqual([['icon-192.png',192,192],['icon-512.png',512,512],['icon-maskable-512.png',512,512],['apple-touch-icon.png',180,180],['favicon-16.png',16,16],['favicon-32.png',32,32],['favicon-48.png',48,48],['favicon.ico',48,48]]);
  const i192=read('icon-192.png'),i512=read('icon-512.png');
  for(const [x,y] of [[0,0],[5,7],[100,60],[191,191]])expect(px(i192,x,y).slice(0,3)).toEqual(masterPx(Math.floor(x/3),Math.floor(y/3)));
  expect(px(i512,300,200).slice(0,3)).toEqual(masterPx(Math.floor(300/8),Math.floor(200/8)));
  const apple=read('apple-touch-icon.png');expect(px(apple,0,0).slice(0,3)).toEqual(masterPx(2,2));expect(px(apple,179,179).slice(0,3)).toEqual(masterPx(61,61));
  const meta=await sharp(join(dir,'icons','apple-touch-icon.png')).metadata();expect(meta.hasAlpha).toBe(false);expect(meta.channels).toBe(3);
  // maskable: master at 6x inside an 11 px bleed, cropped 2 px: source pixel (11,11) of the bleed picture starts at x = 11*6-2 = 64
  const mask=read('icon-maskable-512.png');expect(px(mask,64,64).slice(0,3)).toEqual(masterPx(0,0));expect(px(mask,64+6*10,64+6*20).slice(0,3)).toEqual(masterPx(10,20));
  expect(px(mask,0,0).slice(0,3)).toEqual(masterPx(0,0)); // the bleed continues the corner pixel
  expect(px(read('favicon-48.png'),47,47).slice(0,3)).toEqual(px(read('favicon-16.png'),15,15).slice(0,3));
  for(const f of r.files)if(f.name.endsWith('.png'))expect((await sharp(join(dir,'icons',f.name)).metadata()).hasAlpha).toBe(false);
});

test('the .ico holds the 16, 32 and 48 favicons as PNG entries',async()=>{
  await build();const ico=readFileSync(join(dir,'icons','favicon.ico'));
  expect([ico.readUInt16LE(2),ico.readUInt16LE(4)]).toEqual([1,3]);
  const names=['favicon-16.png','favicon-32.png','favicon-48.png'];
  [0,1,2].forEach(i=>{const size=ico[6+16*i],off=ico.readUInt32LE(6+16*i+12),len=ico.readUInt32LE(6+16*i+8);
    expect(size).toBe([16,32,48][i]);expect(ico.subarray(off,off+len).equals(readFileSync(join(dir,'icons',names[i])))).toBe(true);});
});

test('check compares decoded pixels, writes nothing, and names stale or missing files',async()=>{
  await build();
  expect(await buildAppIcons(join(dir,'app-icons.json'),{check:true})).toMatchObject({ok:true,mode:'check',errors:[]});
  writeFileSync(join(dir,'icons','favicon-16.png'),await sharp(join(dir,'icons','favicon-32.png')).png().toBuffer());
  rmSync(join(dir,'icons','icon-192.png'));
  const r=await buildAppIcons(join(dir,'app-icons.json'),{check:true});
  expect(r.ok).toBe(false);expect(r.files.find(f=>f.name==='favicon-16.png').status).toBe('stale');expect(r.files.find(f=>f.name==='icon-192.png').status).toBe('missing');
  expect(existsSync(join(dir,'icons','icon-192.png'))).toBe(false);expect(r.errors[0].message).toContain('favicon-16.png');
  expect((await buildAppIcons(join(dir,'app-icons.json'))).ok).toBe(true);
  expect((await buildAppIcons(join(dir,'app-icons.json'),{check:true})).ok).toBe(true);
});

test('the share card extends the master by its edge pixels, adds stars and stamps the logo on the horizon',async()=>{
  writeFileSync(join(dir,'logo.png'),await sharp(Buffer.from([255,255,255,255, 255,255,255,0, 255,255,255,255, 0,0,0,0]),{raw:{width:2,height:2,channels:4}}).png().toBuffer());
  const card={width:200,height:140,scale:2,sceneWidth:134,masterX:67,horizon:46,stars:{sample:[6,0],at:[[50,10]]},logo:{image:'logo.png',scale:2,x:10}};
  const r=await build({card});expect(r.errors).toEqual([]);expect(r.ok).toBe(true);
  expect(r.files.at(-1)).toMatchObject({name:'og-card.png',width:200,height:140});
  const png=read('og-card.png'),star=masterPx(6,0);
  // scene is 134x70 at 2x, cropped 34 px from each side; the master sits at scene (67,6), the scene is its edge pixels elsewhere
  expect(px(png,(50*2)-34,20).slice(0,3)).toEqual(star);expect(px(png,(50*2)-34+1,21).slice(0,3)).toEqual(star);
  expect(px(png,(67+10)*2-34,(6+20)*2).slice(0,3)).toEqual(masterPx(10,20));
  expect(px(png,0,139).slice(0,3)).toEqual(masterPx(0,63)); // bleed to the left of the master, down to the bottom edge
  expect(px(png,10,102).slice(0,3)).toEqual([255,255,255]);expect(px(png,11,105).slice(0,3)).toEqual([255,255,255]);expect(px(png,12,102).slice(0,3)).not.toEqual([255,255,255]);
  expect((await buildAppIcons(join(dir,'app-icons.json'),{check:true})).ok).toBe(true);
});

test('errors are plain: missing atlas or frame, bad card geometry, transparent tile, unknown field',async()=>{
  const r=await build();expect(r.ok).toBe(true);
  const bad=async cfg=>{writeFileSync(join(dir,'app-icons.json'),JSON.stringify({version:1,atlas:'built/icons.atlas.json',output:'icons',...cfg}));return (await buildAppIcons(join(dir,'app-icons.json'))).errors[0].message;};
  expect(await bad({tiles:{master:'nope'}})).toContain('no frame nope');
  expect(await bad({bogus:1})).toContain('Unknown app-icons field');
  expect(await bad({card:{width:100,height:100,scale:3,sceneWidth:134,masterX:0,horizon:1}})).toContain('whole number of scene pixels');
  expect(await bad({atlas:'built/zzz.json'})).toContain('does not exist');
  writeFileSync(join(dir,'app-icons.json'),JSON.stringify({version:2}));
  expect((await buildAppIcons(join(dir,'app-icons.json'))).errors[0].message).toContain('version: 1');
});

test('the CLI builds, checks and exits nonzero when stale',async()=>{
  const cli=fileURLToPath(new URL('../../scripts/sprite.js',import.meta.url));
  await build();rmSync(join(dir,'icons'),{recursive:true,force:true});
  const made=await exec(process.execPath,[cli,'app-icons',join(dir,'app-icons.json'),'--json']);expect(JSON.parse(made.stdout)).toMatchObject({ok:true,mode:'build'});
  const ok=await exec(process.execPath,[cli,'app-icons',join(dir,'app-icons.json'),'--check']);expect(ok.stdout).toContain('8 icon files current');
  rmSync(join(dir,'icons','favicon.ico'));
  await expect(exec(process.execPath,[cli,'app-icons',join(dir,'app-icons.json'),'--check'])).rejects.toMatchObject({code:1});
});
