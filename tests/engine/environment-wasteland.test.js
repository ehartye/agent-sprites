import {test,expect,describe} from 'vitest';
import {createHash} from 'node:crypto';
import {generateEnvironmentRecipe} from '../../server/authoring/environment.js';
import {GRID,WASTELAND_SPECS,WASTELAND_MATERIALS,materialTile} from '../../server/authoring/environment-materials.js';
import {EDGE_DEPTH,OVERLAY_MASKS,normalizeOverlayMask,overlayCoverage,overlayPixels} from '../../server/authoring/environment-overlay.js';
import {Cell} from '../../server/engine/cell.js';
import {Palette} from '../../server/engine/palette.js';
import {CanvasRenderer} from '../../server/engine/canvas-renderer.js';

const renderer=new CanvasRenderer(new Palette());
function render(recipe,frame){
  const {width:w,height:h}=recipe.report.cellSize,cell=new Cell({w,h});
  for(const op of recipe.operations.filter(o=>o.command==='draw'&&o.cell===frame.cell)){
    const {command,type,name,color,cell:_,...params}=op;cell.draw(type,params,color,name);
  }
  return {w,h,data:renderer.renderCellRaw(cell)};
}
const hex=(d,i)=>d[i+3]===0?null:'#'+[0,1,2].map(k=>d[i+k].toString(16).padStart(2,'0')).join('');
const grid=f=>Array.from({length:f.w*f.h},(_,i)=>hex(f.data,i*4));
const strays=px=>{
  let n=0;
  for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++){
    const c=px[y*GRID+x];if(c===null)continue;let ok=false;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&px[((y+dy+GRID)%GRID)*GRID+(x+dx+GRID)%GRID]===c)ok=true;
    if(!ok)n++;
  }
  return n;
};
const ground=['dust','sand','gravel','rubble','concrete','asphalt','ash','mud','slag','fused-glass','water','salt-crust','clay','tilled-soil','tilled-soil-wet'];

