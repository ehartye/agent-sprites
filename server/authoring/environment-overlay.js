// Alpha-edged encroachment overlays for ANY pair of neighbouring ground types.
//
// A game draws every tile as its own base material, then for each neighbour material n of HIGHER priority stacks
// the overlay of n on that tile. The mask says which of the tile's eight neighbours are n: n bleeds INTO the tile
// across those shared edges and corners and the tile's own material shows through everywhere else.
//
// Seams hold by construction. Along any tile edge the covered pixels are a function of the two tile corners at its
// ends only: a band that reaches a corner, or an outer-corner blob, always covers exactly EDGE_DEPTH pixels along
// that edge, so the matching edge of the next tile (computed from its own neighbourhood) agrees pixel for pixel,
// whatever the variants. Variation only moves the interior contour.
import {randomFor} from './environment-terrain.js';
import {GRID} from './environment-materials.js';
import {TRANSITION_BITS} from './environment-transition.js';

export const OVERLAY_BITS=TRANSITION_BITS;
export const EDGE_DEPTH=5;
const AMPLITUDE=3;

/** Encroachment corner rule: a diagonal is meaningful only when BOTH adjacent cardinal bits are clear. */
export function normalizeOverlayMask(mask){
  if(!Number.isInteger(mask)||mask<0||mask>255)throw Error('Overlay neighbor mask must be an integer from 0 to 255');
  for(const [corner,a,b] of [[2,1,4],[8,4,16],[32,16,64],[128,64,1]])if((mask&a)||(mask&b))mask&=~corner;
  return mask;
}
/** The 47 valid masks (mask 0 means no neighbour of that material: nothing to draw). */
export const OVERLAY_MASKS=Array.from({length:256},(_,i)=>i).filter(i=>normalizeOverlayMask(i)===i);

/** Band depth along one edge: EDGE_DEPTH at both ends, irregular between. */
function profile(random){
  const f1=.38+random()*.3,f2=.8+random()*.5,p1=random()*6.3,p2=random()*6.3,w=.45+random()*.3;
  const depth=Array.from({length:GRID},(_,t)=>{
    const env=Math.sin(Math.PI*t/(GRID-1)),n=w*Math.sin(t*f1+p1)+(1-w)*Math.sin(t*f2+p2);
    return EDGE_DEPTH+Math.round(AMPLITUDE*env*n*1.15);
  });
  // no one-pixel spikes: neighbouring columns differ by at most one, and both ends stay exactly EDGE_DEPTH
  for(let t=1;t<GRID;t++)depth[t]=Math.min(depth[t-1]+1,Math.max(depth[t-1]-1,depth[t]));
  depth[GRID-1]=EDGE_DEPTH;
  for(let t=GRID-2;t>=0;t--)depth[t]=Math.min(depth[t+1]+1,Math.max(depth[t+1]-1,depth[t]));
  return depth;
}

/** Boolean coverage (GRID*GRID) of the neighbour material for a normalised mask and variant. */
export function overlayCoverage(mask,variant=0,seed=7){
  mask=normalizeOverlayMask(mask);
  if(!Number.isSafeInteger(variant)||variant<0)throw Error('Overlay variant must be a nonnegative safe integer');
  if(!Number.isSafeInteger(seed))throw Error('Overlay seed must be a safe integer');
  const random=randomFor(seed^977,variant);
  const bands=[profile(random),profile(random),profile(random),profile(random)];
  const wobble=[random()*2-1,random()*2-1,random()*2-1,random()*2-1];
  const last=GRID-1,cover=Array(GRID*GRID).fill(false);
  for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++){
    let on=false;
    if(mask&1&&y<bands[0][x])on=true;
    if(mask&4&&last-x<bands[1][y])on=true;
    if(mask&16&&last-y<bands[2][x])on=true;
    if(mask&64&&x<bands[3][y])on=true;
    // outer corners: a rounded blob whose arms are exactly EDGE_DEPTH, so it meets the band of the next tile
    for(const [i,bit,cx,cy] of [[0,2,GRID,0],[1,8,GRID,GRID],[2,32,0,GRID],[3,128,0,0]]){
      if(!(mask&bit))continue;
      const dx=Math.abs(x+.5-cx),dy=Math.abs(y+.5-cy);
      if(Math.hypot(dx,dy)<EDGE_DEPTH+wobble[i]*1.1*Math.sin(2*Math.atan2(dy,dx)))on=true;
    }
    cover[y*GRID+x]=on;
  }
  // soften sharp base-colour corners where two bands meet, away from the tile border so seams stay exact
  const before=cover.slice();
  for(let y=1;y<last;y++)for(let x=1;x<last;x++){
    if(before[y*GRID+x])continue;
    const up=before[(y-1)*GRID+x],down=before[(y+1)*GRID+x],left=before[y*GRID+x-1],right=before[y*GRID+x+1];
    if((up||down)&&(left||right))cover[y*GRID+x]=true;
  }
  return cover;
}

/**
 * Overlay pixels: the neighbour material's own tile, cut to the coverage, with a one pixel dark edge where it meets
 * the tile's own material. Uncovered pixels are null. Out-of-tile neighbours count as covered like their own pixel so
 * the rim never depends on the next tile.
 */
export function overlayPixels(coverage,tile,rim){
  const px=Array(GRID*GRID).fill(null);
  const at=(x,y)=>coverage[Math.min(GRID-1,Math.max(0,y))*GRID+Math.min(GRID-1,Math.max(0,x))];
  for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++){
    if(!coverage[y*GRID+x])continue;
    const edge=!at(x-1,y)||!at(x+1,y)||!at(x,y-1)||!at(x,y+1);
    px[y*GRID+x]=edge&&rim?rim:tile[y*GRID+x];
  }
  return px;
}
