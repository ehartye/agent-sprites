import {test,expect} from 'vitest';
import {normalizeTerrainMask,TERRAIN_MASKS,TRANSITION_BITS,terrainTransitionPixels} from '../../server/authoring/environment-transition.js';
import {generateEnvironmentRecipe} from '../../server/authoring/environment.js';

const offsets=[[0,-1], [1,-1], [1,0], [1,1], [0,1], [-1,1], [-1,0], [-1,-1]];
const maskAt=(cells,x,y)=>normalizeTerrainMask(offsets.reduce((m,[dx,dy],i)=>m|(cells.has(`${x+dx},${y+dy}`)?1<<i:0),0));
test('all 47 masks produce four deterministic bounded editable transitions',()=>{
  expect(TERRAIN_MASKS).toHaveLength(47);
  const recipe=generateEnvironmentRecipe({kind:'terrain-transition'});
  expect(recipe.report.frames).toHaveLength(188);expect(recipe.report.neighbors).toEqual(TRANSITION_BITS);
  expect(generateEnvironmentRecipe({kind:'terrain-transition'})).toEqual(recipe);
  for(const frame of recipe.report.frames){
    expect(frame.bounds).toEqual({left:0,top:0,right:31,bottom:31});
    expect(frame.alias).toBe(`path_${frame.mask}_${frame.variant}`);
  }
  expect(terrainTransitionPixels(0,0,7)).not.toEqual(terrainTransitionPixels(0,0,8));
  for(const mask of TERRAIN_MASKS)expect(new Set([0,1,2,3].map(v=>terrainTransitionPixels(mask,v).join())).size).toBe(4);
});

test('every possible adjacent neighborhood agrees across both seams, for all variant pairs',()=>{
  const cache=new Map(TERRAIN_MASKS.map(m=>[m,[0,1,2,3].map(v=>terrainTransitionPixels(m,v))]));
  for(const vertical of [false,true]){
    const points=[];for(let y=-1;y<=1;y++)for(let x=-1;x<=2;x++)if(!(y===0&&(x===0||x===1)))points.push([x,y]);
    for(let bits=0;bits<1<<points.length;bits++){
      const cells=new Set(['0,0',vertical?'0,1':'1,0']);
      points.forEach(([x,y],i)=>{if(bits&(1<<i))cells.add(vertical?`${y},${x}`:`${x},${y}`);});
      const a=cache.get(maskAt(cells,0,0)),b=cache.get(maskAt(cells,vertical?0:1,vertical?1:0));
      for(let av=0;av<4;av++)for(let bv=0;bv<4;bv++)for(let i=0;i<32;i++){
        const left=a[av][vertical?31*32+i:i*32+31],right=b[bv][vertical?i:i*32];
        if(left!==right)throw Error(`Seam mismatch: ${vertical} ${bits} ${av}/${bv} at ${i}`);
      }
    }
  }
});
test('isolated and corner cells visibly round the silhouette rather than only adding specks',()=>{
  const isolated=terrainTransitionPixels(0),center=terrainTransitionPixels(255),grass='#627e62';
  expect(isolated[0]).toBe(grass);expect(isolated[16*32]).toBe(grass);
  expect(['#627e62','#6b8464','#5c785e']).toContain(isolated[16*32+5]);expect(isolated[16*32+16]).not.toBe(grass);
  expect(center.filter(c=>c===grass)).toHaveLength(0);
  expect(terrainTransitionPixels(5)).not.toEqual(terrainTransitionPixels(7));
});
test.each([-1,256,1.5,null,NaN,Infinity])('rejects invalid masks %s',mask=>expect(()=>normalizeTerrainMask(mask)).toThrow());
test('procedural transition variants have no arbitrary catalogue cap',()=>{
  const result=generateEnvironmentRecipe({kind:'terrain-transition',variants:5});
  expect(result.report.frames).toHaveLength(235);expect(result.report.frames.at(-1).alias).toBe('path_255_4');
  expect(terrainTransitionPixels(7,4)).not.toEqual(terrainTransitionPixels(7,3));
});
test.each([{variants:0},{variants:Number.MAX_SAFE_INTEGER},{variants:1.5},{variants:null},{materials:['moss']},{seed:1.5}])('rejects invalid transition config %j',config=>expect(()=>generateEnvironmentRecipe({kind:'terrain-transition',...config})).toThrow());