describe('wasteland materials',()=>{
  test('the built-in set is exactly the Fallow Valley ground list',()=>expect([...WASTELAND_MATERIALS].sort()).toEqual([...ground].sort()));
  test.each(ground)('%s tiles repeat: matching opposite edges shared by every variant, no strays, only ramp colors',material=>{
    const spec=WASTELAND_SPECS[material],tiles=Array.from({length:4},(_,v)=>materialTile(material,spec,v,7,v));
    expect(new Set(tiles.map(t=>t.join())).size,'distinct variants').toBe(4);
    const allowed=new Set([...spec.ramp,...spec.patterns.flatMap(p=>p.color?[p.color]:[])]);
    for(const t of tiles){
      for(let i=0;i<GRID;i++){expect(t[i*GRID]).toBe(t[i*GRID+GRID-1]);expect(t[i]).toBe(t[(GRID-1)*GRID+i]);}
      for(const c of t)expect(allowed.has(c),`${material} ${c}`).toBe(true);
      expect(strays(t),`${material} strays`).toBe(0);
      const counts=new Map();for(const c of t)counts.set(c,(counts.get(c)??0)+1);
      expect(Math.max(...counts.values())/t.length).toBeLessThan(material==='water'?.99:.95);
    }
    for(const t of tiles)for(let i=0;i<GRID;i++){expect(t[i*GRID]).toBe(tiles[0][i*GRID]);expect(t[i]).toBe(tiles[0][i]);}
    expect(materialTile(material,spec,2,7,2)).toEqual(tiles[2]);
    expect(materialTile(material,spec,2,8,2)).not.toEqual(tiles[2]);
  });
  test('hard surfaces keep seams and cracks, natural surfaces stay low contrast',()=>{
    const concrete=materialTile('concrete',WASTELAND_SPECS.concrete,0,7);
    expect(concrete.slice(7*GRID,8*GRID).every(c=>c===WASTELAND_SPECS.concrete.ramp[1])).toBe(true);
    const lum=c=>parseInt(c.slice(1,3),16)*.3+parseInt(c.slice(3,5),16)*.6+parseInt(c.slice(5,7),16)*.1;
    for(const m of ['dust','ash','mud']){const [base,dark,light]=WASTELAND_SPECS[m].ramp;expect(Math.abs(lum(light)-lum(dark))).toBeLessThan(80);expect(base).toBeTruthy();}
  });
  test('asphalt variant 3 carries faded lane paint and cracks appear on variants 1 and 2',()=>{
    const [,,,paint]=WASTELAND_SPECS.asphalt.ramp,count=v=>materialTile('asphalt',WASTELAND_SPECS.asphalt,v,7).filter(c=>c===paint).length;
    expect(count(3)).toBeGreaterThan(20);expect(count(0)).toBe(0);expect(count(1)).toBe(0);
  });
  test('terrain recipe renders every material at both pixel scales with hard alpha',()=>{
    for(const pixelScale of [1,2]){
      const recipe=generateEnvironmentRecipe({kind:'terrain',materials:ground,variants:2,pixelScale});
      const size=pixelScale===2?16:32;
      expect(recipe.report.cellSize).toEqual({width:size,height:size});
      const aliases=recipe.report.frames.map(f=>f.alias);
      expect(new Set(aliases).size).toBe(aliases.length);
      for(const frame of recipe.report.frames){
        const f=render(recipe,frame);
        for(let i=3;i<f.data.length;i+=4)expect(f.data[i]).toBe(255);
        for(let i=0;i<size;i++){
          expect(f.data.slice((i*size)*4,(i*size)*4+4)).toEqual(f.data.slice((i*size+size-1)*4,(i*size+size-1)*4+4));
          expect(f.data.slice(i*4,i*4+4)).toEqual(f.data.slice(((size-1)*size+i)*4,((size-1)*size+i)*4+4));
        }
        if(pixelScale===1){const g=grid(f);for(let y=0;y<32;y+=2)for(let x=0;x<32;x+=2)expect(g[y*32+x]).toBe(g[(y+1)*32+x+1]);}
      }
    }
  });
  test('water is a four frame animation exported as an Aseprite tag; other materials keep the requested variants',()=>{
    const recipe=generateEnvironmentRecipe({kind:'terrain',materials:['dust','water'],variants:2,pixelScale:2});
    expect(recipe.report.frames.map(f=>f.alias)).toEqual(['dust_0','dust_1','water_0','water_1','water_2','water_3']);
    expect(recipe.report.animations).toEqual([{name:'water',fps:4,frames:['water_0','water_1','water_2','water_3'],cells:['1,0','1,1','2,0','2,1']}]);
    expect(recipe.operations.find(o=>o.command==='group')).toEqual({command:'group',sub:'create',name:'water',cells:['1,0','1,1','2,0','2,1'],fps:4});
    const frames=recipe.report.frames.filter(f=>f.material==='water').map(f=>grid(render(recipe,f)).join());
    expect(new Set(frames).size).toBe(4);
    // ripples move, the shared edges do not
    const g=recipe.report.frames.filter(f=>f.material==='water').map(f=>grid(render(recipe,f)));
    for(const t of g)for(let i=0;i<16;i++){expect(t[i*16]).toBe(g[0][i*16]);expect(t[i]).toBe(g[0][i]);}
  });
  test('legacy default and subset recipes are unchanged by the new engine',()=>{
    const sha=c=>createHash('sha256').update(JSON.stringify(generateEnvironmentRecipe(c))).digest('hex');
    expect(sha({kind:'terrain'})).toBe('868dad783c2602a4c381111b3a6a399712d6b99d2721bc6f880115b106a822ef');
    expect(generateEnvironmentRecipe({kind:'terrain'}).report.frames).toHaveLength(24);
    expect(generateEnvironmentRecipe({kind:'terrain'}).report.animations).toBeUndefined();
  });
});

