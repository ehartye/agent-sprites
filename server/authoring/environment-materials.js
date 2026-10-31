// Pixel-grid terrain materials: the wasteland set and user-defined materials share one engine.
//
// A material is data: a four-colour ramp [base, dark, light, bright] (optionally a fifth, `deep`, the darkest step, drawn only
// by patterns with tone 'deep'), optional `rimRoles` {light, dark} for overlay rims, plus a short list of patterns. Everything is
// authored on a 16x16 source grid (a 32x32 screen tile at pixelScale 2; at pixelScale 1 every source pixel is 2x2).
// The outer row and column ring is canonical for a material: opposite edges match, and by default (`grain` lattice) every
// variant shares the same edge marks, so any variant tiles beside any other. `grain` none leaves the ring bare and soft seeds
// the ring marks per variant so they do not form a grid. Patterns stay inside the interior (2..13) and never touch the ring.
import {randomFor} from './environment-terrain.js';

export const GRID=16;
/** The first ten pattern kinds, pinned by the golden tests; the layered-rock kinds below were added after them. */
export const PATTERN_KINDS=['speckle','clusters','cracks','panels','ripples','furrows','polygons','bubbles','streaks','stripe'];
/** Pattern kinds that also draw different marks in every variant: bedding (wavering lit and shade hairlines), crystals (small lit clusters, each with a shade pixel) and sheen (a thin glint line). */
export const LAYER_PATTERN_KINDS=['bedding','crystals','sheen'];
export const ALL_PATTERN_KINDS=[...PATTERN_KINDS,...LAYER_PATTERN_KINDS];
export const GRAINS=['none','soft','lattice'];
const TONES=['mixed','dark','light','bright','deep'];
const PATTERN_FIELDS={
  speckle:['density','tone'],clusters:['density','tone','size','shade'],cracks:['density'],panels:['cols'],ripples:['density'],
  furrows:['density'],polygons:['density'],bubbles:['density'],streaks:['density','tone'],stripe:['color'],
  bedding:['density','tone'],crystals:['density','tone'],sheen:['density'],
};
const LIT_TONES=['mixed','light','bright'];
const HEX=/^#[0-9a-fA-F]{6}$/;

const m=(ramp,patterns,extra={})=>({ramp,patterns,...extra});
/** Built-in wasteland materials, in stable export order. */
export const WASTELAND_SPECS={
  dust:m(['#c9a869','#b08d57','#e3cf93','#e3cf93'],[{kind:'speckle',density:.5},{kind:'clusters',density:.3,tone:'mixed'}]),
  sand:m(['#e3cf93','#c9a869','#e3cf93','#e3cf93'],[{kind:'speckle',density:.35,tone:'dark'},{kind:'streaks',density:.4,tone:'dark'}]),
  gravel:m(['#85847c','#5f5f5a','#a8a79e','#c4c3ba'],[{kind:'clusters',density:.9,shade:true},{kind:'speckle',density:.25,tone:'dark'}]),
  rubble:m(['#85847c','#5f5f5a','#a8a79e','#b5532f'],[{kind:'clusters',density:.45,size:'large',shade:true},{kind:'cracks',density:.35},{kind:'speckle',density:.2,tone:'bright'}]),
  concrete:m(['#a8a79e','#85847c','#c4c3ba','#c4c3ba'],[{kind:'panels',cols:2},{kind:'cracks',density:.35},{kind:'speckle',density:.25,tone:'dark'}]),
  asphalt:m(['#3c3c3a','#26262a','#5f5f5a','#c58f2c'],[{kind:'speckle',density:.4,tone:'light'},{kind:'cracks',density:.4,variants:[1,2]},{kind:'stripe',variants:[3]}]),
  ash:m(['#5f5f5a','#3c3c3a','#85847c','#a8a79e'],[{kind:'speckle',density:.45},{kind:'clusters',density:.3,tone:'light'}]),
  mud:m(['#6b5033','#4a3624','#8f6f45','#b08d57'],[{kind:'clusters',density:.45,tone:'mixed'},{kind:'speckle',density:.2,tone:'bright'}]),
  slag:m(['#3c3c3a','#26262a','#5f5f5a','#e08a2c'],[{kind:'clusters',density:.45,shade:true},{kind:'bubbles',density:.5},{kind:'speckle',density:.12,tone:'bright'}]),
  'fused-glass':m(['#3f6f68','#2a4a4a','#5f9a8d','#8fc4b4'],[{kind:'streaks',density:.6,tone:'light'},{kind:'cracks',density:.3},{kind:'speckle',density:.15,tone:'bright'}]),
  'salt-crust':m(['#c4c3ba','#a8a79e','#e3cf93','#e3cf93'],[{kind:'polygons',density:.7},{kind:'speckle',density:.25,tone:'light'}]),
  clay:m(['#b5532f','#8c3b25','#d98b4a','#d98b4a'],[{kind:'cracks',density:.8},{kind:'clusters',density:.3,tone:'light'}]),
  water:m(['#5f9a8d','#3f6f68','#8fc4b4','#8fc4b4'],[{kind:'ripples',density:.6},{kind:'speckle',density:.2,tone:'dark'}],{animated:true,fps:4,edgeMarks:false}),
  'tilled-soil':m(['#8f6f45','#6b5033','#b08d57','#c9a869'],[{kind:'furrows',density:.6},{kind:'speckle',density:.25,tone:'dark'}]),
  'tilled-soil-wet':m(['#4a3624','#33261a','#6b5033','#8fc4b4'],[{kind:'furrows',density:.6},{kind:'speckle',density:.3,tone:'bright'}]),
};
export const WASTELAND_MATERIALS=Object.keys(WASTELAND_SPECS);
export const ANIMATION_FRAMES=4;
/** An animated material may declare `variants`: that many looks of its four-frame loop, each with its own arrangement and ripple phase. */
export const MAX_ANIMATED_VARIANTS=4;

