// Diamond (2:1 isometric) terrain: the same materials and the same encroachment overlays as the square tiles, drawn
// as 64 by 32 pixel diamonds for a game whose ground is seen at an angle.
//
// A square tile cannot be projected into a diamond: its pixels land on a sheared lattice and some are read twice and
// some never. So only the SHAPE of an overlay is taken from tile space: the coverage of a mask and variant is exactly
// the square coverage, read through the projection, which keeps its seam rule (the pixels along a tile edge depend
// only on the two corners at its ends). The TEXTURE is made here in screen pixels, and so are the rim and the contact
// band, lit from the top left of the screen.
//
// Geometry. Map +x runs to screen (+32, +16) and map +y to (-32, +16), so a tile's top vertex is its (0, 0) corner and
// the mask bits keep their map meaning: n is the tile across the upper right edge, e the lower right, s the lower
// left, w the upper left. A pixel belongs to the diamond when its centre does; rows are 2, 6, 10 ... 62 pixels wide
// and back again, 1,024 pixels in all, and diamonds laid at those offsets cover every screen pixel exactly once.
import {randomFor} from './environment-terrain.js';
import {GRID} from './environment-materials.js';

export const DIAMOND={width:64,height:32};
const W=DIAMOND.width,H=DIAMOND.height,HALF_W=W/2,HALF_H=H/2;
const hash=s=>[...s].reduce((h,ch)=>(Math.imul(h,31)+ch.charCodeAt(0))>>>0,7);

/** Tile-space position (0 to 1 on both axes) of a diamond pixel's centre. */
export function diamondUv(x,y){
  const dx=(x+.5-HALF_W)/HALF_W,dy=(y+.5)/HALF_H;
  return [(dy+dx)/2,(dy-dx)/2];
}
/** Whether pixel (x, y) of the 64 by 32 cell is part of the diamond. */
export function inDiamond(x,y){
  if(x<0||y<0||x>=W||y>=H)return false;
  const [u,v]=diamondUv(x,y);
  return u>=0&&u<1&&v>=0&&v<1;
}
const INSIDE=Array.from({length:W*H},(_,i)=>inDiamond(i%W,Math.floor(i/W)));

/** A square GRID by GRID coverage read through the projection: true, false, or null outside the diamond. */
export function projectCoverage(coverage){
  return INSIDE.map((inside,i)=>{
    if(!inside)return null;
    const [u,v]=diamondUv(i%W,Math.floor(i/W));
    return !!coverage[Math.min(GRID-1,Math.floor(v*GRID))*GRID+Math.min(GRID-1,Math.floor(u*GRID))];
  });
}

/**
 * Overlay pixels for a projected coverage: the material's own diamond tile cut to the coverage, with a one pixel rim
 * where it meets the tile's own material. An edge facing up or left on the SCREEN takes `rim.light`, the rest
 * `rim.dark`. A neighbour outside the diamond counts as the pixel itself, so a rim never depends on the next tile.
 */
export function diamondOverlayPixels(coverage,tile,rim){
  const open=(x,y,self)=>{const i=y*W+x;return x<0||y<0||x>=W||y>=H||coverage[i]===null?!self:!coverage[i];};
  return coverage.map((on,i)=>{
    if(!on)return null;
    const x=i%W,y=Math.floor(i/W),n=open(x,y-1,true),w=open(x-1,y,true),s=open(x,y+1,true),e=open(x+1,y,true);
    if(rim&&(n||w||s||e))return typeof rim==='string'?rim:((n?1:0)+(w?1:0)-(s?1:0)-(e?1:0))>0?rim.light:rim.dark;
    return tile[i];
  });
}

/** The contact band of a projected coverage: uncovered diamond pixels within `width` screen pixels, in a straight line, of a covered one. */
export function diamondEdgeShadePixels(coverage,{width=1,color='#1b2040',dir='light'}={}){
  const covered=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&coverage[y*W+x]===true;
  const steps=dir==='all'?[[0,-1],[-1,0],[1,0],[0,1]]:[[0,-1],[-1,0]];
  return coverage.map((on,i)=>{
    if(on!==false)return null;
    const x=i%W,y=Math.floor(i/W);
    return steps.some(([dx,dy])=>{for(let k=1;k<=width;k++)if(covered(x+dx*k,y+dy*k))return true;return false;})?color:null;
  });
}

/**
 * One material as a diamond tile: 64 * 32 colours, null outside the diamond. The spec is the square materials' own
 * (ramp, patterns, density, tone, seed, animated); the marks are drawn in screen pixels, with lines along the 2:1
 * directions an isometric floor has.
 *
 * The ground is one field of marks for all of a material's variants, periodic over the tile lattice, so a mark that
 * crosses a tile edge is whole on both sides whichever variants meet there. A variant keeps the marks that cross an
 * edge and, of the ones wholly inside, its own choice; so variants differ in the middle and agree at the rim.
 */
