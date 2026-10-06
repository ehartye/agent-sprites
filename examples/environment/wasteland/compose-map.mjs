#!/usr/bin/env node
// Composes a small procedural map from a built wasteland sheet, the way a game would:
//   1. draw every tile as its own base material;
//   2. for each of the 8 neighbours whose material has HIGHER priority, stack that material's overlay, using the
//      tile's neighbour mask (N=1 NE=2 E=4 SE=8 S=16 SW=32 W=64 NW=128, diagonals only when both adjacent
//      cardinals are clear), at most two overlay layers per tile (the two highest priorities present).
// Writes ../preview/map-preview.png (water frame 0), tile-sheet.png (every base tile and a few overlay masks, magnified) and
// map-preview.html (the same map, with the water animated from the exported tag).
//
//   node compose-map.mjs [dist-directory]
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createCanvas,loadImage}=require(join(dirname(fileURLToPath(import.meta.url)),'../../../node_modules/canvas'));

const dist=resolve(process.argv[2]??join(dirname(fileURLToPath(import.meta.url)),'dist'));
const out=join(dist,'..','preview');mkdirSync(out,{recursive:true});
const report=JSON.parse(readFileSync(join(dist,'environment-report.json'),'utf8'));
const manifest=JSON.parse(readFileSync(join(dist,'sprite-manifest.json'),'utf8'));
const sheet=await loadImage(join(dist,`${manifest.name}.png`));
const T=report.cellSize.width,SCALE=3,ZOOM=report.pixelScale===2?SCALE:SCALE; // source pixels per tile, draw zoom
const cell=Object.fromEntries(report.frames.map(f=>[f.alias,f.cell.split(',').map(Number)]));
const variants=report.variants;

// low to high priority: a tile is overlaid by higher-priority neighbours only
const PRIORITY=['water','mud','dust','sand','clay','ash','salt-crust','gravel','tilled-soil','tilled-soil-wet','rubble','slag','fused-glass','concrete','asphalt'].filter(m=>report.materials.includes(m));
const rank=Object.fromEntries(PRIORITY.map((m,i)=>[m,i]));

