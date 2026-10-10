// World-space organic edges for terrain-overlay (overlayEdge.world, 0.87.0).
//
// The classic overlay (environment-overlay.js) cuts each cell from a per-cell ragged profile whose two ends are pinned to one
// constant depth, so a long coast shows the same step at every tile block and the same wobble repeats every tile.
//
// World mode replaces the constant with a CROSSING LEVEL per tile-corner lattice vertex. A vertex is shared by the four tiles
// around it, so every tile that touches it reads the same level, and the depth of the encroachment where the band crosses the
// tile border is the same on both sides: the boundary is continuous along a whole coast. The game picks each vertex's level from
// ANY world-space function (`worldLevel` below is a reference one: smooth value noise sampled at the vertex's world position), so
// the coast wanders as a function of where it is on the map instead of repeating per tile. The cell set is indexed by the levels
// of the corners the mask's bands touch (plus an interior flavour), and the report maps (mask, levels) to aliases. A mask that
// touches more than `exact` corners (a thin strip, a peninsula) has one level-independent cell per flavour to keep the sheet small.
import {GRID} from './environment-materials.js';
import {normalizeOverlayMask,softenCoverage} from './environment-overlay.js';

export const MAX_LEVELS=4;
export const WORLD_FIELDS=['reach','spread','levels','wavelength','amplitude','flavours','seed','exact','pairs'];
export const PAIR_FIELDS=['over','on','reach','spread','soft','shade'];
export const DEFAULT_WORLD={reach:5,spread:1.5,levels:3,wavelength:14,amplitude:1.6,flavours:2,seed:0,exact:3};

// corner order everywhere: [nw, ne, se, sw]; edge e of the tile touches corners EDGE_CORNERS[e] (N, E, S, W)
const EDGE_BITS=[1,4,16,64],DIAG_BITS=[[2,1],[8,2],[32,3],[128,0]],EDGE_CORNERS=[[0,1],[1,2],[2,3],[3,0]];

/** Corners (0 nw, 1 ne, 2 se, 3 sw) whose crossing level shapes a mask: the ends of its bands and the centres of its corner blobs. */
export function usedCorners(mask){
  mask=normalizeOverlayMask(mask);
  const used=new Set();
  EDGE_BITS.forEach((bit,e)=>{if(mask&bit)for(const c of EDGE_CORNERS[e])used.add(c);});
  for(const [bit,c] of DIAG_BITS)if(mask&bit)used.add(c);
  return [...used].sort();
}

function mix(a,b,c,d){
  let h=(Math.imul(a|0,374761393)+Math.imul(b|0,668265263)+Math.imul(c|0,2147483647)+Math.imul(d|0,1274126177))|0;
  h=Math.imul(h^(h>>>13),1274126177);h=Math.imul(h^(h>>>16),2246822519);h^=h>>>15;
  return (h>>>0)/4294967296;
}
const smooth=t=>t*t*(3-2*t);
/** Smooth 1-D value noise in [-1,1] on a unit lattice. */
function noise1(x,k,seed){const i=Math.floor(x),f=smooth(x-i),a=mix(i,k,1,seed),b=mix(i+1,k,1,seed);return (a+(b-a)*f)*2-1;}
function noise2(x,y,seed){
  const i=Math.floor(x),j=Math.floor(y),fx=smooth(x-i),fy=smooth(y-j);
  const a=mix(i,j,2,seed),b=mix(i+1,j,2,seed),c=mix(i,j+1,2,seed),d=mix(i+1,j+1,2,seed);
  return (a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy)*2-1;
}

/** The depths (source pixels) a crossing may take: `levels` values centred on `reach`, `spread` pixels to each side. */
export function levelDepths({reach,spread,levels}){
  if(levels===1)return [reach];
  return Array.from({length:levels},(_,i)=>reach+spread*(2*i/(levels-1)-1));
}

