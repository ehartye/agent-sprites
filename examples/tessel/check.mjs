import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveRuntime} from '../../scripts/managed-runtime.js';
import {actions} from './poses.mjs';

const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..'),asset=join(root,'site/assets/tessel');
const runtime=resolveRuntime(root),require=createRequire(join(runtime.root,'package.json'));
const {createCanvas,loadImage}=require('canvas');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const manifest=read(join(asset,'manifest.json')),atlas=read(join(asset,'atlas.json')),normal=read(join(asset,'normal.atlas.json')),project=read(join(asset,'project.json'));
assert.equal(Object.keys(project.cells).length,128);
assert.equal(atlas.meta.frameTags.length,16);
assert.deepEqual(atlas.frames,normal.frames);
assert.deepEqual(atlas.meta.frameTags,normal.meta.frameTags);
assert.deepEqual(atlas.meta.slices,normal.meta.slices);
assert.deepEqual(project.pivot,{x:32,y:55});
for(const [name,identity] of Object.entries(manifest.integrity)){
  const bytes=readFileSync(join(asset,name));
  assert.equal(bytes.length,identity.bytes,name);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),identity.sha256,name);
}
for(const input of manifest.sourceInputs){
  const bytes=readFileSync(resolve(here,input.path));
  const rawSha256=createHash('sha256').update(bytes).digest('hex');
  assert(Number.isSafeInteger(input.bytes)&&input.bytes>=0,`${input.path} captured raw byte count`);
  if(input.normalizedTextSha256!==undefined){
    assert.match(input.normalizedTextSha256,/^[0-9a-f]{64}$/);
    const normalized=createHash('sha256').update(bytes.toString('utf8').replace(/\r\n?/g,'\n')).digest('hex');
    assert.equal(normalized,input.normalizedTextSha256,`${input.path} normalized text identity`);
  }else assert.equal(rawSha256,input.sha256,`${input.path} raw binary identity`);
  if(rawSha256===input.sha256)assert.equal(bytes.length,input.bytes,`${input.path} matching raw byte count`);
}
const pixels=async name=>{const image=await loadImage(join(asset,name)),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return{width:image.width,height:image.height,data:ctx.getImageData(0,0,image.width,image.height).data};};
const color=await pixels('sheet.png'),norm=await pixels('normal.png');
assert.equal(color.width,norm.width);assert.equal(color.height,norm.height);
for(let p=3;p<color.data.length;p+=4)assert.equal(color.data[p],norm.data[p],`paired alpha at ${p}`);
const result={ok:true,physicalSourceCells:128,tags:16,pairedAlphaPixels:color.width*color.height,boundaryPixels:0,mirrors:[],proofs:[]};
const coord=(frame,x,y)=>((frame.y+y)*color.width+frame.x+x)*4;
for(const action of actions){
  for(const side of ['right','left']){
    const tag=atlas.meta.frameTags.find(t=>t.name===`${action.id}_${side}`);
    assert(tag);
    const frames=atlas.frames.slice(tag.from,tag.to+1);
    assert.equal(frames.length,8);
    assert.deepEqual(frames.map(f=>f.duration),action.durations);
    assert.equal(tag.loop,action.loop);
    for(const frame of frames){
      const f=frame.frame;
      for(let x=0;x<64;x++)assert.equal(color.data[coord(f,x,0)+3]+color.data[coord(f,x,63)+3],0,`${action.id}_${side} vertical clipping`);
      for(let y=0;y<64;y++)assert.equal(color.data[coord(f,0,y)+3]+color.data[coord(f,63,y)+3],0,`${action.id}_${side} horizontal clipping`);
      for(let y=1;y<63;y++)for(let x=1;x<63;x++){
        const i=coord(f,x,y);
        if(color.data[i+3]&&[[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([px,py])=>!color.data[coord(f,px,py)+3])){
          result.boundaryPixels++;
          assert.deepEqual(Array.from(color.data.slice(i,i+3)),[41,34,51],`${action.id}_${side} exposed non-ink edge at ${x},${y}`);
        }
      }
    }
  }
  let alphaMismatch=0,colorMismatch=0,normalMismatch=0,maxNormalError=0;
  for(let f=0;f<8;f++){
    const r=atlas.frames.find(frame=>frame.filename===`${action.id}_right_${f+1}`).frame;
    const l=atlas.frames.find(frame=>frame.filename===`${action.id}_left_${f+1}`).frame;
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){
      const ri=coord(r,x,y),li=coord(l,63-x,y);
      if(color.data[ri+3]!==color.data[li+3])alphaMismatch++;
      if(color.data[ri+3]){
        if([0,1,2].some(c=>color.data[ri+c]!==color.data[li+c]))colorMismatch++;
        const expected=[norm.data[ri]===128?128:255-norm.data[ri],norm.data[ri+1],norm.data[ri+2]];
        const error=Math.max(...expected.map((v,c)=>Math.abs(v-norm.data[li+c])));
        maxNormalError=Math.max(maxNormalError,error);
        if(error>1)normalMismatch++;
      }
    }
  }
  result.mirrors.push({action:action.id,alphaMismatch,colorMismatch,normalMismatch,maxNormalError});
  assert.equal(alphaMismatch,0,`${action.id} mirror alpha`);
  assert.equal(colorMismatch,0,`${action.id} mirror color`);
  assert.equal(normalMismatch,0,`${action.id} mirror normal handedness`);
  const proof=read(join(asset,'actions',action.id,'proof.json'));
  assert.equal(proof.ok,true);
  assert.equal(proof.gif.pages,8);
  assert.equal(proof.gif.driftMs,0);
  assert.equal(proof.loop,action.loop);
  for(const input of proof.provenance.inputs){
    const bytes=readFileSync(join(asset,'actions',action.id,input.path));
    assert.equal(bytes.length,input.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),input.sha256);
  }
  result.proofs.push({action:action.id,durationMs:proof.durationMs,loop:proof.loop,driftMs:proof.gif.driftMs,pixelComparison:proof.gif.pixelComparison});
}
for(const cell of Object.values(project.cells)){
  assert(cell.lighting);
  assert.equal(new Set(cell.shapes.map(s=>s.name)).size,cell.shapes.length);
  assert.equal(cell.shapes.filter(s=>s.params.surface?.lamps?.length).length,1);
  assert.equal(new Set(cell.shapes.filter(s=>s.name.includes('paddle')).map(s=>s.params.composition.part)).size,6);
}
assert.equal(project.constructionReplay.records.length,4);
writeFileSync(join(here,'.raw-check.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