const isObject=v=>v&&typeof v==='object'&&!Array.isArray(v);
function validatePattern(p,where){
  if(!isObject(p))throw Error(`${where} must be an object`);
  if(!ALL_PATTERN_KINDS.includes(p.kind))throw Error(`${where} kind must be one of ${ALL_PATTERN_KINDS.join(', ')}`);
  const allowed=['kind','variants',...PATTERN_FIELDS[p.kind]];
  for(const key of Object.keys(p))if(!allowed.includes(key))throw Error(`Unknown ${where} field for ${p.kind}: ${key}`);
  if(p.variants!==undefined&&['panels','furrows'].includes(p.kind))throw Error(`${where} variants cannot restrict ${p.kind}: it draws the shared edge rows`);
  if(p.density!==undefined&&(typeof p.density!=='number'||!(p.density>=.05&&p.density<=1)))throw Error(`${where} density must be a number from 0.05 to 1`);
  if(p.tone!==undefined&&!TONES.includes(p.tone))throw Error(`${where} tone must be ${TONES.join(', ')}`);
  if(p.tone!==undefined&&['bedding','crystals'].includes(p.kind)&&!LIT_TONES.includes(p.tone))throw Error(`${where} tone for ${p.kind} must be ${LIT_TONES.join(', ')}: its shade pixels are always the dark step`);
  if(p.size!==undefined&&!['small','large'].includes(p.size))throw Error(`${where} size must be small or large`);
  if(p.shade!==undefined&&typeof p.shade!=='boolean')throw Error(`${where} shade must be a boolean`);
  if(p.cols!==undefined&&![1,2].includes(p.cols))throw Error(`${where} cols must be 1 or 2`);
  if(p.color!==undefined&&(typeof p.color!=='string'||!HEX.test(p.color)))throw Error(`${where} color must be a #rrggbb hex color`);
  if(p.variants!==undefined&&(!Array.isArray(p.variants)||!p.variants.length||p.variants.length>8||p.variants.some(v=>!Number.isInteger(v)||v<0||v>7)))throw Error(`${where} variants must be a nonempty array of variant numbers 0 to 7`);
}