/**
 * Reference crossing level of the lattice vertex (vx, vy): vertex (0,0) is the top-left corner of tile (0,0), vertex (tx,ty) the
 * top-left corner of tile (tx,ty). Two octaves of smooth value noise sampled at the vertex's world position in source pixels
 * (16 per tile), quantised to `levels`. A game may use any other function of the world; this one is what the examples use.
 */
export function worldLevel(vx,vy,{levels=DEFAULT_WORLD.levels,wavelength=48,seed=0}={}){
  if(levels===1)return 0;
  const wx=vx*GRID,wy=vy*GRID;
  const n=.7*noise2(wx/wavelength,wy/wavelength,seed)+.3*noise2(wx/(wavelength*.45)+7.3,wy/(wavelength*.45)+3.1,seed+1);
  return Math.min(levels-1,Math.max(0,Math.floor((n*.8+1)/2*levels)));
}

/** Index of the (levels of used corners, flavour) combination within a mask's cells: mixed radix over `usedCorners`, flavour fastest. */
export function worldVariants(mask,{levels,flavours,exact=DEFAULT_WORLD.exact}){
  // a mask that touches more than `exact` corners is cut at the middle level on all of them: one cell per flavour, any neighbour may differ by a level
  let used=usedCorners(mask);if(used.length>exact)used=[];
  const combos=levels**used.length,out=[];
  for(let c=0;c<combos;c++){
    const corners=[null,null,null,null];let rest=c;
    for(const k of used){corners[k]=rest%levels;rest=Math.floor(rest/levels);}
    for(let f=0;f<flavours;f++)out.push({variant:c*flavours+f,corners,flavour:f});
  }
  return out;
}

/** Depth along one edge at pixel t (0..15): the two corner depths joined by a smooth blend plus an interior bump that vanishes at both ends. */
function edgeDepth(t,dA,dB,{wavelength,amplitude},edge,flavour,seed){
  const u=(t+.5)/GRID,env=Math.sin(Math.PI*u),k=edge*7+flavour*3;
  const w=GRID/wavelength;
  const bump=noise1(u*w+mix(edge,flavour,3,seed)*40,k,seed)*.65+noise1(u*w*2.1+mix(edge,flavour,4,seed)*40,k+1,seed+9)*.35;
  return dA+(dB-dA)*smooth(u)+amplitude*env*bump;
}

/**
 * Boolean coverage (GRID*GRID) of a mask for the given corner depths (source pixels, [nw,ne,se,sw]; unused corners ignored) and
 * interior flavour. Along an edge the depth runs from one corner's depth to the other's, so the band meets the next tile's
 * at the shared vertex exactly. `round` (0 to 6) is the same concave-corner rounding as the classic overlay.
 */
export function worldCoverage(mask,cornerDepths,flavour,seed,opts={}){
  mask=normalizeOverlayMask(mask);
  const o={...DEFAULT_WORLD,...opts},cover=Array(GRID*GRID).fill(false);
  const d=cornerDepths;
  for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++){
    let on=false;const px=x+.5,py=y+.5;
    // N runs west to east (corners nw to ne), E north to south, S east to west is measured west to east too, W north to south
    if(mask&1&&py<edgeDepth(x,d[0],d[1],o,0,flavour,seed))on=true;
    if(mask&4&&GRID-px<edgeDepth(y,d[1],d[2],o,1,flavour,seed))on=true;
    if(mask&16&&GRID-py<edgeDepth(x,d[3],d[2],o,2,flavour,seed))on=true;
    if(mask&64&&px<edgeDepth(y,d[0],d[3],o,3,flavour,seed))on=true;
    for(const [bit,c] of DIAG_BITS){
      if(!(mask&bit))continue;
      const cx=c===1||c===2?GRID:0,cy=c>=2?GRID:0,dx=Math.abs(px-cx),dy=Math.abs(py-cy);
      const r=d[c]+o.amplitude*.6*Math.sin(2*Math.atan2(dy,dx))*(mix(c,flavour,5,seed)*2-1);
      if(Math.hypot(dx,dy)<r)on=true;
    }
    cover[y*GRID+x]=on;
  }
  softenCoverage(cover,mask,opts.round||0);
  return cover;
}