describe('custom materials',()=>{
  const ok={name:'bone-field',ramp:['#c8c0a8','#a8a088','#e0d8c0','#f4eed8'],patterns:[{kind:'speckle',density:.4},{kind:'cracks',density:.5},{kind:'clusters',size:'large',shade:true}],seed:3};
  test('build inline, deterministically, through terrain and overlays',()=>{
    const a=generateEnvironmentRecipe({kind:'terrain',materials:['dust','bone-field'],customMaterials:[ok],pixelScale:2});
    expect(generateEnvironmentRecipe({kind:'terrain',materials:['dust','bone-field'],customMaterials:[ok],pixelScale:2})).toEqual(a);
    expect(a.report.frames.filter(f=>f.material==='bone-field')).toHaveLength(4);
    expect(a.report.customMaterials).toEqual(['bone-field']);
    const o=generateEnvironmentRecipe({kind:'terrain-overlay',materials:['bone-field'],customMaterials:[ok],variants:1,pixelScale:2});
    expect(o.report.frames.some(f=>f.alias==='bone-field_5_0')).toBe(true);
    const changed=generateEnvironmentRecipe({kind:'terrain',materials:['bone-field'],customMaterials:[{...ok,seed:4}],pixelScale:2});
    expect(changed.operations).not.toEqual(generateEnvironmentRecipe({kind:'terrain',materials:['bone-field'],customMaterials:[ok],pixelScale:2}).operations);
  });
  test('an animated custom material exports its own tag',()=>{
    const pond={name:'toxic-pond',ramp:['#5a2f6a','#3b1f47','#7a4a8c','#8fc43a'],patterns:[{kind:'ripples',density:.8}],animated:true,fps:6};
    const r=generateEnvironmentRecipe({kind:'terrain',materials:['toxic-pond'],customMaterials:[pond]});
    expect(r.report.animations).toMatchObject([{name:'toxic-pond',fps:6}]);
  });
  test.each([
    ['unknown field',{...ok,color:'#fff'}],['bad name',{...ok,name:'Bad_Name'}],['builtin collision',{...ok,name:'dust'}],
    ['short ramp',{...ok,ramp:['#000000']}],['bad hex',{...ok,ramp:['red','#000000','#000000','#000000']}],
    ['no patterns',{...ok,patterns:[]}],['unknown pattern',{...ok,patterns:[{kind:'swirl'}]}],
    ['unknown pattern field',{...ok,patterns:[{kind:'cracks',size:'large'}]}],['density range',{...ok,patterns:[{kind:'speckle',density:2}]}],
    ['bad tone',{...ok,patterns:[{kind:'speckle',tone:'neon'}]}],['bad seed',{...ok,seed:1.5}],
    ['animated without ripples',{...ok,animated:true}],['fps without animated',{...ok,fps:4}],['bad variants',{...ok,patterns:[{kind:'cracks',variants:[9]}]}],
  ])('rejects custom material: %s',(_,def)=>expect(()=>generateEnvironmentRecipe({kind:'terrain',materials:['bone-field'],customMaterials:[def]})).toThrow());
  test('rejects duplicates, unlisted customs, non-arrays and use on other kinds',()=>{
    expect(()=>generateEnvironmentRecipe({kind:'terrain',materials:['bone-field'],customMaterials:[ok,ok]})).toThrow(/unique/);
    expect(()=>generateEnvironmentRecipe({kind:'terrain',materials:['dust'],customMaterials:[ok]})).toThrow(/not listed/);
    expect(()=>generateEnvironmentRecipe({kind:'terrain',materials:['bone-field'],customMaterials:ok})).toThrow(/array/);
    expect(()=>generateEnvironmentRecipe({kind:'terrain',customMaterials:[]})).toThrow();
    expect(()=>generateEnvironmentRecipe({kind:'habitat',customMaterials:[ok]})).toThrow(/customMaterials/);
    expect(()=>generateEnvironmentRecipe({kind:'terrain',materials:['nope']})).toThrow();
  });
});