export function materialDiamond(name,spec,variant=0,seed=7,frame=0){
  const [base,dark,light,bright,deep]=spec.ramp,tones={dark,light,bright,base,deep:deep??dark};
  const animated=!!spec.animated,looks=animated&&spec.variants!==undefined,v=animated&&!looks?0:variant;
  const random=randomFor((seed^Math.imul(spec.seed??0,0x9e3779b1))>>>0,hash(name)%9973*29+7919);
  const ri=(lo,hi)=>lo+Math.floor(random()*(hi-lo+1));
  // The field lives on the lattice's own cell: 32 by 32 pixels, where stepping off the right side returns on the left 16 rows up.
  const cell=new Array(1024).fill(null),taken=new Array(1024).fill(false);
  const at=(x,y)=>{x=((x%W)+W)%W;y=((y%H)+H)%H;if(x>=HALF_W){x-=HALF_W;y=(y+HALF_H)%H;}return y*HALF_W+x;};
  /** A mark is a list of [dx, dy, colour]. It is kept when nothing is within a pixel of it, and by this variant when it lies inside one tile. */
  let serial=0;
  const mark=(x,y,pixels)=>{
    serial++;
    for(const [dx,dy] of pixels)for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++)if(taken[at(x+dx+ox,y+dy+oy)])return false;
    // Which tile each pixel falls in: all in one means the mark is inside a tile, and is one of the marks variants choose among.
    const tiles=new Set(pixels.map(([dx,dy])=>{const px=x+dx+.5,py=y+dy+.5,u=(py/HALF_H+(px-HALF_W)/HALF_W)/2,w=(py/HALF_H-(px-HALF_W)/HALF_W)/2;return `${Math.floor(u)},${Math.floor(w)}`;}));
    for(const [dx,dy] of pixels)taken[at(x+dx,y+dy)]=true;
    const h=Math.imul(serial,2654435761)>>>0;
    if(tiles.size===1&&!animated&&(((h>>>3)+v)%4===0||((h>>>11)+v*3)%7===0))return true;
    for(const [dx,dy,c] of pixels)cell[at(x+dx,y+dy)]=c;
    return true;
  };
  const count=(k,p)=>Math.max(1,Math.round(k*(p.density??.5)));
  const toneAt=(p,i,fallback='mixed')=>{const t=p.tone??fallback;return t==='mixed'?(i%3?light:dark):tones[t]??light;};
  /** A run along one of the floor's directions: `slope` is +1 (down to the right) or -1, two pixels across for one down. */
  const run=(length,slope,c)=>Array.from({length},(_,k)=>[k,slope*Math.floor(k/2),c]);
  const tries=(n,make)=>{for(let i=0,placed=0,guard=0;placed<n&&guard<n*6;guard++){if(mark(ri(0,W-1),ri(0,H-1),make(i))){placed++;i++;}}};
  for(const p of spec.patterns){
    if(p.variants&&!p.variants.includes(variant))continue;
    const k=p.kind;
    if(k==='speckle')tries(count(34,p),i=>{const c=toneAt(p,i);return [[0,0,c],[1,0,c]];});
    else if(k==='clusters'||k==='crystals'){
      const large=p.size==='large';
      tries(count(k==='crystals'?12:16,p),i=>{
        const w=large?ri(4,6):ri(2,4),h=large?ri(2,3):ri(1,2),tone=k==='crystals'?toneAt(p,i,'bright'):p.shade?light:toneAt(p,i),out=[];
        for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
          if(w>=3&&h>=2&&(xx===0||xx===w-1)&&(yy===0||yy===h-1))continue;
          out.push([xx,yy,tone]);
        }
        if(p.shade||k==='crystals')for(let xx=1;xx<w;xx++)out.push([xx,h,dark]);
        if(p.shade&&i%4===0)out.push([0,0,bright],[1,0,bright]);
        return out;
      });
    }else if(k==='cracks'||k==='polygons')tries(count(6,p),()=>{
      const out=[];let x=0,y=0,slope=random()<.5?1:-1;
      for(let s=0,n=ri(3,5);s<n;s++){const len=ri(3,7);for(const [dx,dy] of run(len,slope))out.push([x+dx,y+dy,dark]);x+=len;y+=slope*Math.floor(len/2);if(random()<.6)slope=-slope;}
      return out;
    });
    else if(k==='streaks'||k==='bedding')tries(count(k==='bedding'?10:14,p),i=>run(k==='bedding'?ri(8,16):ri(4,7),i%2?1:-1,toneAt(p,i,k==='bedding'?'light':'dark')));
    else if(k==='sheen')tries(count(8,p),()=>run(ri(5,9),1,bright));
    else if(k==='ripples')tries(count(16,p),i=>{
      // the crest slides along the row with the frame, and the row under it carries its shadow
      const shift=(frame*2+i*3)%8,len=ri(5,8);
      return [...Array.from({length:len},(_,q)=>[q+shift,0,light]),...Array.from({length:Math.max(2,len-3)},(_,q)=>[q+shift+2,1,dark])];
    });
    else if(k==='bubbles')tries(count(10,p),()=>[[1,0,light],[0,1,light],[2,1,dark],[1,2,dark]]);
    else if(k==='furrows'){for(let row=0;row<H;row+=8)for(let x=0;x<W;x+=16)mark(x,row,run(12,1,dark));}
    else if(k==='panels'||k==='stripe'){
      // the seams of slabs laid with the floor: one line each way through the middle of the tile
      const c=k==='stripe'?(p.color??bright):dark;
      for(let q=0;q<HALF_W;q++)for(const x of [HALF_W/2+q,HALF_W*1.5-1-q]){const y=HALF_H/2+Math.floor(q/2);cell[at(x,y)]=c;taken[at(x,y)]=true;}
    }
  }
  return INSIDE.map((inside,i)=>inside?cell[at(i%W,Math.floor(i/W))]??base:null);
}
