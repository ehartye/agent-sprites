import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, mkdirSync, symlinkSync, renameSync, linkSync, watch } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createCanvas } from 'canvas';
import sharp from 'sharp';
import { renderAtlasProof } from '../../server/engine/atlas-proof.js';
import { Project } from '../../server/engine/project.js';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';
import { handleDraw } from '../../server/handlers/draw.js';
import { exportTrimmed } from '../../server/engine/trimmed-export.js';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(),'sprite-proof-')); });
afterEach(() => rmSync(dir,{recursive:true,force:true}));
const write = (path,value) => writeFileSync(path,JSON.stringify(value));
const config = tracks => ({version:1,canvas:{w:8,h:8},tracks});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function exported(name,color,points,durations=[125,125]) {
  const state = {project:Project.create({name,cellSize:8,rows:1,cols:points.length,palette:'pico8'})};
  points.forEach(([x,y],i) => handleDraw(state,'point',{cell:`0,${i}`,x,y,color,shape_name:'dot'}));
  state.project.pivot={x:4,y:7};
  const result = await exportTrimmed(state.project,new CanvasRenderer(state.project.palette),{imageName:`${name}.png`,groups:{walk:points.map((_,i)=>`0,${i}`)}});
  const tag=result.atlas.meta.frameTags[0];
  for(let i=tag.from;i<=tag.to;i++)result.atlas.frames[i].duration=durations[i-tag.from];
  writeFileSync(join(dir,`${name}.png`),result.png);write(join(dir,`${name}.atlas.json`),result.atlas);
  return result.atlas;
}
async function run(value, name='proof') {
  const file=join(dir,'proof-config.json');write(file,value);
  return renderAtlasProof(file,{output:join(dir,name)});
}
const pixel = (raw,w,x,y) => [...raw.subarray((y*w+x)*4,(y*w+x+1)*4)];

test('owned tag one-shot timing propagates to proof unless an explicit track loop overrides it',async()=>{
  const atlas=await exported('once','#ff004d',[[1,2],[6,4]],[100,100]);
  atlas.meta.frameTags[0].loop=false;write(join(dir,'once.atlas.json'),atlas);
  const once=await run(config([{name:'once',atlas:'once.atlas.json',tag:'walk'}]),'tag-once');
  expect(once.loop).toBe(false);
  expect(readFileSync(once.artifacts.gif).includes(Buffer.from('NETSCAPE2.0'))).toBe(false);
  const repeated=await run(config([{name:'once',atlas:'once.atlas.json',tag:'walk',loop:true}]),'tag-loop');
  expect(repeated.loop).toBe(true);
  atlas.meta.frameTags[0].loop='false';write(join(dir,'once.atlas.json'),atlas);
  await expect(run(config([{name:'once',atlas:'once.atlas.json',tag:'walk'}]),'invalid-tag-loop')).rejects.toThrow(/loop.*boolean/i);
});

