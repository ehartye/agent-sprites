import {drawTerrain, TERRAIN_MATERIALS} from './environment-terrain.js';
import {drawHabitat, drawFurniture, HABITAT_LAYOUT, FURNITURE_COLLISIONS} from './environment-habitat.js';

const fallback=(value,other)=>value===undefined?other:value;

/** Expand a reusable environment recipe into ordinary named, editable vector shapes. */
export function generateEnvironmentRecipe(config){
  if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Environment must be an object');
  for(const key of Object.keys(config))if(!['name','kind','seed','materials','variants'].includes(key))throw Error(`Unknown environment field: ${key}`);
  const kind=config.kind,name=fallback(config.name,'environment'),seed=fallback(config.seed,7);
  if(!['terrain','habitat','furniture'].includes(kind))throw Error(`Unsupported environment kind: ${kind}`);
  if(typeof name!=='string'||! /^[a-z][a-z0-9_-]{0,47}$/.test(name))throw Error('Invalid environment name');
  if(!Number.isSafeInteger(seed))throw Error('Environment seed must be a safe integer');
  if(kind!=='terrain'&&(config.materials!==undefined||config.variants!==undefined))throw Error('Materials and variants apply only to terrain');
  const materials=fallback(config.materials,TERRAIN_MATERIALS),variants=fallback(config.variants,4);
  if(kind==='terrain'){
    if(!Array.isArray(materials)||!materials.length||new Set(materials).size!==materials.length||materials.some(m=>!TERRAIN_MATERIALS.includes(m)))throw Error('Terrain materials must be a nonempty unique array of supported materials');
    if(!Number.isInteger(variants)||variants<1||variants>4)throw Error('Terrain variants must be between 1 and 4');
  }
  const aliases=kind==='terrain'?materials.flatMap(m=>Array.from({length:variants},(_,v)=>`${m}_${v}`)):kind==='habitat'?['habitat_floor','habitat_back','habitat_front','habitat_roof']:Object.keys(FURNITURE_COLLISIONS);
  const width=kind==='habitat'?320:kind==='terrain'?32:64,height=kind==='habitat'?256:width,cols=kind==='terrain'?variants:kind==='habitat'?2:3;
  const operations=[{command:'new',name,size:`${width}x${height}`,cols,rows:Math.ceil(aliases.length/cols),palette:'pico8'}],frames=[];
  for(const [index,alias] of aliases.entries()){
    const cell=`${Math.floor(index/cols)},${index%cols}`,names=new Set(),bounds={left:width,top:height,right:-1,bottom:-1};
    operations.push({command:'clear',cell},{command:'name',cell,as:alias});
    const add=(type,part,color,fields,points)=>{
      if(names.has(part))throw Error(`Duplicate environment shape: ${alias}/${part}`);names.add(part);
      for(const [x,y] of points){
        if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=width||y>=height)throw Error(`Out-of-cell environment shape: ${alias}/${part} (${x},${y})`);
        bounds.left=Math.min(bounds.left,x);bounds.right=Math.max(bounds.right,x);bounds.top=Math.min(bounds.top,y);bounds.bottom=Math.max(bounds.bottom,y);
      }
      operations.push({command:'draw',cell,type,name:part,color,filled:true,...fields});
    };
    const pen={
      rect(n,x,y,w,h,c){if(w<1||h<1)throw Error('Empty environment rectangle');add('rect',n,c,{x,y,w,h},[[x,y],[x+w-1,y+h-1]]);},
      poly(n,p,c){add('polygon',n,c,{points:p.map(([x,y])=>({x,y}))},p);},
      line(n,x1,y1,x2,y2,c){add('line',n,c,{x1,y1,x2,y2},[[x1,y1],[x2,y2]]);},
      ellipse(n,cx,cy,rx,ry,c){add('ellipse',n,c,{cx,cy,rx,ry},[[cx-rx,cy-ry],[cx+rx,cy+ry]]);},
    };
    let details={};
    if(kind==='terrain'){
      const material=materials[Math.floor(index/variants)],variant=index%variants;
      drawTerrain(pen,material,variant,seed);details={material,variant,seamless:true};
    }else if(kind==='habitat')drawHabitat(pen,alias,seed);
    else{drawFurniture(pen,alias,seed);details={collision:{...FURNITURE_COLLISIONS[alias]},ground:{x:32,y:62}};}
    operations.push({command:'shape-group',sub:'create',cell,name:'environment',shapes:[...names]});
    frames.push({alias,cell,...details,bounds});
  }
  operations.push(kind==='furniture'?{command:'pivot',x:32,y:62}:{command:'pivot',x:0,y:0});
  return {operations,report:{version:1,ok:true,kind,seed,cellSize:{width,height},frames,...(kind==='habitat'?{layout:structuredClone(HABITAT_LAYOUT)}:{})}};
}