describe('terrain-overlay',()=>{
  const offsets=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
  const maskAt=(cells,x,y)=>normalizeOverlayMask(offsets.reduce((m,[dx,dy],i)=>m|(cells.has(`${x+dx},${y+dy}`)?1<<i:0),0));

  test('encroachment corner rule yields exactly the 47 masks, a diagonal counting only when both cardinals are clear',()=>{
    expect(OVERLAY_MASKS).toHaveLength(47);
    expect(normalizeOverlayMask(1|2)).toBe(1);expect(normalizeOverlayMask(4|2)).toBe(4);
    expect(normalizeOverlayMask(2)).toBe(2);expect(normalizeOverlayMask(255)).toBe(1|4|16|64);
    for(const bad of [-1,256,1.5,null,NaN])expect(()=>normalizeOverlayMask(bad)).toThrow();
    expect(OVERLAY_MASKS.length).toBe(16+16+8+2+4+1);
  });

  test('report lists base and overlay frames, masks, variants, semantics and aliases',()=>{
    const r=generateEnvironmentRecipe({kind:'terrain-overlay',materials:['dust','sand'],variants:2,pixelScale:2});
    const {report}=r;
    expect(report).toMatchObject({kind:'terrain-overlay',materials:['dust','sand'],variants:2,base:true,emptyMask:0,seams:'matching-neighborhood-edges'});
    expect(report.neighbors).toEqual({n:1,ne:2,e:4,se:8,s:16,sw:32,w:64,nw:128});
    expect(report.validMasks).toEqual(OVERLAY_MASKS);
    expect(report.maskSemantics).toMatch(/neighbour/);expect(report.normalizeDiagonals).toMatch(/both adjacent cardinal bits are clear/);
    const overlays=report.frames.filter(f=>f.role==='overlay'),bases=report.frames.filter(f=>f.role==='base');
    expect(bases.map(f=>f.alias)).toEqual(['dust_0','dust_1','sand_0','sand_1']);
    expect(overlays).toHaveLength(2*2*46);
    expect(new Set(report.frames.map(f=>f.alias)).size).toBe(report.frames.length);
    for(const f of overlays){expect(f.alias).toBe(`${f.material}_${f.mask}_${f.variant}`);expect(OVERLAY_MASKS).toContain(f.mask);}
    expect(overlays.find(f=>f.alias==='dust_5_0').neighbors).toEqual(['n','e']);
    expect(generateEnvironmentRecipe({kind:'terrain-overlay',materials:['dust','sand'],variants:2,pixelScale:2})).toEqual(r);
    expect(generateEnvironmentRecipe({kind:'terrain-overlay',materials:['dust'],variants:1,base:false}).report.frames.every(f=>f.role==='overlay')).toBe(true);
  });

  test('overlay tiles have hard alpha, transparency where the base shows, and organic non-straight edges',()=>{
    const r=generateEnvironmentRecipe({kind:'terrain-overlay',materials:['concrete'],variants:2,pixelScale:2});
    for(const frame of r.report.frames.filter(f=>f.role==='overlay')){
      const f=render(r,frame),g=grid(f),opaque=g.filter(c=>c!==null).length;
      for(let i=3;i<f.data.length;i+=4)expect([0,255]).toContain(f.data[i]);
      expect(opaque,frame.alias).toBeGreaterThan(0);
      if(frame.mask!==255&&frame.mask!==85)expect(opaque,frame.alias).toBeLessThan(256);
    }
    const mask1=overlayCoverage(1,0);
    const depths=Array.from({length:GRID},(_,x)=>mask1.slice(x,GRID*GRID).filter((_,i)=>i%GRID===0).findIndex(c=>!c));
    expect(new Set(depths).size).toBeGreaterThan(2);
    expect(depths[0]).toBe(EDGE_DEPTH);expect(depths[GRID-1]).toBe(EDGE_DEPTH);
    for(let x=1;x<GRID;x++)expect(Math.abs(depths[x]-depths[x-1])).toBeLessThanOrEqual(1);
  });

  test('every cardinal bit covers its whole shared edge; a free tile side is covered only near its corners',()=>{
    for(const mask of OVERLAY_MASKS)for(let v=0;v<3;v++){
      const c=overlayCoverage(mask,v);
      for(let i=0;i<GRID;i++){
        if(mask&1)expect(c[i],`${mask} N`).toBe(true);
        if(mask&4)expect(c[i*GRID+GRID-1]).toBe(true);
        if(mask&16)expect(c[(GRID-1)*GRID+i]).toBe(true);
        if(mask&64)expect(c[i*GRID]).toBe(true);
      }
      if(!(mask&1)&&!(mask&2)&&!(mask&128))for(let x=EDGE_DEPTH;x<GRID-EDGE_DEPTH;x++)expect(c[x]).toBe(false);
    }
  });

  test('adjacent overlay tiles of one material are seamless across every neighbourhood and variant pairing',()=>{
    const V=4,cov=new Map(),pix=new Map(),spec=WASTELAND_SPECS.dust;
    for(const m of OVERLAY_MASKS)for(let v=0;v<V;v++){
      const c=overlayCoverage(m,v,7);cov.set(`${m},${v}`,c);
      pix.set(`${m},${v}`,overlayPixels(c,materialTile('dust',spec,v,7),null));
    }
    for(const vertical of [false,true]){
      const points=[];for(let y=-1;y<=1;y++)for(let x=-1;x<=2;x++)if(!(y===0&&(x===0||x===1)))points.push([x,y]);
      for(let bits=0;bits<1<<points.length;bits++){
        const cells=new Set();
        points.forEach(([x,y],i)=>{if(bits&(1<<i))cells.add(vertical?`${y},${x}`:`${x},${y}`);});
        // A and B are both free of the overlay material here: the seam is shaped only by the corners at its ends
        const ma=maskAt(cells,0,0),mb=maskAt(cells,vertical?0:1,vertical?1:0);
        for(let av=0;av<V;av++)for(let bv=0;bv<V;bv++){
          const a=cov.get(`${ma},${av}`),b=cov.get(`${mb},${bv}`),pa=pix.get(`${ma},${av}`),pb=pix.get(`${mb},${bv}`);
          for(let i=0;i<GRID;i++){
            const ia=vertical?(GRID-1)*GRID+i:i*GRID+GRID-1,ib=vertical?i:i*GRID;
            if(a[ia]!==b[ib])throw Error(`seam coverage mismatch vertical=${vertical} bits=${bits} ${av}/${bv} at ${i}`);
            if(pa[ia]!==pb[ib])throw Error(`seam pixel mismatch vertical=${vertical} bits=${bits} ${av}/${bv} at ${i}`);
          }
        }
      }
    }
  });

  test('an outer corner from a diagonal-only neighbour bleeds into the next tiles along both edges',()=>{
    // neighbour M at (1,-1) of tile (0,0): tile A gets NE, tile B=(1,0) gets N, tile C=(0,-1) gets E
    const a=overlayCoverage(2,0),b=overlayCoverage(1,0),c=overlayCoverage(4,0);
    for(let y=0;y<EDGE_DEPTH;y++)expect(a[y*GRID+GRID-1]).toBe(b[y*GRID]);
    for(let x=GRID-EDGE_DEPTH;x<GRID;x++)expect(a[x]).toBe(c[(GRID-1)*GRID+x]);
    expect(a[GRID-1]).toBe(true);expect(a[0]).toBe(false);expect(a[8*GRID+8]).toBe(false);
  });

  test('a water overlay is a static snapshot and the base water frames carry the animation tag',()=>{
    const r=generateEnvironmentRecipe({kind:'terrain-overlay',materials:['water','dust'],variants:2,pixelScale:2});
    expect(r.report.animations).toEqual([expect.objectContaining({name:'water',frames:['water_0','water_1','water_2','water_3']})]);
    expect(r.report.frames.filter(f=>f.material==='water'&&f.role==='base')).toHaveLength(4);
  });

  test.each([{variants:0},{variants:9},{variants:1.5},{materials:[]},{materials:['moss']},{materials:['dust','dust']},{base:'yes'},{seed:1.5},{typo:1}])('rejects invalid overlay config %j',config=>expect(()=>generateEnvironmentRecipe({kind:'terrain-overlay',...config})).toThrow());
  test.each([{kind:'terrain',base:true},{kind:'habitat',materials:['dust']}])('rejects misplaced fields %j',config=>expect(()=>generateEnvironmentRecipe(config)).toThrow());
});
