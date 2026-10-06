// Pixel-grid terrain materials: the wasteland set and user-defined materials share one engine.
//
// A material is data: a four-colour ramp [base, dark, light, bright] plus a short list of patterns. Everything is
// authored on a 16x16 source grid (a 32x32 screen tile at pixelScale 2; at pixelScale 1 every source pixel is 2x2).
// The outer row and column ring is canonical for a material: opposite edges match and every variant shares the same
// edge marks, so any variant tiles beside any other. Patterns stay inside the interior (2..13) and never touch it.
import {randomFor} from './environment-terrain.js';

export const GRID=16;
export const PATTERN_KINDS=['speckle','clusters','cracks','panels','ripples','furrows','polygons','bubbles','streaks','stripe'];
const TONES=['mixed','dark','light','bright'];
const PATTERN_FIELDS={
  speckle:['density','tone'],clusters:['density','tone','size','shade'],cracks:['density'],panels:['cols'],ripples:['density'],
  furrows:['density'],polygons:['density'],bubbles:['density'],streaks:['density','tone'],stripe:['color'],
};
const HEX=/^#[0-9a-fA-F]{6}$/;

const m=(ramp,patterns,extra={})=>({ramp,patterns,...extra});
/** Built-in wasteland materials, in the order the Fallow Valley ground list uses. */
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

const isObject=v=>v&&typeof v==='object'&&!Array.isArray(v);
function validatePattern(p,where){
  if(!isObject(p))throw Error(`${where} must be an object`);
  if(!PATTERN_KINDS.includes(p.kind))throw Error(`${where} kind must be one of ${PATTERN_KINDS.join(', ')}`);
  const allowed=['kind','variants',...PATTERN_FIELDS[p.kind]];
  for(const key of Object.keys(p))if(!allowed.includes(key))throw Error(`Unknown ${where} field for ${p.kind}: ${key}`);
  if(p.variants!==undefined&&['panels','furrows'].includes(p.kind))throw Error(`${where} variants cannot restrict ${p.kind}: it draws the shared edge rows`);
  if(p.density!==undefined&&(typeof p.density!=='number'||!(p.density>=.05&&p.density<=1)))throw Error(`${where} density must be a number from 0.05 to 1`);
  if(p.tone!==undefined&&!TONES.includes(p.tone))throw Error(`${where} tone must be ${TONES.join(', ')}`);
  if(p.size!==undefined&&!['small','large'].includes(p.size))throw Error(`${where} size must be small or large`);
  if(p.shade!==undefined&&typeof p.shade!=='boolean')throw Error(`${where} shade must be a boolean`);
  if(p.cols!==undefined&&![1,2].includes(p.cols))throw Error(`${where} cols must be 1 or 2`);
  if(p.color!==undefined&&(typeof p.color!=='string'||!HEX.test(p.color)))throw Error(`${where} color must be a #rrggbb hex color`);
  if(p.variants!==undefined&&(!Array.isArray(p.variants)||!p.variants.length||p.variants.length>8||p.variants.some(v=>!Number.isInteger(v)||v<0||v>7)))throw Error(`${where} variants must be a nonempty array of variant numbers 0 to 7`);
}

/** Strictly validate and normalise one inline custom material. */
export function validateCustomMaterial(def,builtin){
  if(!isObject(def))throw Error('Each custom material must be an object');
  for(const key of Object.keys(def))if(!['name','ramp','patterns','seed','animated','fps'].includes(key))throw Error(`Unknown custom material field: ${key}`);
  if(typeof def.name!=='string'||!/^[a-z][a-z0-9-]{0,31}$/.test(def.name))throw Error('Custom material name must be lowercase letters, digits and hyphens, starting with a letter (no underscores)');
  if(builtin.includes(def.name))throw Error(`Custom material ${def.name} collides with a built-in material`);
  const where=`custom material ${def.name}`;
  if(!Array.isArray(def.ramp)||def.ramp.length!==4||def.ramp.some(c=>typeof c!=='string'||!HEX.test(c)))throw Error(`${where} ramp must be four #rrggbb colors: base, dark, light, bright`);
  if(!Array.isArray(def.patterns)||!def.patterns.length||def.patterns.length>6)throw Error(`${where} patterns must be an array of 1 to 6 patterns`);
  def.patterns.forEach((p,i)=>validatePattern(p,`${where} pattern ${i}`));
  if(def.seed!==undefined&&!Number.isSafeInteger(def.seed))throw Error(`${where} seed must be a safe integer`);
  if(def.animated!==undefined&&typeof def.animated!=='boolean')throw Error(`${where} animated must be a boolean`);
  if(def.animated&&!def.patterns.some(p=>p.kind==='ripples'))throw Error(`${where} animated requires a ripples pattern`);
  if(def.fps!==undefined&&(!def.animated||!Number.isFinite(def.fps)||def.fps<1||def.fps>60))throw Error(`${where} fps must be 1 to 60 and applies only to animated materials`);
  return {name:def.name,ramp:def.ramp.map(c=>c.toLowerCase()),patterns:def.patterns.map(p=>({...p,...(p.color?{color:p.color.toLowerCase()}:{})})),seed:def.seed??0,animated:!!def.animated,fps:def.fps??4};
}

const hash=s=>[...s].reduce((h,ch)=>(Math.imul(h,31)+ch.charCodeAt(0))>>>0,7);

/** One material tile: GRID*GRID hex colors, row-major. `frame` selects the ripple phase of an animated material. */
export function materialTile(name,spec,variant,seed,frame=0){
  const [base,dark,light,bright]=spec.ramp,tones={dark,light,bright,base};
  const animated=!!spec.animated,v=animated?0:variant;
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
  for(const p of spec.patterns){
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
        const [x,y]=at,phase=(spec.animated?frame+i:variant+i)%ANIMATION_FRAMES;
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
    }
  }
  if(spec.edgeMarks!==false){
    for(const y of [4,11])for(const x of [0,GRID-1])for(let k=0;k<2;k++)px[(y+k)*GRID+x]=light;
    for(const x of [5,12])for(const y of [0,GRID-1])for(let k=0;k<2;k++)px[y*GRID+x+k]=dark;
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
