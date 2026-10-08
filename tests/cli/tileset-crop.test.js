import {test,expect,beforeEach,afterEach} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {buildProject} from '../../server/build/project-build.js';
import {decodePng} from '../../server/engine/png-decode.js';
import {checkBuildSources} from '../../server/build/source-check.js';
import {buildProjectSet} from '../../server/build/project-set.js';

let dir;
const palette='@palette\ng #6b7d3a #2f3d22\ny #e0b84a\nr #b5532f #5e2a1f\nk #101010\n';
const row=(w,ch)=>ch.repeat(w);
beforeEach(()=>{
  dir=mkdtempSync(join(tmpdir(),'sprite-crop-'));mkdirSync(join(dir,'a'));mkdirSync(join(dir,'b'));
  writeFileSync(join(dir,'a','sprite-project.json'),JSON.stringify({version:1,output:'../out/a',scale:1,tileset:{name:'a',cell:8,columns:2,sources:['a.pxl']}}));
  // 8x8 tile: a yellow block with a green core inside a dark ring, transparent outside
  const art=['........','.kkkkkk.','.kyyyyk.','.kyggyk.','.kyggyk.','.kyyyyk.','.kkkkkk.','........'].join('\n');
  writeFileSync(join(dir,'a','a.pxl'),`${palette}@tile tile_a\n${art}\n@tile tile_b\n${Array(8).fill(row(8,'r')).join('\n')}\n`);
  writeFileSync(join(dir,'b','sprite-project.json'),JSON.stringify({version:1,output:'../out/b',scale:1,tileset:{name:'b',cell:8,columns:2,imports:{a:'../out/a/a.atlas.json'},sources:['b.pxl']}}));
});
afterEach(()=>rmSync(dir,{recursive:true,force:true}));
const sheet=async result=>{const {data,info}=await sharp(result.artifacts.sheet).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {data,width:info.width};};
const px=(png,x,y)=>[...png.data.slice((y*png.width+x)*4,(y*png.width+x)*4+4)];
const writeB=text=>writeFileSync(join(dir,'b','b.pxl'),`${palette}${text}\n`);
const YEL=[0xe0,0xb8,0x4a,255];
const bConfig=()=>join(dir,'b','sprite-project.json'),aConfig=()=>join(dir,'a','sprite-project.json');

test('@crop copies a region of another set at its own place, mapping colours back to the palette',async()=>{
  expect((await buildProject(aConfig())).ok).toBe(true);
  writeB('@crop icon from=a:tile_a src=2,2 size=4x4 x=2 y=2 unknown=drop\n@crop whole from=a:tile_b unknown=error');
  const r=await buildProject(bConfig());expect(r.errors).toEqual([]);expect(r.ok).toBe(true);
  const png=await sheet(r);
  expect(px(png,2,2)).toEqual(YEL);expect(px(png,3,3)).toEqual([0x6b,0x7d,0x3a,255]);expect(px(png,1,1)[3]).toBe(0);
  expect(px(png,8+3,3)).toEqual([0xb5,0x53,0x2f,255]);
});

