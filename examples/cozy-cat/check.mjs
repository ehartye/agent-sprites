import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveRuntime} from '../../scripts/managed-runtime.js';
import {rasterShape} from '../../server/web/public/js/shared/raster.js';
import {catParts,C} from './art.mjs';
import {timeline} from './timeline.mjs';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../..'),asset=join(root,'site/assets/cozy-cat');
const runtime=resolveRuntime(root),require=createRequire(join(runtime.root,'package.json')),{createCanvas,loadImage}=require('canvas');
const read=p=>JSON.parse(readFileSync(p,'utf8')),hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=read(join(asset,'manifest.json')),atlas=read(join(asset,'atlas.json')),normal=read(join(asset,'normal.atlas.json')),project=read(join(asset,'project.json')),proof=read(join(asset,'proof.json'));
assert.equal(Object.keys(project.cells).length,80);assert.deepEqual(project.pivot,{x:0,y:0});
assert.equal(atlas.meta.frameTags.length,1);assert.deepEqual(atlas.frames,normal.frames);assert.deepEqual(atlas.meta.frameTags,normal.meta.frameTags);assert.deepEqual(atlas.meta.slices,normal.meta.slices);
const tag=atlas.meta.frameTags[0],frames=atlas.frames.slice(tag.from,tag.to+1);
assert.equal(tag.name,'little_morning');assert.equal(tag.loop,true);assert.equal(frames.length,80);assert(frames.every(f=>f.duration===100));
for(const [name,identity] of Object.entries(manifest.integrity)){const bytes=readFileSync(join(asset,name));assert.equal(bytes.length,identity.bytes,name);assert.equal(hash(bytes),identity.sha256,name);}
for(const input of manifest.sourceInputs){const bytes=readFileSync(resolve(here,input.path));assert.match(input.normalizedTextSha256,/^[0-9a-f]{64}$/);assert.equal(hash(bytes.toString('utf8').replace(/\r\n?/g,'\n')),input.normalizedTextSha256,input.path);if(hash(bytes)===input.sha256)assert.equal(bytes.length,input.bytes);}
const pixels=async name=>{const image=await loadImage(join(asset,name)),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return{width:image.width,height:image.height,data:ctx.getImageData(0,0,image.width,image.height).data};};
const color=await pixels('sheet.png'),norm=await pixels('normal.png');assert.equal(color.width,norm.width);assert.equal(color.height,norm.height);
let modeledNormalPixels=0;
for(let i=3;i<color.data.length;i+=4){assert.equal(color.data[i],255);assert.equal(norm.data[i],color.data[i]);if(norm.data[i-3]!==128||norm.data[i-2]!==128||norm.data[i-1]!==255)modeledNormalPixels++;}
assert(modeledNormalPixels>1000);
const at=(f,x,y)=>((f.y+y)*color.width+f.x+x)*4;
let seamDifferences=0;
for(let y=0;y<112;y++)for(let x=0;x<160;x++){const a=at(frames[0].frame,x,y),b=at(frames[79].frame,x,y);if([0,1,2,3].some(c=>color.data[a+c]!==color.data[b+c]))seamDifferences++;}
assert.equal(seamDifferences,0,'last source pose equals first at the loop seam');
let catBoundaryPixels=0;
for(const pose of timeline){
  const cat=catParts(pose),coverage=new Map();
  for(const placement of cat.placements)for(const shape of cat.parts[placement.part].shapes){const px=(x,y)=>coverage.set(`${x},${y}`,shape.color);rasterShape(shape.type,shape.params,{px,rect:(x,y,w,h)=>{for(let py=y;py<y+h;py++)for(let px2=x;px2<x+w;px2++)px(px2,py);}});}
  for(const [key,color] of coverage){const [x,y]=key.split(',').map(Number);assert(x>0&&x<159&&y>0&&y<111,`cat cropped in frame ${pose.frame} at ${key}`);if([[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([a,b])=>!coverage.has(`${a},${b}`))){catBoundaryPixels++;assert.equal(color,C.ink,`cat exposed non-ink edge in ${pose.frame} at ${key}`);}}
  if(['walk','low','stretch'].includes(pose.form)){const paws=Object.values(cat.paws);assert(paws.some(([,y])=>y===pose.y),`ground contact missing at ${pose.frame}`);}
}
for(const contact of manifest.contacts)assert(contact.centerDistance<=8,`paw contact is too far from yarn at frame ${contact.frame}`);
assert.deepEqual(timeline[33].ball,{x:112,y:88,spin:0});assert.equal(timeline[34].ball.x,115);
assert.equal(timeline[41].ball.x,136);assert.equal(timeline[42].ball.x,136);assert.equal(timeline[43].ball.x,139);
const maxBallStep=Math.max(...timeline.slice(1).map((pose,i)=>Math.hypot(pose.ball.x-timeline[i].ball.x,pose.ball.y-timeline[i].ball.y)));assert(maxBallStep<=9,'ball teleports between source frames');
assert.equal(proof.ok,true);assert.equal(proof.frameCount,80);assert.equal(proof.durationMs,8000);assert.equal(proof.loop,true);assert.equal(proof.gif.pages,80);assert.equal(proof.gif.driftMs,0);assert.deepEqual(proof.gif.delaysMs,Array(80).fill(100));
for(const input of proof.provenance.inputs){const bytes=readFileSync(join(asset,input.path));assert.equal(bytes.length,input.bytes);assert.equal(hash(bytes),input.sha256);}
for(const cell of Object.values(project.cells)){assert(cell.lighting);assert.equal(new Set(cell.shapes.map(s=>s.name)).size,cell.shapes.length);assert.equal(cell.shapes.filter(s=>s.params.surface?.lamps?.length).length,1);}
const result={ok:true,sourceFrames:80,durationMs:8000,tag:'little_morning',pairedAlphaPixels:color.width*color.height,modeledNormalPixels,catBoundaryPixels,seamDifferences,maxBallStep,contacts:manifest.contacts,gif:proof.gif.pixelComparison,driftMs:proof.gif.driftMs};
writeFileSync(join(here,'.raw-check.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