/** Strictly validate and normalise one inline custom material. */
export function validateCustomMaterial(def,builtin){
  if(!isObject(def))throw Error('Each custom material must be an object');
  for(const key of Object.keys(def))if(!['name','ramp','patterns','seed','animated','fps','rimRoles','grain','variants'].includes(key))throw Error(`Unknown custom material field: ${key}`);
  if(typeof def.name!=='string'||!/^[a-z][a-z0-9-]{0,31}$/.test(def.name))throw Error('Custom material name must be lowercase letters, digits and hyphens, starting with a letter (no underscores)');
  if(builtin.includes(def.name))throw Error(`Custom material ${def.name} collides with a built-in material`);
  const where=`custom material ${def.name}`;
  if(!Array.isArray(def.ramp)||![4,5].includes(def.ramp.length)||def.ramp.some(c=>typeof c!=='string'||!HEX.test(c)))throw Error(`${where} ramp must be four or five #rrggbb colors: base, dark, light, bright and optionally deep`);
  if(def.rimRoles!==undefined){
    const r=def.rimRoles;
    if(!isObject(r))throw Error(`${where} rimRoles must be an object with light and dark #rrggbb colors`);
    for(const key of Object.keys(r))if(!['light','dark'].includes(key))throw Error(`Unknown ${where} rimRoles field: ${key}`);
    for(const key of ['light','dark'])if(typeof r[key]!=='string'||!HEX.test(r[key]))throw Error(`${where} rimRoles ${key} must be a #rrggbb hex color`);
  }
  if(!Array.isArray(def.patterns)||!def.patterns.length||def.patterns.length>6)throw Error(`${where} patterns must be an array of 1 to 6 patterns`);
  def.patterns.forEach((p,i)=>{
    validatePattern(p,`${where} pattern ${i}`);
    if(p.tone==='deep'&&def.ramp.length<5)throw Error(`${where} pattern ${i} tone deep needs a fifth ramp colour (deep)`);
  });
  if(def.grain!==undefined&&!GRAINS.includes(def.grain))throw Error(`${where} grain must be ${GRAINS.join(', ')}`);
  if(def.seed!==undefined&&!Number.isSafeInteger(def.seed))throw Error(`${where} seed must be a safe integer`);
  if(def.animated!==undefined&&typeof def.animated!=='boolean')throw Error(`${where} animated must be a boolean`);
  if(def.animated&&!def.patterns.some(p=>p.kind==='ripples'))throw Error(`${where} animated requires a ripples pattern`);
  if(def.fps!==undefined&&(!def.animated||!Number.isFinite(def.fps)||def.fps<1||def.fps>60))throw Error(`${where} fps must be 1 to 60 and applies only to animated materials`);
  if(def.variants!==undefined&&(!def.animated||!Number.isInteger(def.variants)||def.variants<1||def.variants>MAX_ANIMATED_VARIANTS))throw Error(`${where} variants must be an integer from 1 to ${MAX_ANIMATED_VARIANTS} and applies only to animated materials`);
  return {name:def.name,ramp:def.ramp.map(c=>c.toLowerCase()),patterns:def.patterns.map(p=>({...p,...(p.color?{color:p.color.toLowerCase()}:{})})),seed:def.seed??0,animated:!!def.animated,fps:def.fps??4,
    ...(def.rimRoles?{rimRoles:{light:def.rimRoles.light.toLowerCase(),dark:def.rimRoles.dark.toLowerCase()}}:{}),...(def.grain!==undefined?{grain:def.grain}:{}),...(def.variants!==undefined?{variants:def.variants}:{})};
}

const luma=hex=>.299*parseInt(hex.slice(1,3),16)+.587*parseInt(hex.slice(3,5),16)+.114*parseInt(hex.slice(5,7),16);
/** Avalanche mix of a 32-bit integer, so neighbouring seeds and variant numbers give unrelated streams. */
const mix32=n=>{n=Math.imul(n^n>>>16,0x85ebca6b);n=Math.imul(n^n>>>13,0xc2b2ae35);return (n^n>>>16)>>>0;};
/** A seeded stream for one pattern of one variant (mulberry32); a variant of -1 gives the stream every variant shares. */
const noiseStream=(seed,materialSeed,name,variant,index)=>{
  let a=mix32((seed^mix32(materialSeed>>>0)^mix32(hash(name)+0x1234567)^mix32(Math.imul(variant+1,0x9e3779b1)^Math.imul(index+1,0x85ebca6b)))>>>0);
  return ()=>{a=(a+0x6d2b79f5)>>>0;let t=Math.imul(a^a>>>15,1|a);t=(t+Math.imul(t^t>>>7,61|t))^t;return ((t^t>>>14)>>>0)/4294967296;};
};
const hash=s=>[...s].reduce((h,ch)=>(Math.imul(h,31)+ch.charCodeAt(0))>>>0,7);

