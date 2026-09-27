import {randomFor,mossEdgeColor} from './environment-terrain.js';

// Clockwise, starting north. Diagonals only matter between two present sides.
export const TRANSITION_BITS={n:1,ne:2,e:4,se:8,s:16,sw:32,w:64,nw:128};
export function normalizeTerrainMask(mask){
  if(!Number.isInteger(mask)||mask<0||mask>255)throw Error('Terrain neighbor mask must be an integer from 0 to 255');
  for(const [corner,a,b] of [[2,1,4],[8,4,16],[32,16,64],[128,64,1]])if(!(mask&a)||!(mask&b))mask&=~corner;
  return mask;
}
export const TERRAIN_MASKS=Array.from({length:256},(_,i)=>i).filter(i=>normalizeTerrainMask(i)===i);
const smooth=t=>t*t*(3-2*t),mix=(a,b,t)=>a+(b-a)*t;
const colors={grass:'#627e62',grassLight:'#6b8464',grassDark:'#5c785e',earth:'#967e63',earthLight:'#a58b6a',earthDark:'#887058',rim:'#81976f',lip:'#b6a17a'};

/** Sample a blob neighborhood at duplicated tile boundaries. Adjacent cells
 * therefore agree exactly, including different masks and different variants.
 * Variation vanishes at cell edges; it changes the interior contour, not joins.
 */
export function terrainTransitionPixels(mask,variant=0,seed=7){
  mask=normalizeTerrainMask(mask);
  if(!Number.isSafeInteger(variant)||variant<0)throw Error('Terrain variant must be a nonnegative safe integer');
  if(!Number.isSafeInteger(seed))throw Error('Terrain seed must be a safe integer');
  const random=randomFor(seed^211,variant),phase=random()*Math.PI*2;
  const field=(x,y)=>{
    const dx=x/31-.5,dy=y/31-.5,h=dx<0?64:4,v=dy<0?1:16,d=dx<0?(dy<0?128:32):(dy<0?2:8);
    const sx=smooth(Math.abs(dx)*2),sy=smooth(Math.abs(dy)*2);
    const value=mix(mix(1,Number(!!(mask&h)),sx),mix(Number(!!(mask&v)),Number(!!(mask&d)),sx),sy);
    const envelope=Math.sin(Math.PI*x/31)*Math.sin(Math.PI*y/31);
    return value+.17*envelope*(Math.sin(x*.67+y*.29+phase)+Math.sin(y*.73-x*.21+phase))/2;
  };
  const values=Array.from({length:1024},(_,i)=>field(i%32,Math.floor(i/32)));
  const pixels=values.map(v=>v>=.4?colors.earth:v>=.35?colors.rim:colors.grass);
  // Scattered 2–5px clusters follow each surface. Keep edge pixels canonical.
  for(let i=0;i<32;i++){
    const x=2+Math.floor(random()*26),y=2+Math.floor(random()*26),w=2+Math.floor(random()*4),h=1+Math.floor(random()*3),earth=values[y*32+x]>=.4;
    for(let yy=y;yy<Math.min(30,y+h);yy++)for(let xx=x;xx<Math.min(30,x+w);xx++){
      const index=yy*32+xx,value=values[index];
      if(earth&&value>.46)pixels[index]=i%3?colors.earthLight:colors.earthDark;
      else if(!earth&&value<.29)pixels[index]=i%3?colors.grassLight:colors.grassDark;
    }
  }
  // Warm broken shoulder on the earth side, never a dark continuous outline.
  for(let y=1;y<31;y++)for(let x=1;x<31;x++){
    const i=y*32+x;if(values[i]>=.4&&values[i]<.44&&(x+y+variant)%5<3)pixels[i]=colors.lip;
  }
  // Continue the ordinary moss recipe's shallow edge clusters at empty neighbors.
  for(let y=0;y<32;y++)for(let x=0;x<32;x++)if((x<2||x>29||y<2||y>29)&&values[y*32+x]<.29)pixels[y*32+x]=mossEdgeColor(x,y);
  return pixels;
}

export function drawTerrainTransition(p,mask,variant,seed){
  const pixels=terrainTransitionPixels(mask,variant,seed);
  for(let y=0;y<32;y++)for(let x=0;x<32;){
    const color=pixels[y*32+x],start=x;while(x<32&&pixels[y*32+x]===color)x++;
    p.rect(`surface_${y}_${start}`,start,y,x-start,1,color);
  }
}
