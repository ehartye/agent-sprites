import {drawTerrain, TERRAIN_MATERIALS} from './environment-terrain.js';
import {drawTerrainTransition,TERRAIN_MASKS,TRANSITION_BITS} from './environment-transition.js';
import {drawHabitat, drawFurniture, HABITAT_LAYOUT, FURNITURE_COLLISIONS} from './environment-habitat.js';
import {drawStyledHabitat,HABITAT_STYLES} from './environment-habitat-styles.js';
import {GRID,WASTELAND_SPECS,WASTELAND_MATERIALS,ANIMATION_FRAMES,materialTile,validateCustomMaterial} from './environment-materials.js';
import {EDGE_DEPTH,OVERLAY_BITS,OVERLAY_MASKS,overlayCoverage,overlayPixels} from './environment-overlay.js';
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

/** Expand a reusable environment recipe into ordinary named, editable vector shapes. */
export function generateEnvironmentRecipe(config){
  if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Environment must be an object');
  for(const key of Object.keys(config))if(!['name','kind','seed','materials','variants','style','pixelScale','customMaterials','base'].includes(key))throw Error(`Unknown environment field: ${key}`);
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
  const isPixel=m=>!!specs[m],frameCount=m=>specs[m]?.animated?ANIMATION_FRAMES:variants;
  const entries=[];
  if(kind==='terrain-transition')for(const mask of TERRAIN_MASKS)for(let v=0;v<variants;v++)entries.push({alias:`path_${mask}_${v}`,mask,variant:v});
  else if(kind==='terrain')for(const m of materials)for(let v=0;v<(isPixel(m)?frameCount(m):variants);v++)entries.push({alias:`${m}_${v}`,material:m,variant:v});
  else if(kind==='terrain-overlay'){
    if(config.base!==false)for(const m of materials)for(let v=0;v<frameCount(m);v++)entries.push({alias:`${m}_${v}`,material:m,variant:v,role:'base'});
    for(const m of materials)for(let v=0;v<variants;v++)for(const mask of OVERLAY_MASKS)if(mask)entries.push({alias:`${m}_${mask}_${v}`,material:m,variant:v,role:'overlay',mask});
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
        // an animated material overlays with the ripple phase of its variant: overlays are static snapshots
        const tile=materialTile(entry.material,spec,entry.variant,seed,entry.variant%ANIMATION_FRAMES);
        drawPixelTile(pen,overlayPixels(overlayCoverage(entry.mask,entry.variant,seed^(hashName(entry.material)>>>0)),tile,null));
        details={material:entry.material,role:'overlay',mask:entry.mask,variant:entry.variant,neighbors:Object.entries(OVERLAY_BITS).filter(([,bit])=>entry.mask&bit).map(([k])=>k)};
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
    const own=frames.filter(f=>f.material===m&&f.role!=='overlay');
    if(!own.length)continue;
    operations.push({command:'group',sub:'create',name:m,cells:own.map(f=>f.cell),fps:specs[m].fps});
    animations.push({name:m,fps:specs[m].fps,frames:own.map(f=>f.alias),cells:own.map(f=>f.cell)});
  }
  operations.push(kind==='furniture'?{command:'pivot',x:32/scale,y:62/scale}:{command:'pivot',x:0,y:0});
  return {operations,report:{version:1,ok:true,kind,seed,cellSize:{width,height},...(config.pixelScale!==undefined?{pixelScale:scale,screenCellSize:{width:screenWidth,height:screenHeight}}:{}),frames,...(kind==='terrain-transition'?{neighbors:TRANSITION_BITS,normalizeDiagonals:true,seams:'matching-neighborhood-edges',foreground:'packed-earth',background:'moss'}:{}),...(animations.length?{animations}:{}),...(custom.length?{customMaterials:custom.map(c=>c.name)}:{}),...(kind==='terrain-overlay'?{materials,variants,base:config.base!==false,neighbors:OVERLAY_BITS,maskSemantics:'Mask bit set = that neighbour of the tile is this overlay material. The overlay bleeds into the tile across that edge or corner; the tile base material shows elsewhere.',normalizeDiagonals:'A diagonal bit is meaningful only when both adjacent cardinal bits are clear; otherwise it is cleared.',validMasks:OVERLAY_MASKS,emptyMask:0,edgeDepth:EDGE_DEPTH*2,edgeDepthSource:EDGE_DEPTH,edgeDepthUnits:'edgeDepth is in screen pixels, edgeDepthSource in source pixels of the cell',seams:'matching-neighborhood-edges',aliasPattern:'<material>_<mask>_<variant> overlay, <material>_<variant> base'}:{}),...(kind==='habitat'?{layout:structuredClone(HABITAT_LAYOUT),...(config.style?{style:config.style}:{})}:{})}};
}