test('unknown colours, trim and outline',async()=>{
  await buildProject(aConfig());
  writeFileSync(join(dir,'b','b.pxl'),'@palette\ng #6b7d3a #2f3d22\ny #e0b84a\n@crop e from=a:tile_a\n');
  expect(checkBuildSources(bConfig()).errors[0].message).toMatch(/b\.pxl:4: @crop e: a:tile_a \(1,1\) is #101010, which is not in the palette/);
  writeFileSync(join(dir,'b','b.pxl'),'@palette\ng #6b7d3a #2f3d22\ny #e0b84a\n@crop dropped from=a:tile_a unknown=drop\n@crop kept from=a:tile_a unknown=keep\n');
  const r=await buildProject(bConfig());expect(r.ok).toBe(true);const png=await sheet(r);
  expect(px(png,1,1)[3]).toBe(0);expect(px(png,8+1,1)).toEqual([0x10,0x10,0x10,255]);
  writeB('@crop trimmed from=a:tile_a trim=#101010\n@crop edged from=a:tile_b x=0 y=0 size=4x4 outline');
  const t=await buildProject(bConfig());const tp=await sheet(t);
  expect(px(tp,1,1)[3]).toBe(0);expect(px(tp,2,2)).toEqual(YEL); // the ring is trimmed where it touches clear pixels
  expect(px(tp,8+4,0)[3]).toBe(255); // outline on the open side of a cropped block
});

test('the imported atlas and sheet are build inputs, so rebuilding the source set makes the crop set stale',async()=>{
  writeFileSync(join(dir,'sprite-projects.json'),JSON.stringify({version:1,projects:['a/sprite-project.json','b/sprite-project.json']}));
  writeB('@crop icon from=a:tile_a unknown=drop');
  const built=await buildProjectSet(join(dir,'sprite-projects.json'));expect(built.ok).toBe(true);
  expect((await buildProjectSet(join(dir,'sprite-projects.json'),{check:true})).stale).toBe(0);
  const manifest=JSON.parse(readFileSync(join(dir,'out','b','sprite-manifest.json')));
  expect(manifest.build.inputs.map(i=>i.path)).toEqual(expect.arrayContaining(['../out/a/a.atlas.json','../out/a/a.png']));
  writeFileSync(join(dir,'a','a.pxl'),readFileSync(join(dir,'a','a.pxl'),'utf8').replace('.kkkkkk.\n........\n@tile tile_b','.kkkkkk.\n.......g\n@tile tile_b'));
  expect((await buildProject(aConfig())).ok).toBe(true);
  const stale=await buildProjectSet(join(dir,'sprite-projects.json'),{check:true});
  expect(stale.projects[1].reasons.map(r=>r.code)).toContain('input-changed');
});

test('bad @crop lines are named with file and line',async()=>{
  await buildProject(aConfig());
  for(const [text,message] of [
    ['@crop x from=a','from= is <import>:<frame>'],['@crop x from=zz:tile_a','no import "zz"'],['@crop x from=a:nope','has no frame "nope"'],
    ['@crop x from=a:tile_a src=6,6 size=4x4','does not fit the 8x8 frame'],['@crop x from=a:tile_a x=6','does not fit a 8x8 cell'],
    ['@crop x from=a:tile_a unknown=maybe','unknown= is'],['@crop x from=a:tile_a trim=red','trim='],['@crop x from=a:tile_a bogus=1','unknown option bogus'],
  ]){writeB(text);const e=checkBuildSources(bConfig()).errors[0];expect(e?.message,text).toContain(message);expect(e.line,text).toBe(6);}
  writeFileSync(bConfig(),JSON.stringify({version:1,output:'../out/b',scale:1,tileset:{name:'b',cell:8,imports:{a:'../nowhere/a.atlas.json'},sources:['b.pxl']}}));
  expect(checkBuildSources(bConfig()).errors[0].message).toContain('build that set first');
});

test('the synchronous PNG decoder agrees with sharp for RGBA, RGB, palette and grey images',async()=>{
  const w=5,h=4,rgba=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){rgba[i*4]=i*11;rgba[i*4+1]=(i*7)%256;rgba[i*4+2]=255-i*5;rgba[i*4+3]=i%3?255:0;}
  const raw={raw:{width:w,height:h,channels:4}};
  for(const make of [s=>s.png(),s=>s.png({palette:true,colours:16}),s=>s.png({compressionLevel:0,adaptiveFiltering:true})]){
    const buf=await make(sharp(rgba,raw)).toBuffer();
    const ref=await sharp(buf).ensureAlpha().raw().toBuffer(),got=decodePng(buf);
    expect(got.width).toBe(w);expect(got.height).toBe(h);expect(Buffer.from(got.data).equals(ref)).toBe(true);
  }
  const rgb=await sharp(rgba,raw).removeAlpha().png().toBuffer();
  expect(Buffer.from(decodePng(rgb).data).equals(await sharp(rgb).ensureAlpha().raw().toBuffer())).toBe(true);
  const grey=await sharp(rgba,raw).greyscale().png().toBuffer();
  expect(Buffer.from(decodePng(grey).data).equals(await sharp(grey).ensureAlpha().raw().toBuffer())).toBe(true);
  expect(()=>decodePng(Buffer.from('nope'))).toThrow(/Not a PNG/);
});