test('real moving trimmed exports compose canonical PNGs and decoded one-shot GIF without ghost trails',async()=>{
  await exported('base','#ff004d',[[1,2],[6,4]]);
  await exported('overlay','#29adff',[[2,3],[5,1]],[75,175]);
  const result=await run(config([
    {name:'base',atlas:'base.atlas.json',tag:'walk',loop:false},
    {name:'overlay',atlas:'overlay.atlas.json',tag:'walk',loop:false},
  ]));
  expect(result.ok).toBe(true);expect(result.artifacts.frames).toHaveLength(3);
  const report=JSON.parse(readFileSync(result.artifacts.report));
  expect(report.timeline.steps.map(s=>s.durationMs)).toEqual([75,50,125]);
  expect(report.gif.delaysMs).toEqual([80,50,120]);expect(report.gif.loop).toBe(false);
  const gif=readFileSync(result.artifacts.gif);expect(gif.includes(Buffer.from('NETSCAPE2.0'))).toBe(false);
  const decoded=await sharp(gif,{animated:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  expect(decoded.info.pages).toBe(3);
  for (let i=0;i<3;i++) {
    const png=await sharp(result.artifacts.frames[i]).ensureAlpha().raw().toBuffer();
    expect(decoded.data.subarray(i*8*8*4,(i+1)*8*8*4)).toEqual(png);
  }
  expect(pixel(decoded.data.subarray(2*256),8,1,2)).toEqual([0,0,0,0]);
  expect(report.gif.pixelComparison.exact).toBe(true);
  expect(report.tracks[0]).toMatchObject({atlas:join(dir,'base.atlas.json'),image:join(dir,'base.png')});
  expect(report.provenance.inputs).toEqual(expect.arrayContaining([expect.objectContaining({path:join(dir,'base.png'),sha256:hash(readFileSync(join(dir,'base.png')))})]));
  const contact=await sharp(result.artifacts.contact).metadata();expect(contact.width*contact.height).toBeGreaterThanOrEqual(3*64);
  expect(readdirSync(dir).filter(n=>n.includes('staging'))).toEqual([]);
});

test('pivot slice keys use frame-specific bounds and a chosen integer anchor bypasses a fractional pivot',async()=>{
  const a=await exported('base','#ff004d',[[1,2],[6,4]],[100,100]);
  a.meta.slices=[{name:'pivot',keys:[{frame:0,bounds:{x:1,y:2,w:7,h:6},pivot:{x:1,y:1}},{frame:3,bounds:{x:2,y:1,w:6,h:7},pivot:{x:2,y:2}}]}];
  write(join(dir,'base.atlas.json'),a);
  const r=await run(config([{name:'base',atlas:'base.atlas.json',tag:'walk',anchor:'pivot',x:4,y:4,loop:false}]));
  const p0=await sharp(r.artifacts.frames[0]).ensureAlpha().raw().toBuffer();
  const p1=await sharp(r.artifacts.frames[1]).ensureAlpha().raw().toBuffer();
  expect(pixel(p0,8,3,3)).toEqual([255,0,77,255]);expect(pixel(p1,8,6,5)).toEqual([255,0,77,255]);
  a.meta.slices[0].keys[0].pivot.x=.5;write(join(dir,'base.atlas.json'),a);
  await expect(run(config([{name:'base',atlas:'base.atlas.json',frames:[0],anchor:'pivot'}]),'fractional')).rejects.toThrow(/integer/);
  expect(existsSync(join(dir,'fractional'))).toBe(false);
  expect((await run(config([{name:'base',atlas:'base.atlas.json',frames:[0],anchor:'center'}]),'explicit')).ok).toBe(true);
  delete a.meta.slices;write(join(dir,'base.atlas.json'),a);
  await expect(run(config([{name:'base',atlas:'base.atlas.json',frames:[0],anchor:'pivot'}]),'missing-pivot')).rejects.toThrow(/pivot/);
});

test('clockwise packed rotation is undone inside the original source canvas with trim offsets',async()=>{
  const c=createCanvas(2,3),ctx=c.getContext('2d');
  // Original 3x2: R.G / B.Y; clockwise storage: B R / . . / Y G.
  for(const [x,y,color]of [[0,0,'#0000ff'],[1,0,'#ff0000'],[0,2,'#ffff00'],[1,2,'#00ff00']]){ctx.fillStyle=color;ctx.fillRect(x,y,1,1);}
  writeFileSync(join(dir,'rotated.png'),c.toBuffer('image/png'));
  write(join(dir,'rotated.atlas.json'),{frames:{sprite:{frame:{x:0,y:0,w:2,h:3},sourceSize:{w:7,h:6},spriteSourceSize:{x:2,y:1,w:3,h:2},rotated:true,duration:100}},meta:{image:'rotated.png',size:{w:2,h:3}}});
  const r=await run(config([{name:'rotated',atlas:'rotated.atlas.json',frames:['sprite']}]));
  const data=await sharp(r.artifacts.frames[0]).ensureAlpha().raw().toBuffer();
  expect(pixel(data,8,2,1)).toEqual([255,0,0,255]);expect(pixel(data,8,4,1)).toEqual([0,255,0,255]);
  expect(pixel(data,8,2,2)).toEqual([0,0,255,255]);expect(pixel(data,8,4,2)).toEqual([255,255,0,255]);
});

test('GIF timing uses cumulative centisecond rounding while keeping repeated holds',async()=>{
  await exported('base','#ff004d',[[1,2],[6,4]]);
  const r=await run(config([{name:'base',atlas:'base.atlas.json',frames:[0,0,1,1],loop:true}]));
  const report=JSON.parse(readFileSync(r.artifacts.report));expect(report.gif.delaysMs).toEqual([130,120,130,120]);
  expect(report.gif.durationMs).toBe(500);expect(report.gif.driftMs).toBe(0);
  const meta=await sharp(r.artifacts.gif,{animated:true}).metadata();expect(meta.pages).toBe(4);expect(meta.loop).toBe(0);
  const held=await run(config([{name:'base',atlas:'base.atlas.json',frames:[0,0,0],loop:false}]),'held');
  expect(held.frameCount).toBe(3);expect(held.durationMs).toBe(375);expect(held.gif.delaysMs).toEqual([130,120,130]);
  expect((await sharp(held.artifacts.gif,{animated:true}).metadata()).pages).toBe(3);
});

test('partial alpha requires an explicit matte, applied to canonical PNG and GIF',async()=>{
  await exported('base','#ff004d',[[1,2]] ,[100]);
  const c=createCanvas(1,1),ctx=c.getContext('2d');ctx.fillStyle='rgba(255,0,0,0.5)';ctx.fillRect(0,0,1,1);
  writeFileSync(join(dir,'base.png'),c.toBuffer('image/png'));
  const a=JSON.parse(readFileSync(join(dir,'base.atlas.json')));a.frames.forEach(f=>{f.frame={x:0,y:0,w:1,h:1};f.spriteSourceSize={x:0,y:0,w:1,h:1};});a.meta.size={w:1,h:1};write(join(dir,'base.atlas.json'),a);
  const cfg=config([{name:'base',atlas:'base.atlas.json',frames:[0]}]);
  await expect(run(cfg)).rejects.toThrow(/alpha.*matte|matte.*alpha/i);expect(existsSync(join(dir,'proof'))).toBe(false);
  const r=await run({...cfg,matte:'#0000ff'},'matte');const png=await sharp(r.artifacts.frames[0]).ensureAlpha().raw().toBuffer();
  expect(pixel(png,8,0,0)).toEqual([127,0,128,255]);expect(pixel(png,8,7,7)).toEqual([0,0,255,255]);
});

test('invalid config and PNG metadata fail before any output publication',async()=>{
  await exported('base','#ff004d',[[1,2],[6,4]]);
  const valid=config([{name:'base',atlas:'base.atlas.json',tag:'walk'}]);
  for(const [mutate,pattern]of [
    [c=>c.extra=true,/unknown/i],[c=>c.canvas.w=2049,/2048/],[c=>c.scale=9,/scale/],
    [c=>c.tracks[0].surprise=true,/unknown/i],[c=>c.tracks[0].x=.5,/integer/],
    [c=>c.scale=null,/scale/],[c=>c.tracks[0].x=null,/integer/],[c=>c.tracks[0].y=null,/integer/],
    [c=>c.tracks[0].loop='yes',/boolean/],[c=>c.tracks[0].frames=[0],/exactly one/],
    [c=>c.tracks=Array.from({length:17},()=>c.tracks[0]),/16/],
  ]) {const v=structuredClone(valid);mutate(v);await expect(run(v)).rejects.toThrow(pattern);expect(existsSync(join(dir,'proof'))).toBe(false);}
  const a=JSON.parse(readFileSync(join(dir,'base.atlas.json')));a.meta.image='https://example.com/image.png';write(join(dir,'base.atlas.json'),a);
  await expect(run(valid)).rejects.toThrow(/local|relative/);
  a.meta.image='base.png';a.meta.size.w++;write(join(dir,'base.atlas.json'),a);await expect(run(valid)).rejects.toThrow(/actual PNG|size/);
  a.meta.size.w--;write(join(dir,'base.atlas.json'),a);writeFileSync(join(dir,'base.png'),Buffer.from('<svg/>'));await expect(run(valid)).rejects.toThrow(/PNG/);
});

test('existing output directories, input files and symlink destinations are never touched',async()=>{
  await exported('base','#ff004d',[[1,2],[6,4]]);
  const cfg=config([{name:'base',atlas:'base.atlas.json',frames:[0]}]);
  mkdirSync(join(dir,'existing'));writeFileSync(join(dir,'existing','keep'),'kept');
  await expect(run(cfg,'existing')).rejects.toThrow(/exist/);expect(readFileSync(join(dir,'existing','keep'),'utf8')).toBe('kept');
  const before=readFileSync(join(dir,'base.png'));await expect(run(cfg,'base.png')).rejects.toThrow(/exist/);expect(readFileSync(join(dir,'base.png'))).toEqual(before);
  symlinkSync(join(dir,'existing'),join(dir,'linked'),'junction');await expect(run(cfg,'linked')).rejects.toThrow(/exist|symbolic/);
});

test('unrepresentable GIF delays and raster budgets reject instead of truncating',async()=>{
  const a=await exported('base','#ff004d',[[1,2],[6,4]],[1,99]);
  await expect(run(config([{name:'base',atlas:'base.atlas.json',tag:'walk'}]))).rejects.toThrow(/10 ms|zero|represent/);
  a.frames.forEach(f=>f.duration=100);write(join(dir,'base.atlas.json'),a);
  await expect(run({...config([{name:'base',atlas:'base.atlas.json',frames:[0,1]}]),canvas:{w:2048,h:2048},scale:8})).rejects.toThrow(/pixel|budget/);
});

test('inputs changed during encoding abort publication and clean only the owned staging directory',async()=>{
  await exported('base','#ff004d',[[1,2],[6,4]],[100,100]);
  let changed=false;
  const watcher=watch(dir,(_event,name)=>{if(String(name).includes('staging')&&!changed){changed=true;writeFileSync(join(dir,'base.png'),'changed');}});
  try {await expect(run({...config([{name:'base',atlas:'base.atlas.json',tag:'walk'}]),canvas:{w:128,h:128},scale:2})).rejects.toThrow(/changed/);}
  finally {watcher.close();}
  expect(changed).toBe(true);expect(existsSync(join(dir,'proof'))).toBe(false);expect(readdirSync(dir).filter(n=>n.includes('staging'))).toEqual([]);
});
test('a replaced staging directory is rejected and never recursively cleaned or written into',async()=>{
  await exported('base','#ff004d',[[1,2],[6,4]],[100,100]);
  let replaced;
  const watcher=watch(dir,(_event,name)=>{
    if(String(name).includes('staging')&&!replaced){
      replaced=join(dir,String(name));renameSync(replaced,join(dir,'parked-owned-staging'));
      mkdirSync(replaced);writeFileSync(join(replaced,'keep'),'replacement');
    }
  });
  try{await expect(run({...config([{name:'base',atlas:'base.atlas.json',tag:'walk'}]),canvas:{w:128,h:128}})).rejects.toThrow(/staging.*changed/i);}
  finally{watcher.close();}
  expect(replaced).toBeTruthy();expect(readdirSync(replaced)).toEqual(['keep']);
  expect(readFileSync(join(replaced,'keep'),'utf8')).toBe('replacement');expect(existsSync(join(dir,'proof'))).toBe(false);
});
test('GIF palette quantization is measured against canonical PNGs and reported honestly',async()=>{
  const c=createCanvas(16,16),ctx=c.getContext('2d');
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){ctx.fillStyle=`rgb(${x*17},${y*17},${(x+y)%16*17})`;ctx.fillRect(x,y,1,1);}
  writeFileSync(join(dir,'many.png'),c.toBuffer('image/png'));
  write(join(dir,'many.atlas.json'),{frames:[{filename:'many',frame:{x:0,y:0,w:16,h:16},sourceSize:{w:16,h:16},spriteSourceSize:{x:0,y:0,w:16,h:16},duration:100}],meta:{image:'many.png',size:{w:16,h:16}}});
  const r=await run({...config([{name:'colors',atlas:'many.atlas.json',frames:[0]}]),canvas:{w:20,h:20}});
  expect(r.gif.pixelComparison.exact).toBe(false);expect(r.gif.pixelComparison.differentPixels).toBeGreaterThan(0);expect(r.gif.pixelComparison.maxChannelError).toBeGreaterThan(0);
  const canonical=await sharp(r.artifacts.frames[0]).ensureAlpha().raw().toBuffer();expect(pixel(canonical,20,15,15)).toEqual([255,255,238,255]);
});
test('partial alpha in an input is rejected even when another track hides it',async()=>{
  const a=await exported('base','#ff004d',[[1,2]],[100]);
  const c=createCanvas(1,1),ctx=c.getContext('2d');ctx.fillStyle='rgba(255,0,0,.5)';ctx.fillRect(0,0,1,1);writeFileSync(join(dir,'base.png'),c.toBuffer('image/png'));
  a.frames.forEach(f=>{f.frame={x:0,y:0,w:1,h:1};f.spriteSourceSize={x:1,y:2,w:1,h:1};});a.meta.size={w:1,h:1};write(join(dir,'base.atlas.json'),a);
  await exported('cover','#0000ff',[[1,2]],[100]);
  await expect(run(config([{name:'base',atlas:'base.atlas.json',frames:[0]},{name:'cover',atlas:'cover.atlas.json',frames:[0]}]))).rejects.toThrow(/alpha.*matte|matte.*alpha/i);
});
test('actual atlas image sides are limited before decode allocation',async()=>{
  const a=await exported('base','#ff004d',[[1,2]],[100]);
  const c=createCanvas(2049,1);c.getContext('2d').fillRect(0,0,1,1);writeFileSync(join(dir,'base.png'),c.toBuffer('image/png'));
  a.meta.size={w:2049,h:1};write(join(dir,'base.atlas.json'),a);
  await expect(run(config([{name:'base',atlas:'base.atlas.json',frames:[0]}]))).rejects.toThrow(/2048/);
});
test('each input path is snapshotted even when directory links initially alias the same atlas',async()=>{
  await exported('base','#ff004d',[[1,2],[6,4]],[100,100]);
  const alias=join(dir,'alias'),other=join(dir,'other');mkdirSync(other);symlinkSync(dir,alias,'junction');
  writeFileSync(join(other,'base.atlas.json'),readFileSync(join(dir,'base.atlas.json')));writeFileSync(join(other,'base.png'),readFileSync(join(dir,'base.png')));
  let changed=false;
  const watcher=watch(dir,(_event,name)=>{if(String(name).includes('staging')&&!changed){changed=true;renameSync(alias,join(dir,'old-alias'));symlinkSync(other,alias,'junction');}});
  try{await expect(run(config([{name:'base',atlas:'base.atlas.json',tag:'walk'},{name:'alias',atlas:'alias/base.atlas.json',tag:'walk'}]))).rejects.toThrow(/changed/);}
  finally{watcher.close();}
  expect(changed).toBe(true);expect(existsSync(join(dir,'proof'))).toBe(false);
});

test.each(['proof.gif','proof.json'])('a foreign hardlink at fresh artifact %s cannot overwrite its external target',async(artifact)=>{
  await exported('base','#ff004d',[[1,2],[6,4]],[100,100]);
  const sentinel=join(dir,'sentinel.txt');writeFileSync(sentinel,'keep sentinel unchanged');
  let changed=false;
  const watcher=watch(dir,(_event,name)=>{if(String(name).includes('staging')&&!changed){changed=true;linkSync(sentinel,join(dir,String(name),artifact));}});
  try{await expect(run({...config([{name:'base',atlas:'base.atlas.json',tag:'walk'}]),canvas:{w:128,h:128}})).rejects.toThrow(/exist|artifact|inventory/i);}
  finally{watcher.close();}
  expect(changed).toBe(true);expect(readFileSync(sentinel,'utf8')).toBe('keep sentinel unchanged');expect(existsSync(join(dir,'proof'))).toBe(false);
});

test.each(['different length','same length'])('canonical PNG bytes changed to %s while encoding prevent publication',async(mode)=>{
  await exported('base','#ff004d',[[1,2],[6,4]],[100,100]);
  let changed=false;
  const watcher=watch(dir,(_event,name)=>{if(String(name).includes('staging')&&!changed){
    changed=true;const path=join(dir,String(name),'frames','0000.png');
    const bytes=mode==='same length'?readFileSync(path):Buffer.from('corrupted canonical PNG');bytes[0]^=255;writeFileSync(path,bytes);
  }});
  try{await expect(run({...config([{name:'base',atlas:'base.atlas.json',tag:'walk'}]),canvas:{w:128,h:128}})).rejects.toThrow(/artifact|changed/i);}
  finally{watcher.close();}
  expect(changed).toBe(true);expect(existsSync(join(dir,'proof'))).toBe(false);
});

test('an identical-byte replacement of a canonical PNG is rejected by file identity',async()=>{
  await exported('base','#ff004d',[[1,2],[6,4]],[100,100]);
  let changed=false;
  const watcher=watch(dir,(_event,name)=>{if(String(name).includes('staging')&&!changed){
    changed=true;const path=join(dir,String(name),'frames','0000.png'),bytes=readFileSync(path);
    renameSync(path,join(dir,'original-frame.png'));writeFileSync(path,bytes);
  }});
  try{await expect(run({...config([{name:'base',atlas:'base.atlas.json',tag:'walk'}]),canvas:{w:128,h:128}})).rejects.toThrow(/artifact.*identity.*changed/i);}
  finally{watcher.close();}
  expect(changed).toBe(true);expect(existsSync(join(dir,'proof'))).toBe(false);
});

test('an identical-content replacement of the frames directory is rejected by directory identity',async()=>{
  await exported('base','#ff004d',[[1,2],[6,4]],[100,100]);
  let changed=false;
  const watcher=watch(dir,(_event,name)=>{if(String(name).includes('staging')&&!changed){
    changed=true;const frames=join(dir,String(name),'frames'),original=join(dir,'original-frames');
    renameSync(frames,original);mkdirSync(frames);
    for(const file of readdirSync(original))writeFileSync(join(frames,file),readFileSync(join(original,file)));
  }});
  try{await expect(run({...config([{name:'base',atlas:'base.atlas.json',tag:'walk'}]),canvas:{w:128,h:128}})).rejects.toThrow(/frames directory changed/i);}
  finally{watcher.close();}
  expect(changed).toBe(true);expect(existsSync(join(dir,'proof'))).toBe(false);
});

test.each(['foreign.txt','frames/foreign.txt'])('foreign staging artifact %s is never adopted into a published proof',async(name)=>{
  await exported('base','#ff004d',[[1,2],[6,4]],[100,100]);
  let changed=false;
  const watcher=watch(dir,(_event,stage)=>{if(String(stage).includes('staging')&&!changed){changed=true;writeFileSync(join(dir,String(stage),name),'foreign artifact');}});
  try{await expect(run({...config([{name:'base',atlas:'base.atlas.json',tag:'walk'}]),canvas:{w:128,h:128}})).rejects.toThrow(/artifact|inventory/i);}
  finally{watcher.close();}
  expect(changed).toBe(true);expect(existsSync(join(dir,'proof'))).toBe(false);
});