export function validateWorld(world,materials){
  if(world===undefined||world===false)return null;
  const w=world===true?{}:world;
  if(!w||typeof w!=='object'||Array.isArray(w))throw Error('overlayEdge world must be true or an object');
  for(const key of Object.keys(w))if(!WORLD_FIELDS.includes(key))throw Error(`Unknown overlayEdge world field: ${key}`);
  const num=(name,min,max,v)=>{if(v!==undefined&&(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max))throw Error(`overlayEdge world ${name} must be a number from ${min} to ${max}`);};
  const int=(name,min,max,v)=>{if(v!==undefined&&(!Number.isInteger(v)||v<min||v>max))throw Error(`overlayEdge world ${name} must be an integer from ${min} to ${max}`);};
  const reachOf=(r,where)=>{
    if(r===undefined)return {default:undefined,per:{}};
    if(typeof r==='number'){num(`${where}reach`,1,10,r);return {default:r,per:{}};}
    if(!r||typeof r!=='object'||Array.isArray(r))throw Error(`overlayEdge world ${where}reach must be a number or an object of material depths`);
    const per={};let def;
    for(const [k,v] of Object.entries(r)){
      num(`${where}reach.${k}`,1,10,v);
      if(k==='default')def=v;else{if(materials&&!materials.includes(k))throw Error(`overlayEdge world reach names ${k}, which is not in materials`);per[k]=v;}
    }
    return {default:def,per};
  };
  num('spread',0,4,w.spread);int('levels',1,MAX_LEVELS,w.levels);num('wavelength',4,64,w.wavelength);num('amplitude',0,4,w.amplitude);int('flavours',1,4,w.flavours);int('exact',1,4,w.exact);
  if(w.seed!==undefined&&!Number.isSafeInteger(w.seed))throw Error('overlayEdge world seed must be a safe integer');
  const reach=reachOf(w.reach,'');
  const pairs=[];
  if(w.pairs!==undefined){
    if(!Array.isArray(w.pairs)||!w.pairs.length||w.pairs.length>64)throw Error('overlayEdge world pairs must be an array of 1 to 64 pair objects');
    const seen=new Set();
    for(const p of w.pairs){
      if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Each overlayEdge world pair must be an object');
      for(const key of Object.keys(p))if(!PAIR_FIELDS.includes(key))throw Error(`Unknown overlayEdge world pair field: ${key}`);
      for(const key of ['over','on'])if(typeof p[key]!=='string'||(materials&&!materials.includes(p[key])))throw Error(`overlayEdge world pair ${key} must name a material in materials`);
      if(p.over===p.on)throw Error('overlayEdge world pair over and on must differ');
      num('pair reach',1,10,p.reach);num('pair spread',0,4,p.spread);
      if(p.soft!==undefined&&typeof p.soft!=='boolean')throw Error('overlayEdge world pair soft must be a boolean');
      if(p.shade!==undefined&&typeof p.shade!=='boolean')throw Error('overlayEdge world pair shade must be a boolean');
      const key=`${p.over}>${p.on}`;if(seen.has(key))throw Error(`Duplicate overlayEdge world pair ${key}`);seen.add(key);
      pairs.push({over:p.over,on:p.on,reach:p.reach,spread:p.spread,soft:!!p.soft,shade:!!p.shade});
    }
  }
  const base={...DEFAULT_WORLD};
  for(const k of ['spread','levels','wavelength','amplitude','flavours','seed','exact'])if(w[k]!==undefined)base[k]=w[k];
  if(reach.default!==undefined)base.reach=reach.default;
  return {...base,perMaterialReach:reach.per,pairs};
}

/** Resolved shape parameters of one overlay material, optionally over a named base material. */
export function worldParams(world,material,pair){
  const reach=pair?.reach??world.perMaterialReach[material]??world.reach,spread=pair?.spread??world.spread;
  return {reach,spread,levels:world.levels,flavours:world.flavours,wavelength:world.wavelength,amplitude:world.amplitude,depths:levelDepths({reach,spread,levels:world.levels})};
}