const lowerTiles=new WeakMap();
/** A finished tile of a lower variant, cached per material spec, so a higher variant can keep its marks off the ones already drawn. */
function lowerTile(name,spec,variant,seed,frame){
  if(!lowerTiles.has(spec))lowerTiles.set(spec,new Map());
  const cache=lowerTiles.get(spec),key=`${name}|${seed}|${variant}|${frame}`;
  if(!cache.has(key))cache.set(key,materialTile(name,spec,variant,seed,frame));
  return cache.get(key);
}

/** One material tile: GRID*GRID hex colors, row-major. `frame` selects the ripple phase of an animated material. */
export function materialTile(name,spec,variant,seed,frame=0){
  // a fifth ramp colour is `deep`, the darkest step below `dark`; it is drawn only where a pattern asks for tone 'deep'
  const [base,dark,light,bright,deep]=spec.ramp,tones={dark,light,bright,base,deep};
  // an animated material shows one look for every variant argument (the argument is then its frame index) unless it declares
  // `variants`: then `variant` is the look, `frame` the ripple phase, and the look also shifts the phase of the loop
  const animated=!!spec.animated,looks=animated&&spec.variants!==undefined,v=animated&&!looks?0:variant;
  const random=randomFor((seed^Math.imul(spec.seed??0,0x9e3779b1))>>>0,v+hash(name)%9973*29);
  const ri=(lo,hi)=>lo+Math.floor(random()*(hi-lo+1));
  const px=Array(GRID*GRID).fill(base),occ=Array(GRID*GRID).fill(false);
  const set=(x,y,c)=>{if(x>=1&&y>=1&&x<=GRID-2&&y<=GRID-2)px[y*GRID+x]=c;};
  const free=(x,y,w,h)=>{for(let yy=y-1;yy<=y+h;yy++)for(let xx=x-1;xx<=x+w;xx++)if(xx>=0&&yy>=0&&xx<GRID&&yy<GRID&&occ[yy*GRID+xx])return false;return true;};
  const reserve=(x,y,w,h)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)occ[yy*GRID+xx]=true;};
  const place=(w,h,lo=2,hi=13)=>{
    for(let attempt=0;attempt<10;attempt++){
      const x=ri(lo,hi-w+1),y=ri(lo,hi-h+1);
      if(free(x,y,w,h)){reserve(x,y,w,h);return [x,y];}
    }
    return null;
  };
  const count=(k,p)=>Math.max(1,Math.round(k*(p.density??.5)*(.75+.17*v)));
  const toneAt=(p,i,fallback='mixed')=>{const t=p.tone??fallback;return t==='mixed'?(i%3?light:dark):tones[t];};
  // Per-variant noise seed. Bedding, crystals and sheen draw from `noiseStream`, mixed from the environment seed, the material seed
  // and name, the variant and the pattern, so every variant has its own tone field and marks. Variants also avoid each other: a
  // variant replays the marks of the lower variants of the same material (they are deterministic) and, for each mark it places, takes
  // the best of several candidates by how few of those cells it covers, so three variants share few mark positions.
  const noiseFor=(vv,pi)=>{const r=noiseStream(seed,spec.seed??0,name,vv,pi);return {r,ri:(lo,hi)=>lo+Math.floor(r()*(hi-lo+1))};};
  const lightest=[base,dark,light,bright].reduce((a,c)=>luma(c)>luma(a)?c:a);
  const LAYERS={
    // a lit hairline stepping one row up or down once or twice, with a shade hairline under most of it
    bedding(p,i,n){
      const litC=p.tone==='bright'||(p.tone==='mixed'&&i%3===1)?bright:light,len=n.ri(6,10),x0=n.ri(2,14-len),y0=n.ri(2,11);
      const dir=n.r()<.5?1:-1,steps=[x0+n.ri(2,len-4)];
      if(len>=8&&steps[0]+2<=x0+len-2&&n.r()<.5)steps.push(n.ri(steps[0]+2,Math.min(steps[0]+3,x0+len-2)));
      const rowA=dir>0?y0:y0+1,rowB=dir>0?y0+1:y0,rowAt=x=>rowA+(steps.filter(st=>x>=st).length%2?rowB-rowA:0);
      const s0=x0+n.ri(0,2),s1=x0+len-1-n.ri(0,2),cells=[];
      for(let x=x0;x<x0+len;x++){cells.push([x,rowAt(x),litC]);if(x>=s0&&x<=s1)cells.push([x,rowAt(x)+1,dark]);}
      return {cells,box:[x0,y0,len,3]};
    },
    // a lit block or shard with two shade pixels on its lower right, so the shade is not a stray
    crystals(p,i,n){
      const shard=i%3===1,w=shard?n.ri(1,2):n.ri(2,3),h=shard?3:n.ri(1,2),bw=shard?w+1:Math.max(w,3),bh=shard?h:h+1;
      const x=n.ri(2,13-bw+1),y=n.ri(2,13-bh+1),litC=p.tone==='bright'||(p.tone==='mixed'&&i%3===0)?bright:light,cells=[];
      for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
        if(((shard&&w===2)||(!shard&&w===3&&h===2))&&xx===w-1&&yy===0)continue;
        cells.push([x+xx,y+yy,litC]);
      }
      if(shard)cells.push([x+w,y+1,dark],[x+w,y+2,dark]);else cells.push([x+1,y+h,dark],[x+2,y+h,dark]);
      return {cells,box:[x,y,bw,bh]};
    },
    // a rising glint: a one pixel line of the lightest step with a softer shoulder below it
    sheen(p,i,n){
      const c=8+n.ri(0,14),lo=Math.max(2,c-13),hi=Math.min(13,c-2),len=Math.min(hi-lo+1,n.ri(6,9)),xs=n.ri(lo,hi-len+1),cells=[];
      for(let k=0;k<len;k++){
        cells.push([xs+k,c-xs-k,lightest]);
        if(k>0&&k<len-1&&light!==lightest)cells.push([xs+k,c-xs-k+1,light]);
      }
      return {cells,box:[xs,c-xs-len+1,len,len]};
    },
  };
  const LAYER_COUNT={bedding:(p,vv)=>Math.min(3,Math.max(1,Math.round(3*(p.density??.5)*(.75+.17*vv)))),crystals:(p,vv)=>Math.max(1,Math.round(5*(p.density??.5)*(.75+.17*vv))),sheen:p=>(p.density??.5)>=.65?2:1};
  /** The marks of one layered pattern in one variant, each the candidate that covers the fewest `taken` cells; `accept` may veto a candidate. */
  const layerMarks=(p,pi,vv,taken,accept)=>{
    const n=noiseFor(vv,pi),made=[];
    for(let i=0,total=LAYER_COUNT[p.kind](p,vv);i<total;i++){
      let best=null,bestScore=Infinity;
      for(let attempt=0;attempt<48&&bestScore>0;attempt++){
        const cand=LAYERS[p.kind](p,i,n),[bx,by,bw,bh]=cand.box;
        if(made.some(m=>bx<m.box[0]+m.box[2]+1&&m.box[0]<bx+bw+1&&by<m.box[1]+m.box[3]+1&&m.box[1]<by+bh+1))continue;
        if(accept&&!accept(cand))continue;
        const score=cand.cells.reduce((a,[x,y])=>a+(taken.has(y*GRID+x)?1:0),0);
        if(score<bestScore){best=cand;bestScore=score;}
      }
      if(best)made.push(best);
    }
    return made;
  };
  // every interior cell the lower variants of this material actually drew, read back from their finished tiles
  let lower=null;
  const lowerCells=()=>{
    if(lower)return lower;
    lower=new Set();
    for(let u=0;u<v;u++){
      const t=lowerTile(name,spec,u,seed,frame);
      for(let y=1;y<GRID-1;y++)for(let x=1;x<GRID-1;x++)if(t[y*GRID+x]!==base)lower.add(y*GRID+x);
    }
    return lower;
  };
  const drawLayer=(p,pi)=>{
    // sheen crosses other patterns cell by cell; bedding and crystals take clear ground
    const sheen=p.kind==='sheen';
    for(const m of layerMarks(p,pi,v,lowerCells(),sheen?null:cand=>free(...cand.box))){
      const own=sheen?m.cells.filter(([x,y])=>free(x,y,1,1)):m.cells;
      if(!sheen)reserve(...m.box);
      for(const [x,y,col] of own){set(x,y,col);if(sheen)occ[y*GRID+x]=true;}
    }
  };
  for(const [pi,p] of spec.patterns.entries()){
    if(p.variants&&!p.variants.includes(variant))continue;
    if(p.kind==='speckle'){
      for(let i=0;i<count(8,p);i++){const at=place(2,1);if(!at)continue;set(at[0],at[1],toneAt(p,i));set(at[0]+1,at[1],toneAt(p,i));}
    }else if(p.kind==='clusters'){
      const large=p.size==='large';
      for(let i=0;i<count(8,p);i++){
        const w=large?ri(3,5):ri(2,3),h=large?ri(2,3):ri(1,2),at=place(w,h+(p.shade?1:0));
        if(!at)continue;
        const [x,y]=at,tone=p.shade?light:toneAt(p,i);
        for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
          if(w>=3&&h>=2&&(xx===0||xx===w-1)&&(yy===0||yy===h-1)&&(xx+yy+i)%2===0)continue;
          set(x+xx,y+yy,tone);
        }
        if(p.shade)for(let xx=1;xx<w;xx++)set(x+xx,y+h,dark);
        if(p.shade&&i%4===0)for(let xx=0;xx<Math.min(2,w);xx++)set(x+xx,y,bright);
      }
    }else if(p.kind==='cracks'){
      for(let i=0;i<count(3,p);i++){
        let x=ri(4,11),y=ri(4,11),dx=random()<.5?1:-1,dy=0;
        if(random()<.5){dy=dx;dx=0;}
        const len=ri(5,9),pts=[];
        for(let s=0;s<len;s++){
          if(x<2||y<2||x>13||y>13)break;
          pts.push([x,y]);
          x+=dx;y+=dy;
          const r=random();
          if(r<.28){if(dx)y+=r<.14?1:-1;else x+=r<.14?1:-1;}
        }
        if(pts.length<4)continue;
        for(const [cx,cy] of pts){set(cx,cy,dark);occ[cy*GRID+cx]=true;}
        if(pts.length>6&&random()<.5){
          const [bx,by]=pts[ri(2,pts.length-3)],ox=dx?0:(random()<.5?1:-1),oy=dx?(random()<.5?1:-1):0;
          for(let s=1;s<=3;s++)if(bx+ox*s>=2&&bx+ox*s<=13&&by+oy*s>=2&&by+oy*s<=13)set(bx+ox*s,by+oy*s,dark);
        }
      }
    }else if(p.kind==='panels'){
      for(let x=0;x<GRID;x++){px[7*GRID+x]=dark;px[8*GRID+x]=light;}
      if(p.cols!==1){
        const a=ri(4,11),b=ri(3,12);
        for(let y=1;y<=6;y++)set(a,y,dark);
        for(let y=9;y<=14;y++)set(b,y,dark);
      }
      reserve(0,6,GRID,4);
    }else if(p.kind==='ripples'){
      for(let i=0;i<count(3,p);i++){
        const at=place(6,2);if(!at)continue;
        const [x,y]=at,phase=(spec.animated?frame+i+(looks?v:0):variant+i)%ANIMATION_FRAMES;
        const row=(dx,w,c,dy=0)=>{for(let k=0;k<w;k++)set(x+dx+k,y+dy,c);};
        if(phase===0)row(2,2,bright);
        else if(phase===1)row(1,4,light);
        else if(phase===2){row(0,6,light);row(2,2,dark,1);}
        else row(1,4,dark);
      }
    }else if(p.kind==='furrows'){
      for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++){if(y%4===1)px[y*GRID+x]=light;else if(y%4===2)px[y*GRID+x]=dark;}
      for(let i=0;i<count(5,p);i++){
        const y=1+4*ri(0,3),x=ri(2,11),w=ri(2,3);
        for(let k=0;k<w;k++)if(x+k<=13)px[y*GRID+x+k]=base;
      }
    }else if(p.kind==='polygons'){
      const sites=Array.from({length:3+Math.round((p.density??.5)*4)},()=>[ri(2,13),ri(2,13)]);
      for(let y=1;y<=14;y++)for(let x=1;x<=14;x++){
        const d=sites.map(([sx,sy])=>Math.hypot(sx-x,sy-y)).sort((a,b)=>a-b);
        if(d[1]-d[0]<1.05)px[y*GRID+x]=dark;
      }
    }else if(p.kind==='bubbles'){
      for(let i=0;i<count(5,p);i++){
        const at=place(4,3);if(!at)continue;
        const [x,y]=at;
        set(x+1,y,dark);set(x+2,y,dark);set(x,y+1,dark);set(x+3,y+1,dark);set(x+1,y+2,dark);set(x+2,y+2,dark);
        set(x+1,y+1,bright);set(x+2,y+1,bright);
      }
    }else if(p.kind==='streaks'){
      for(let i=0;i<count(3,p);i++){
        const len=ri(3,5),at=place(len,len);if(!at)continue;
        const [x,y]=at,tone=toneAt(p,i,'light');
        for(let s=0;s<len;s++)set(x+s,y+len-1-s,tone);
        if(p.tone===undefined||p.tone==='light')for(let s=0;s<len-2;s++)set(x+1+s,y+len-1-s-1,bright);
      }
    }else if(p.kind==='stripe'){
      const color=p.color??bright;
      for(const [from,to] of [[1,6],[9,14]])for(let y=7;y<=8;y++)for(let x=from;x<=to;x++)px[y*GRID+x]=color;
    }else if(LAYER_PATTERN_KINDS.includes(p.kind)){
      drawLayer(p,pi);
    }
  }
  const grain=spec.grain??'lattice';
  if(spec.edgeMarks!==false&&grain==='lattice'){
    for(const y of [4,11])for(const x of [0,GRID-1])for(let k=0;k<2;k++)px[(y+k)*GRID+x]=light;
    for(const x of [5,12])for(const y of [0,GRID-1])for(let k=0;k<2;k++)px[y*GRID+x+k]=dark;
  }else if(spec.edgeMarks!==false&&grain==='soft'){
    // one or two short runs per edge pair at positions seeded per variant: a variant steps the start by 5 of the 13 possible
    // positions (5 and 13 share no factor, so no two variants start on the same one), and the second run is optional. Opposite edges match.
    const base0=randomFor((seed^Math.imul(spec.seed??0,0x9e3779b1))>>>0,hash(name)%9973*29+9001),own=randomFor((seed^Math.imul(spec.seed??0,0x9e3779b1))>>>0,v+hash(name)%9973*29+9002);
    const runs=()=>{const a=1+(Math.floor(base0()*13)+5*v)%13,list=[a];if(own()<.5)list.push(1+(a-1+6+Math.floor(own()*3))%13);return list;};
    for(const y of runs())for(const x of [0,GRID-1])for(let k=0;k<2;k++)px[(y+k)*GRID+x]=light;
    for(const x of runs())for(const y of [0,GRID-1])for(let k=0;k<2;k++)px[y*GRID+x+k]=dark;
  }
  removeStrays(px);
  return px;
}

/** Revert any interior pixel with no same-colour 8-neighbour (the tile counts as repeating) to the base fill. */
function removeStrays(px){
  const counts=new Map();for(const c of px)counts.set(c,(counts.get(c)??0)+1);
  const fill=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0][0];
  const at=(x,y)=>px[((y+GRID)%GRID)*GRID+(x+GRID)%GRID];
  for(let pass=0;pass<3;pass++){
    let changed=false;
    for(let y=1;y<GRID-1;y++)for(let x=1;x<GRID-1;x++){
      const c=px[y*GRID+x];if(c===fill)continue;
      let ok=false;
      for(let dy=-1;dy<=1&&!ok;dy++)for(let dx=-1;dx<=1&&!ok;dx++)if((dx||dy)&&at(x+dx,y+dy)===c)ok=true;
      if(!ok){px[y*GRID+x]=fill;changed=true;}
    }
    if(!changed)break;
  }
}
