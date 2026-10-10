import {drawTerrain, TERRAIN_MATERIALS} from './environment-terrain.js';
import {drawTerrainTransition,TERRAIN_MASKS,TRANSITION_BITS} from './environment-transition.js';
import {drawHabitat, drawFurniture, HABITAT_LAYOUT, FURNITURE_COLLISIONS} from './environment-habitat.js';
import {drawStyledHabitat,HABITAT_STYLES} from './environment-habitat-styles.js';
import {GRID,WASTELAND_SPECS,WASTELAND_MATERIALS,ANIMATION_FRAMES,materialTile,validateCustomMaterial} from './environment-materials.js';
import {validateWorld,worldCoverage,worldParams,worldVariants} from './environment-world-edge.js';
import {DEFAULT_EDGE_SHADE_COLOR,EDGE_DEPTH,MAX_EDGE_SHADE_WIDTH,MAX_ROUND,OVERLAY_BITS,OVERLAY_MASKS,edgeShadePixels,normalizeOverlayMask,overlayCoverage,overlayPixels} from './environment-overlay.js';
import {readPixelScale,scaleShape,screenBounds,sourceBounds,sourcePen} from './environment-pixel-scale.js';

const hashName=s=>[...s].reduce((h,ch)=>(Math.imul(h,31)+ch.charCodeAt(0))>>>0,7);
/** Draw a GRID by GRID pixel tile (null is transparent) as merged rectangles, at either pixel scale. */
function drawPixelTile(p,pixels){
  const q=p.pixelScale===2?p.src:p,k=p.pixelScale===2?1:2,open=new Map(),done=[];
  for(let y=0;y<=GRID;y++){
    const runs=new Map();
    if(y<GRID)for(let x=0;x<GRID;){
      const c=pixels[y*GRID+x],start=x;
      if(c===null){x++;continue;}
      while(x<GRID&&pixels[y*GRID+x]===c)x++;
      runs.set(`${start},${x-start},${c}`,{x:start,w:x-start,c,y,h:1});
    }
    for(const [key,r] of open)if(runs.has(key)){runs.get(key).y=r.y;runs.get(key).h=r.h+1;}else done.push(r);
    open.clear();for(const [key,r] of runs)open.set(key,r);
  }
  for(const r of open.values())done.push(r);
  done.sort((a,b)=>a.y-b.y||a.x-b.x);
  for(const r of done)q.rect(`tile_${r.y}_${r.x}`,r.x*k,r.y*k,r.w*k,r.h*k,r.c);
}
const fallback=(value,other)=>value===undefined?other:value;
const shade=(hex,k)=>'#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*k).toString(16).padStart(2,'0')).join('');
/** Rim colours from a material ramp [base, dark, light, bright]: the light step on top-left facing edges, the dark step a notch darker elsewhere. */
const rimColors=ramp=>({light:ramp[2],dark:shade(ramp[1],.8)});
/** terrain-overlay edge style: `soft` also emits a rimless twin of the overlays (`<material>-soft_<mask>_<variant>`, all materials or the named ones) for seams between two looks of one material, where an outline would be noise; `rim` draws a one pixel outline in the overlay material's own ramp (light on top-left facing edges, dark elsewhere); `round` (0 to 6) rounds the concave corners; `shade` also emits `<material>-shade_<mask>_<variant>` contact bands generated from the same coverage as the overlays, so they follow the ragged edge. */
function validateEdgeShade(shade){
  if(shade===undefined||shade===false)return null;
  const o=shade===true?{}:shade;
  if(!o||typeof o!=='object'||Array.isArray(o))throw Error('overlayEdge shade must be true or an object');
  for(const key of Object.keys(o))if(!['width','color','dir','materials'].includes(key))throw Error(`Unknown overlayEdge shade field: ${key}`);
  if(o.width!==undefined&&(!Number.isInteger(o.width)||o.width<1||o.width>MAX_EDGE_SHADE_WIDTH))throw Error(`overlayEdge shade width must be an integer from 1 to ${MAX_EDGE_SHADE_WIDTH}`);
  if(o.color!==undefined&&!/^#[0-9a-fA-F]{6}$/.test(o.color))throw Error('overlayEdge shade color must be #rrggbb');
  if(o.dir!==undefined&&!['light','all'].includes(o.dir))throw Error('overlayEdge shade dir must be "light" or "all"');
  if(o.materials!==undefined&&(!Array.isArray(o.materials)||!o.materials.length||new Set(o.materials).size!==o.materials.length||o.materials.some(m=>typeof m!=='string')))throw Error('overlayEdge shade materials must be a nonempty array of unique material names');
  return {width:o.width??1,color:(o.color??DEFAULT_EDGE_SHADE_COLOR).toLowerCase(),dir:o.dir??'light',materials:o.materials??null};
}
/** terrain-overlay `overlays`: leave out cells nothing draws. `skip` drops every overlay, soft twin and band of the named materials (a twin look is only ever a base tile); `masks` keeps only the listed masks, for every material (an array) or per material (an object, `"*"` for the rest). */
function validateOverlays(overlays,kind,materials){
  if(overlays===undefined)return {skip:new Set(),masks:()=>OVERLAY_MASKS.filter(Boolean)};
  if(kind!=='terrain-overlay')throw Error('overlays applies only to terrain-overlay');
  if(!overlays||typeof overlays!=='object'||Array.isArray(overlays))throw Error('overlays must be an object');
  for(const key of Object.keys(overlays))if(!['skip','masks'].includes(key))throw Error(`Unknown overlays field: ${key}`);
  const skip=overlays.skip??[];
  if(!Array.isArray(skip)||skip.some(m=>typeof m!=='string'||!materials.includes(m))||new Set(skip).size!==skip.length)throw Error('overlays skip must be an array of unique material names from materials');
  const maskList=(list,where)=>{
    if(!Array.isArray(list)||!list.length||list.some(m=>!Number.isInteger(m)||m<1||m>255||normalizeOverlayMask(m)!==m)||new Set(list).size!==list.length)throw Error(`overlays masks ${where} must be a nonempty array of unique valid overlay masks (normalised, 1 to 255)`);
    return [...list].sort((a,b)=>a-b);
  };
  let masksFor=()=>OVERLAY_MASKS.filter(Boolean);
  if(overlays.masks!==undefined){
    if(Array.isArray(overlays.masks)){const list=maskList(overlays.masks,'');masksFor=()=>list;}
    else if(overlays.masks&&typeof overlays.masks==='object'){
      const per={};
      for(const [k,v] of Object.entries(overlays.masks)){if(k!=='*'&&!materials.includes(k))throw Error(`overlays masks names ${k}, which is not in materials`);per[k]=maskList(v,`for ${k} `);}
      masksFor=m=>per[m]??per['*']??OVERLAY_MASKS.filter(Boolean);
    }else throw Error('overlays masks must be an array of masks or an object of arrays by material');
  }
  return {skip:new Set(skip),masks:masksFor};
}
function validateOverlayEdge(edge,kind){
  if(edge===undefined)return {round:0,rim:false,soft:null,shade:null,world:undefined,animate:null};
  if(kind!=='terrain-overlay')throw Error('overlayEdge applies only to terrain-overlay');
  if(!edge||typeof edge!=='object'||Array.isArray(edge))throw Error('overlayEdge must be an object');
  for(const key of Object.keys(edge))if(!['rim','round','soft','shade','world','animate'].includes(key))throw Error(`Unknown overlayEdge field: ${key}`);
  if(edge.rim!==undefined&&typeof edge.rim!=='boolean')throw Error('overlayEdge rim must be a boolean');
  if(edge.round!==undefined&&(!Number.isInteger(edge.round)||edge.round<0||edge.round>MAX_ROUND))throw Error(`overlayEdge round must be an integer from 0 to ${MAX_ROUND}`);
  if(edge.soft!==undefined&&edge.soft!==true&&(!Array.isArray(edge.soft)||!edge.soft.length||edge.soft.some(m=>typeof m!=='string')))throw Error('overlayEdge soft must be true or a nonempty array of material names');
  if(edge.soft&&!edge.rim)throw Error('overlayEdge soft needs rim: soft sets are the rimless twins of the rimmed overlays');
  if(edge.animate!==undefined&&edge.animate!==true&&(!Array.isArray(edge.animate)||!edge.animate.length||edge.animate.some(m=>typeof m!=='string')))throw Error('overlayEdge animate must be true or a nonempty array of animated material names');
  return {round:edge.round??0,rim:!!edge.rim,soft:edge.soft===true?true:edge.soft??null,shade:validateEdgeShade(edge.shade),world:edge.world,animate:edge.animate===true?true:edge.animate??null};
}

/** The report section a game reads to pick world cells: the crossing depths, and for every set of cells (stem) and mask a lookup from the corner levels to aliases. */
function worldReport(world,frames){
  const lookup={};
  for(const f of frames)if(f.corners){
    const stem=f.alias.replace(/_\d+_\d+$/,'').replace(/-f\d$/,''),key=f.corners.map(l=>l===null?'-':l).join(',');
    if(f.phase>0)continue;
    ((lookup[stem]??={})[f.mask]??={})[key]??=[];lookup[stem][f.mask][key].push(f.alias);
  }
  return {levels:world.levels,flavours:world.flavours,exact:world.exact,reach:world.reach,spread:world.spread,wavelength:world.wavelength,amplitude:world.amplitude,seed:world.seed,
    depths:worldParams(world,'').depths,depthsUnits:'source pixels of the cell; level i is the depth of the encroachment where a band crosses a tile border at a lattice vertex of that level',
    cornerOrder:['nw','ne','se','sw'],
    cornerSemantics:'Vertex (vx,vy) is the top-left corner of tile (vx,vy). Tile (tx,ty) has nw=(tx,ty) ne=(tx+1,ty) se=(tx+1,ty+1) sw=(tx,ty+1). Pick one level per vertex from any world-space function; every tile reads the same level at a shared vertex, so the bands meet there. lookup[stem][mask]["nw,ne,se,sw"] lists the aliases (one per flavour); a - is a corner the mask does not touch; a mask that touches more than `exact` corners has only the key "-,-,-,-" (a cell cut at the middle level for any neighbours).',
    lookup,
    pairs:world.pairs.map(p=>({over:p.over,on:p.on,stem:`${p.over}-on-${p.on}`,depths:worldParams(world,p.over,p).depths}))};
}

/** Expand a reusable environment recipe into ordinary named, editable vector shapes. */
export function generateEnvironmentRecipe(config){
  if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Environment must be an object');
  for(const key of Object.keys(config))if(!['name','kind','seed','materials','variants','style','pixelScale','customMaterials','base','overlayEdge','overlays'].includes(key))throw Error(`Unknown environment field: ${key}`);
  const kind=config.kind,name=fallback(config.name,'environment'),seed=fallback(config.seed,7);
  const scale=readPixelScale(config);
  if(!['terrain','terrain-transition','terrain-overlay','habitat','furniture'].includes(kind))throw Error(`Unsupported environment kind: ${kind}`);
  if(typeof name!=='string'||! /^[a-z][a-z0-9_-]{0,47}$/.test(name))throw Error('Invalid environment name');
  if(!Number.isSafeInteger(seed))throw Error('Environment seed must be a safe integer');
  if(config.style!==undefined&&(kind!=='habitat'||!HABITAT_STYLES.includes(config.style)))throw Error('Habitat style must be cottage, workshop, kitchen, barn, capsule, vault, gantry or dome and applies only to habitat');
  const pixelKinds=['terrain','terrain-overlay'];
  if(!pixelKinds.includes(kind)&&config.materials!==undefined)throw Error('Materials apply only to terrain and terrain-overlay');
  if(!pixelKinds.includes(kind)&&config.customMaterials!==undefined)throw Error('customMaterials apply only to terrain and terrain-overlay');
  if(kind!=='terrain-overlay'&&config.base!==undefined)throw Error('base applies only to terrain-overlay');
  if(config.base!==undefined&&typeof config.base!=='boolean')throw Error('base must be a boolean');
  const edge=validateOverlayEdge(config.overlayEdge,kind);
  if(config.overlays!==undefined&&kind!=='terrain-overlay')throw Error('overlays applies only to terrain-overlay');
  if(!['terrain','terrain-transition','terrain-overlay'].includes(kind)&&config.variants!==undefined)throw Error('Variants apply only to terrain, terrain-transition and terrain-overlay');
  const builtinNames=[...TERRAIN_MATERIALS,...WASTELAND_MATERIALS];
  let custom=[];
  if(config.customMaterials!==undefined){
    if(!Array.isArray(config.customMaterials)||!config.customMaterials.length||config.customMaterials.length>32)throw Error('customMaterials must be an array of 1 to 32 materials');
    custom=config.customMaterials.map(def=>validateCustomMaterial(def,builtinNames));
    if(new Set(custom.map(c=>c.name)).size!==custom.length)throw Error('Custom material names must be unique');
  }
  const specs={...WASTELAND_SPECS,...Object.fromEntries(custom.map(c=>[c.name,c]))};
  const supported=kind==='terrain'?[...builtinNames,...custom.map(c=>c.name)]:[...WASTELAND_MATERIALS,...custom.map(c=>c.name)];
  const defaultMaterials=kind==='terrain-overlay'?[...WASTELAND_MATERIALS,...custom.map(c=>c.name)]:[...TERRAIN_MATERIALS,...custom.map(c=>c.name)];
  const materials=fallback(config.materials,defaultMaterials),variants=fallback(config.variants,kind==='terrain-overlay'?2:4);
  if(pixelKinds.includes(kind)){
    if(!Array.isArray(materials)||!materials.length||new Set(materials).size!==materials.length||materials.some(m=>!supported.includes(m)))throw Error(kind==='terrain'?'Terrain materials must be a nonempty unique array of supported materials':'Overlay materials must be a nonempty unique array of wasteland or custom materials');
    for(const c of custom)if(!materials.includes(c.name))throw Error(`Custom material ${c.name} is not listed in materials`);
  }
  if(kind==='terrain'&&(!Number.isInteger(variants)||variants<1||variants>4))throw Error('Terrain variants must be between 1 and 4');
  if(kind==='terrain-overlay'&&(!Number.isInteger(variants)||variants<1||variants>8))throw Error('Overlay variants must be between 1 and 8');
  if(kind==='terrain-transition'&&(!Number.isSafeInteger(variants)||variants<1||!Number.isSafeInteger(variants*TERRAIN_MASKS.length)||!Number.isSafeInteger(variants*32)))throw Error('Terrain transition variants require a positive safe integer and exactly representable sheet arithmetic');
  const world=kind==='terrain-overlay'?validateWorld(edge.world,materials):null,overlays=validateOverlays(config.overlays,kind,materials);
  const isPixel=m=>!!specs[m],frameCount=m=>specs[m]?.animated?ANIMATION_FRAMES:variants;
  const entries=[];
  if(kind==='terrain-transition')for(const mask of TERRAIN_MASKS)for(let v=0;v<variants;v++)entries.push({alias:`path_${mask}_${v}`,mask,variant:v});
  else if(kind==='terrain')for(const m of materials)for(let v=0;v<(isPixel(m)?frameCount(m):variants);v++)entries.push({alias:`${m}_${v}`,material:m,variant:v});
  else if(kind==='terrain-overlay'){
    if(config.base!==false)for(const m of materials)for(let v=0;v<frameCount(m);v++)entries.push({alias:`${m}_${v}`,material:m,variant:v,role:'base'});
    // one overlay set: `alias` is the name stem (`<material>`, `<material>-soft`, `<material>-on-<base>`); a world set has one cell per
    // (levels of the corners its mask touches, flavour), a classic set one per variant
    const addSet=(m,stem,role,extra,pair)=>{
      const masks=overlays.masks(m);
      if(world){
        const params=worldParams(world,m,pair);
        for(const mask of masks)for(const cell of worldVariants(mask,world))entries.push({alias:`${stem}_${mask}_${cell.variant}`,material:m,variant:cell.variant,role,mask,corners:cell.corners,flavour:cell.flavour,params,...extra});
      }else for(let v=0;v<variants;v++)for(const mask of masks)entries.push({alias:`${stem}_${mask}_${v}`,material:m,variant:v,role,mask,...extra});
    };
    const named=(list,what)=>{for(const m of list)if(!materials.includes(m))throw Error(`overlayEdge ${what} names ${m}, which is not in materials`);return list.filter(m=>!overlays.skip.has(m));};
    for(const m of materials)if(!overlays.skip.has(m))addSet(m,m,'overlay',{});
    if(edge.soft)for(const m of named(edge.soft===true?materials:edge.soft,'soft'))addSet(m,`${m}-soft`,'overlay',{soft:true});
    if(edge.shade)for(const m of named(edge.shade.materials??materials,'shade'))addSet(m,`${m}-shade`,'edge-shade',{});
    for(const pair of world?.pairs??[]){
      const stem=`${pair.over}-on-${pair.on}`;
      addSet(pair.over,stem,'overlay',{onMaterial:pair.on},pair);
      if(pair.soft)addSet(pair.over,`${stem}-soft`,'overlay',{soft:true,onMaterial:pair.on},pair);
      if(pair.shade)addSet(pair.over,`${stem}-shade`,'edge-shade',{onMaterial:pair.on},pair);
    }
    // an animated material's overlay plays with its base: the same cell in each phase, after the plain one
    const animated=edge.animate===true?materials.filter(m=>specs[m]?.animated):edge.animate??[];
    for(const m of animated)if(!materials.includes(m)||!specs[m]?.animated)throw Error(`overlayEdge animate names ${m}, which is not an animated material in materials`);
    if(animated.length){
      for(const e of [...entries])if(e.role==='overlay'&&animated.includes(e.material)){
        e.phase=0;e.frames=[e.alias];e.animation=`${e.alias}-anim`;
        for(let k=1;k<ANIMATION_FRAMES;k++){const alias=`${e.alias}-f${k}`;entries.push({...e,alias,phase:k,frame:k,frames:undefined});e.frames.push(alias);}
      }
    }
  }else for(const alias of kind==='habitat'?['habitat_floor','habitat_back','habitat_front','habitat_roof']:Object.keys(FURNITURE_COLLISIONS))entries.push({alias});
  const aliases=entries.map(e=>e.alias);
  const screenWidth=kind==='habitat'?320:kind.startsWith('terrain')?32:64,screenHeight=kind==='habitat'?256:screenWidth,width=screenWidth/scale,height=screenHeight/scale,cols=kind==='terrain-overlay'?Math.min(OVERLAY_MASKS.length,aliases.length):kind.startsWith('terrain')?variants:kind==='habitat'?2:3;
  const operations=[{command:'new',name,size:`${width}x${height}`,cols,rows:Math.ceil(aliases.length/cols),palette:'pico8'}],frames=[];
  for(const [index,alias] of aliases.entries()){
    const cell=`${Math.floor(index/cols)},${index%cols}`,names=new Set(),bounds={left:screenWidth,top:screenHeight,right:-1,bottom:-1};
    operations.push({command:'clear',cell},{command:'name',cell,as:alias});
    const add=(type,part,color,fields,points)=>{
      if(names.has(part))throw Error(`Duplicate environment shape: ${alias}/${part}`);names.add(part);
      for(const [x,y] of points){
        if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=screenWidth||y>=screenHeight)throw Error(`Out-of-cell environment shape: ${alias}/${part} (${x},${y})`);
        bounds.left=Math.min(bounds.left,x);bounds.right=Math.max(bounds.right,x);bounds.top=Math.min(bounds.top,y);bounds.bottom=Math.max(bounds.bottom,y);
      }
      const shape=scaleShape(type,fields,scale);
      operations.push({command:'draw',cell,type:shape.type,name:part,color,filled:true,...shape.fields});
    };
    const pen={
      rect(n,x,y,w,h,c){if(w<1||h<1)throw Error('Empty environment rectangle');add('rect',n,c,{x,y,w,h},[[x,y],[x+w-1,y+h-1]]);},
      poly(n,p,c){add('polygon',n,c,{points:p.map(([x,y])=>({x,y}))},p);},
      line(n,x1,y1,x2,y2,c){add('line',n,c,{x1,y1,x2,y2},[[x1,y1],[x2,y2]]);},
      ellipse(n,cx,cy,rx,ry,c){add('ellipse',n,c,{cx,cy,rx,ry},[[cx-rx,cy-ry],[cx+rx,cy+ry]]);},
    };
    Object.defineProperty(pen,'pixelScale',{value:scale});
    Object.defineProperty(pen,'src',{value:sourcePen(pen,scale)});
    let details={};
    const entry=entries[index];
    if(kind==='terrain'&&isPixel(entry.material)){
      const spec=specs[entry.material];
      drawPixelTile(pen,materialTile(entry.material,spec,entry.variant,seed,entry.variant));
      details={material:entry.material,variant:entry.variant,seamless:true,...(spec.animated?{animation:entry.material}:{})};
    }else if(kind==='terrain-overlay'){
      const spec=specs[entry.material];
      if(entry.role==='base'){
        drawPixelTile(pen,materialTile(entry.material,spec,entry.variant,seed,entry.variant));
        details={material:entry.material,role:'base',variant:entry.variant,seamless:true,...(spec.animated?{animation:entry.material}:{})};
      }else{
        const maskInfo={mask:entry.mask,variant:entry.variant,neighbors:Object.entries(OVERLAY_BITS).filter(([,bit])=>entry.mask&bit).map(([k])=>k)};
        // world cells shape the bands from the crossing levels of their corners; classic cells from a per-variant ragged profile
        const matSeed=seed^(hashName(entry.material)>>>0);
        const coverage=entry.params?worldCoverage(entry.mask,entry.corners.map(l=>entry.params.depths[l??Math.floor((entry.params.depths.length-1)/2)]),entry.flavour,matSeed^(world.seed*2654435761|0),{...entry.params,round:edge.round}):overlayCoverage(entry.mask,entry.variant,matSeed,{round:edge.round});
        const worldInfo=entry.params?{corners:entry.corners,flavour:entry.flavour,...(entry.onMaterial?{on:entry.onMaterial}:{})}:{};
        if(entry.role==='edge-shade'){
          // the band is cut from the very coverage the overlay of this material, mask and variant uses, so it hugs the same ragged edge
          drawPixelTile(pen,edgeShadePixels(coverage,edge.shade));
          details={material:entry.material,role:'edge-shade',...maskInfo,...worldInfo};
        }else{
          // an animated material overlays with the ripple phase of its variant (overlays are static snapshots) unless `animate` gives it every phase
          const texVariant=entry.params?entry.flavour%variants:entry.variant;
          const tile=materialTile(entry.material,spec,texVariant,seed,(texVariant+(entry.phase??0))%ANIMATION_FRAMES);
          drawPixelTile(pen,overlayPixels(coverage,tile,edge.rim&&!entry.soft?rimColors(spec.ramp):null));
          details={material:entry.material,role:'overlay',...maskInfo,...worldInfo,...(entry.phase!==undefined?{phase:entry.phase,...(entry.animation?{animation:entry.animation}:{})}:{})};
        }
      }
    }else if(kind==='terrain'){
      const material=entry.material,variant=entry.variant;
      drawTerrain(pen,material,variant,seed);details={material,variant,seamless:true};
    }else if(kind==='terrain-transition'){
      const mask=TERRAIN_MASKS[Math.floor(index/variants)],variant=index%variants;
      drawTerrainTransition(pen,mask,variant,seed);details={mask,variant,foreground:'packed-earth',background:'moss'};
    }else if(kind==='habitat'){if(config.style)drawStyledHabitat(pen,alias,seed,config.style);else drawHabitat(pen,alias,seed);}
    else{drawFurniture(pen,alias,seed);details={collision:{...FURNITURE_COLLISIONS[alias]},ground:{x:32,y:62},...(scale>1?{sourceGround:{x:32/scale,y:62/scale}}:{})};}
    operations.push({command:'shape-group',sub:'create',cell,name:'environment',shapes:[...names]});
    frames.push({alias,cell,...details,bounds:screenBounds(bounds,scale),...(scale>1?{sourceBounds:sourceBounds(bounds,scale)}:{})});
  }
  const animations=[];
  for(const m of kind.startsWith('terrain')&&kind!=='terrain-transition'?materials:[])if(specs[m]?.animated){
    const own=frames.filter(f=>f.material===m&&f.role!=='overlay'&&!f.on);
    if(!own.length)continue;
    operations.push({command:'group',sub:'create',name:m,cells:own.map(f=>f.cell),fps:specs[m].fps});
    animations.push({name:m,fps:specs[m].fps,frames:own.map(f=>f.alias),cells:own.map(f=>f.cell)});
  }
  // overlay phases (`overlayEdge.animate`): one tag per cell set, plain alias first then -f1 to -f3, in step with the material's base tag
  for(const e of entries)if(e.frames){
    const own=e.frames.map(a=>frames.find(f=>f.alias===a));
    operations.push({command:'group',sub:'create',name:e.animation,cells:own.map(f=>f.cell),fps:specs[e.material].fps});
    animations.push({name:e.animation,fps:specs[e.material].fps,frames:e.frames,cells:own.map(f=>f.cell),overlay:true});
  }
  operations.push(kind==='furniture'?{command:'pivot',x:32/scale,y:62/scale}:{command:'pivot',x:0,y:0});
  return {operations,report:{version:1,ok:true,kind,seed,cellSize:{width,height},...(config.pixelScale!==undefined?{pixelScale:scale,screenCellSize:{width:screenWidth,height:screenHeight}}:{}),frames,...(kind==='terrain-transition'?{neighbors:TRANSITION_BITS,normalizeDiagonals:true,seams:'matching-neighborhood-edges',foreground:'packed-earth',background:'moss'}:{}),...(animations.length?{animations}:{}),...(custom.length?{customMaterials:custom.map(c=>c.name)}:{}),...(kind==='terrain-overlay'?{materials,variants,base:config.base!==false,neighbors:OVERLAY_BITS,maskSemantics:'Mask bit set = that neighbour of the tile is this overlay material. The overlay bleeds into the tile across that edge or corner; the tile base material shows elsewhere.',normalizeDiagonals:'A diagonal bit is meaningful only when both adjacent cardinal bits are clear; otherwise it is cleared.',validMasks:OVERLAY_MASKS,emptyMask:0,edgeDepth:EDGE_DEPTH*2,edgeDepthSource:EDGE_DEPTH,edgeDepthUnits:'edgeDepth is in screen pixels, edgeDepthSource in source pixels of the cell',seams:'matching-neighborhood-edges',aliasPattern:'<material>_<mask>_<variant> overlay, <material>_<variant> base'}:{}),...(world?{world:worldReport(world,frames)}:{}),...(edge.shade?{edgeShade:{width:edge.shade.width,widthUnits:'source pixels of the cell',color:edge.shade.color,dir:edge.shade.dir,materials:edge.shade.materials??materials,aliasPattern:'<material>-shade_<mask>_<variant>',semantics:'Same mask and variant as the overlay of that material: the band lies on the uncovered pixels within width of the overlay edge (dir light: below and right of it; all: every side). Draw it over the tile base and under the overlay, at one opacity.'}}:{}),...(kind==='habitat'?{layout:structuredClone(HABITAT_LAYOUT),...(config.style?{style:config.style}:{})}:{})}};
}