// ---- procedural map: noise regions, a pond, a road, a ruined plaza, a field and a slag scar
const W=44,H=28;
let s=12345;const rnd=()=>(s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296;
const lattice=Array.from({length:17*17},()=>rnd());
const noise=(x,y,f)=>{const gx=x*f,gy=y*f,x0=Math.floor(gx),y0=Math.floor(gy),fx=gx-x0,fy=gy-y0,sm=t=>t*t*(3-2*t);
  const v=(a,b)=>lattice[((b%17)*17+(a%17))];const top=v(x0,y0)*(1-sm(fx))+v(x0+1,y0)*sm(fx),bot=v(x0,y0+1)*(1-sm(fx))+v(x0+1,y0+1)*sm(fx);return top*(1-sm(fy))+bot*sm(fy);};
const map=Array.from({length:H},(_,y)=>Array.from({length:W},(_,x)=>{
  const n=noise(x,y,.16),n2=noise(x+40,y+17,.22);
  let m='dust';
  if(n>.62)m='sand';else if(n<.26)m='clay';
  if(n2>.7)m='gravel';else if(n2<.2)m='ash';
  return m;
}));
const put=(x,y,m)=>{if(x>=0&&y>=0&&x<W&&y<H)map[y][x]=m;};
const blob=(cx,cy,rx,ry,m,seed=0)=>{for(let y=0;y<H;y++)for(let x=0;x<W;x++){const d=((x-cx)/rx)**2+((y-cy)/ry)**2+(noise(x+seed,y,.5)-.5)*.55;if(d<1)put(x,y,m);}};
blob(8,19,5.5,4,'mud',3);blob(8,19,3.6,2.5,'water',9);
blob(35,6,5,3.5,'salt-crust',5);
blob(33,21,4.5,3.5,'rubble',8);blob(33,21,2.6,2,'slag',21);
for(let x=0;x<W;x++){const y=11+Math.round(Math.sin(x*.25)*1.5);put(x,y,'asphalt');put(x,y+1,'asphalt');}
for(let y=0;y<H;y++)if(y<10||y>13)put(24,y,'asphalt');
blob(20,6,4,2.6,'concrete',2);
for(let y=17;y<=24;y++)for(let x=17;x<=26;x++)put(x,y,y>=21?'tilled-soil-wet':'tilled-soil');
blob(41,14,2.3,3,'fused-glass',31);

// ---- the composition itself (this is the part a game implements)
const BITS=[[0,-1,1],[1,-1,2],[1,0,4],[1,1,8],[0,1,16],[-1,1,32],[-1,0,64],[-1,-1,128]];
const norm=m=>{for(const [c,a,b] of [[2,1,4],[8,4,16],[32,16,64],[128,64,1]])if((m&a)||(m&b))m&=~c;return m;};
const at=(x,y)=>map[Math.min(H-1,Math.max(0,y))][Math.min(W-1,Math.max(0,x))];
const hash=(x,y,k)=>{let h=(Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(k,2147483647))>>>0;h=Math.imul(h^(h>>>13),1274126177)>>>0;return (h^(h>>>16))>>>0;};
function layers(x,y){
  const own=at(x,y),by={};
  for(const [dx,dy,bit] of BITS){const n=at(x+dx,y+dy);if(n!==own&&rank[n]>rank[own])by[n]=(by[n]??0)|bit;}
  return Object.entries(by).sort((a,b)=>rank[a[0]]-rank[b[0]]).slice(-2).map(([m,mask])=>({material:m,mask:norm(mask)})).filter(l=>l.mask);
}
const tiles=[];
for(let y=0;y<H;y++)for(let x=0;x<W;x++)tiles.push({x,y,base:at(x,y),overlays:layers(x,y).map(l=>({...l,variant:hash(x,y,rank[l.material])%variants})),variant:hash(x,y,99)%variants});

function draw(ctx,tile,frame,scale){
  const blit=(alias,dx,dy)=>{const [r,c]=cell[alias];ctx.drawImage(sheet,c*T,r*T,T,T,dx,dy,T*scale,T*scale);};
  const baseAlias=report.animations?.some(a=>a.name===tile.base)?`${tile.base}_${frame}`:`${tile.base}_${tile.variant}`;
  blit(baseAlias,tile.x*T*scale,tile.y*T*scale);
  for(const o of tile.overlays)blit(`${o.material}_${o.mask}_${o.variant}`,tile.x*T*scale,tile.y*T*scale);
}
const png=(canvas,name)=>writeFileSync(join(out,name),canvas.toBuffer('image/png'));

const map1=createCanvas(W*T*SCALE,H*T*SCALE),ctx=map1.getContext('2d');ctx.imageSmoothingEnabled=false;
for(const t of tiles)draw(ctx,t,0,SCALE);
png(map1,'map-preview.png');

// tile sheet: base tiles (all variants) then overlay masks 0..: one row per material
const cols=Math.max(variants,12),sh=createCanvas(cols*(T*2+2),(report.materials.length*2)*(T*2+2)),sc=sh.getContext('2d');
sc.imageSmoothingEnabled=false;sc.fillStyle='#202028';sc.fillRect(0,0,sh.width,sh.height);
report.materials.forEach((m,i)=>{
  const frames=report.frames.filter(f=>f.material===m&&f.role==='base');
  frames.forEach((f,k)=>{const [r,c]=cell[f.alias];sc.drawImage(sheet,c*T,r*T,T,T,k*(T*2+2),i*2*(T*2+2),T*2,T*2);});
  [1,2,4,5,16,21,64,255].forEach((mask,k)=>{
    const alias=`${m}_${mask}_0`;if(!cell[alias])return;
    const [r,c]=cell[alias],dx=k*(T*2+2),dy=(i*2+1)*(T*2+2);
    sc.fillStyle='#8f6f45';sc.fillRect(dx,dy,T*2,T*2);sc.drawImage(sheet,c*T,r*T,T,T,dx,dy,T*2,T*2);
  });
});
png(sh,'tile-sheet.png');

// html: the same composition, water animated from the exported tag
const sheetUrl='data:image/png;base64,'+readFileSync(join(dist,`${manifest.name}.png`)).toString('base64');
const water=report.animations?.find(a=>a.name==='water');
writeFileSync(join(out,'map-preview.html'),`<!doctype html><meta charset="utf-8"><title>Wasteland map preview</title>
<style>body{margin:0;background:#1b2040;color:#e3cf93;font:14px system-ui}canvas{display:block;image-rendering:pixelated;margin:12px auto}p{max-width:900px;margin:12px auto}</style>
<p>Base tile plus up to two priority-ordered overlay layers per tile. Water animates from the exported <code>water</code> tag (${water?water.fps:0} fps).</p>
<canvas id="c"></canvas><canvas id="s"></canvas>
<script>
const T=${T},Z=${SCALE},cell=${JSON.stringify(cell)},tiles=${JSON.stringify(tiles)},frames=${water?water.frames.length:1},fps=${water?water.fps:1};
const img=new Image();img.onload=()=>{
  const c=document.getElementById('c');c.width=${W}*T*Z;c.height=${H}*T*Z;const g=c.getContext('2d');g.imageSmoothingEnabled=false;
  const blit=(a,x,y)=>{const [r,k]=cell[a];g.drawImage(img,k*T,r*T,T,T,x,y,T*Z,T*Z)};
  const draw=f=>{for(const t of tiles){blit(t.base==='water'?'water_'+f:t.base+'_'+t.variant,t.x*T*Z,t.y*T*Z);for(const o of t.overlays)blit(o.material+'_'+o.mask+'_'+o.variant,t.x*T*Z,t.y*T*Z);}};
  let f=0;draw(0);setInterval(()=>{f=(f+1)%frames;draw(f)},1000/fps);
};img.src=${JSON.stringify(sheetUrl)};
</script>`);
console.log(`map-preview.png ${W*T*SCALE}x${H*T*SCALE}, ${tiles.length} tiles, ${tiles.filter(t=>t.overlays.length).length} with overlays, ${tiles.filter(t=>t.overlays.length===2).length} with two`);
