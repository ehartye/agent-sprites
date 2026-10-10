#!/usr/bin/env node
// Composes the same coast twice, the way a game would, and writes before.png (classic overlays: one pinned depth at every tile
// border, a per-cell profile) and after.png (overlayEdge.world: the depth where a band crosses a tile border is a level chosen at
// the lattice vertex from a world-space function, so the bands of neighbouring tiles meet there and the coast wanders along its
// whole length) plus compare.png, both stacked with a label gap.
//
//   node build classic.json and world.json first:
//     agent-sprites build classic.json && agent-sprites build world.json
//   node compose-coast.mjs [out-directory]
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const here=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url);
const {createCanvas,loadImage}=require(join(here,'../../../node_modules/canvas'));
const {worldLevel}=await import(pathToFileURL(join(here,'../../../server/authoring/environment-world-edge.js')).href);
const out=resolve(process.argv[2]??join(here,'preview'));mkdirSync(out,{recursive:true});

const load=async dir=>{
  const report=JSON.parse(readFileSync(join(here,dir,'environment-report.json'),'utf8'));
  const manifest=JSON.parse(readFileSync(join(here,dir,'sprite-manifest.json'),'utf8'));
  return {report,sheet:await loadImage(join(here,dir,`${manifest.name}.png`)),cell:Object.fromEntries(report.frames.map(f=>[f.alias,f.cell.split(',').map(Number)]))};
};
const classic=await load('dist-classic'),world=await load('dist-world');
const T=classic.report.cellSize.width,Z=3,W=44,H=20;

// the map: water, sand shore, dust inland, from smooth tile noise
const hash=(x,y,k)=>{let h=(Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(k,2147483647))>>>0;h=Math.imul(h^(h>>>13),1274126177)>>>0;return (h^(h>>>16))>>>0;};
const vn=(x,y,f,k)=>{const gx=x*f,gy=y*f,x0=Math.floor(gx),y0=Math.floor(gy),fx=gx-x0,fy=gy-y0,s=t=>t*t*(3-2*t),v=(a,b)=>hash(a,b,k)/4294967296;
  const top=v(x0,y0)*(1-s(fx))+v(x0+1,y0)*s(fx),bot=v(x0,y0+1)*(1-s(fx))+v(x0+1,y0+1)*s(fx);return top*(1-s(fy))+bot*s(fy);};
const map=Array.from({length:H},(_,y)=>Array.from({length:W},(_,x)=>{
  const n=vn(x,y,.11,1)*.75+vn(x,y,.3,2)*.25;
  return n<.43?'water':n<.52?'sand':n<.64?'dust':'sand';
}));
const rank={water:0,sand:1,dust:2};
const at=(x,y)=>map[Math.min(H-1,Math.max(0,y))][Math.min(W-1,Math.max(0,x))];
const BITS=[[0,-1,1],[1,-1,2],[1,0,4],[1,1,8],[0,1,16],[-1,1,32],[-1,0,64],[-1,-1,128]];
const norm=m=>{for(const [c,a,b] of [[2,1,4],[8,4,16],[32,16,64],[128,64,1]])if((m&a)||(m&b))m&=~c;return m;};
function layers(x,y){
  const own=at(x,y),by={};
  for(const [dx,dy,bit] of BITS){const n=at(x+dx,y+dy);if(n!==own&&rank[n]>rank[own])by[n]=(by[n]??0)|bit;}
  return Object.entries(by).sort((a,b)=>rank[a[0]]-rank[b[0]]).map(([material,mask])=>({material,mask:norm(mask)})).filter(l=>l.mask);
}

// world mode: one level per lattice vertex, from a function of the world position
const LV=world.report.world.levels,level=(vx,vy)=>worldLevel(vx,vy,{levels:LV,wavelength:46,seed:5});
function worldAlias(tx,ty,own,o){
  // sand over water has its own reach (a pair); dust over sand is the rimless soft twin
  const stem=o.material==='sand'&&own==='water'?'sand-on-water':o.material==='dust'&&own==='sand'?'dust-soft':o.material;
  const set=world.report.world.lookup[stem]?.[o.mask];
  if(!set)return null;
  const corners=[level(tx,ty),level(tx+1,ty),level(tx+1,ty+1),level(tx,ty+1)];
  // keys name the levels of the corners the mask touches and a dash for the others; a mask with many corners has only "-,-,-,-"
  const [shape]=Object.keys(set).slice(0,1),key=shape.split(',').map((k,i)=>k==='-'?'-':corners[i]).join(',');
  const list=set[key];
  return list?list[hash(tx,ty,7)%list.length]:null;
}

function render(pack,aliasOf){
  const c=createCanvas(W*T*Z,H*T*Z),g=c.getContext('2d');g.imageSmoothingEnabled=false;
  const blit=(a,x,y)=>{if(!a)return;const [r,k]=pack.cell[a];g.drawImage(pack.sheet,k*T,r*T,T,T,x*T*Z,y*T*Z,T*Z,T*Z);};
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const own=at(x,y);
    blit(own==='water'?'water_0':`${own}_${hash(x,y,99)%3}`,x,y);
    for(const o of layers(x,y))blit(aliasOf(x,y,own,o),x,y);
  }
  return c;
}
const before=render(classic,(x,y,own,o)=>{
  const soft=o.material==='dust'&&own==='sand';
  return `${o.material}${soft?'-soft':''}_${o.mask}_${hash(x,y,rank[o.material])%3}`;
});
const after=render(world,worldAlias);
const png=(c,n)=>writeFileSync(join(out,n),c.toBuffer('image/png'));
png(before,'before.png');png(after,'after.png');
const both=createCanvas(before.width,before.height*2+8),bg=both.getContext('2d');bg.fillStyle='#202028';bg.fillRect(0,0,both.width,both.height);
bg.drawImage(before,0,0);bg.drawImage(after,0,before.height+8);png(both,'compare.png');
console.log(`wrote before.png, after.png, compare.png in ${out} (${W}x${H} tiles at ${Z}x)`);
