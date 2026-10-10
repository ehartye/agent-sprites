import {test,expect,describe} from 'vitest';
import {generateEnvironmentRecipe as gen} from '../../server/authoring/environment.js';
import {GRID} from '../../server/authoring/environment-materials.js';
import {OVERLAY_MASKS} from '../../server/authoring/environment-overlay.js';
import {levelDepths,usedCorners,worldCoverage,worldLevel,worldVariants,DEFAULT_WORLD} from '../../server/authoring/environment-world-edge.js';

const base={kind:'terrain-overlay',materials:['dust','sand','water'],variants:2,seed:3};
const depthN=(cov,x)=>{let d=0;while(d<GRID&&cov[d*GRID+x])d++;return d;};
const depthS=(cov,x)=>{let d=0;while(d<GRID&&cov[(GRID-1-d)*GRID+x])d++;return d;};

describe('world-space overlay edges',()=>{
  test('without world, overlays or animate the report and cells are the classic ones',()=>{
    const r=gen(base).report;
    expect(r.world).toBeUndefined();
    expect(r.frames.length).toBe(2+2+4+3*46*2);
    expect(r.frames.some(f=>f.corners)).toBe(false);
  });

  test('bands of horizontally adjacent tiles meet at the shared vertex: same depth within a pixel, for every level',()=>{
    const depths=levelDepths({reach:5,spread:2,levels:3});
    for(const mask of [1,16]){
      for(let a=0;a<3;a++)for(let b=0;b<3;b++)for(let c=0;c<3;c++){
        const corners=(l,r)=>mask===1?[l,r,0,0]:[0,0,r,l];
        const A=worldCoverage(mask,corners(a,b).map(i=>depths[i]),0,1,{...DEFAULT_WORLD}),B=worldCoverage(mask,corners(b,c).map(i=>depths[i]),1,1,{...DEFAULT_WORLD});
        const f=mask===1?depthN:depthS;
        expect(Math.abs(f(A,GRID-1)-f(B,0)),`mask ${mask} ${a}${b}${c}`).toBeLessThanOrEqual(1);
      }
    }
  });

  test('the crossing depth follows the level: deeper levels cover more of the tile border',()=>{
    const depths=levelDepths({reach:5,spread:2,levels:3});
    const at=l=>depthN(worldCoverage(1,[depths[l],depths[l],0,0],0,1,{...DEFAULT_WORLD,amplitude:0}),0);
    expect(at(0)).toBeLessThan(at(1));expect(at(1)).toBeLessThan(at(2));
  });

  test('the world function varies along a coast and is deterministic',()=>{
    const seen=new Set();
    for(let tx=0;tx<40;tx++)seen.add(worldLevel(tx,3,{levels:3,wavelength:46,seed:5}));
    expect(seen.size).toBe(3);
    expect(worldLevel(7,3,{levels:3,seed:5})).toBe(worldLevel(7,3,{levels:3,seed:5}));
  });

  test('cells: one per level combination of the corners a mask touches and flavour; heavy masks collapse',()=>{
    expect(usedCorners(1)).toEqual([0,1]);
    expect(worldVariants(1,{levels:3,flavours:2}).length).toBe(18);
    const four=OVERLAY_MASKS.find(m=>usedCorners(m).length===4);
    expect(worldVariants(four,{levels:3,flavours:2,exact:3}).length).toBe(2);
    expect(worldVariants(four,{levels:3,flavours:2,exact:4}).length).toBe(162);
  });

  test('a world project is deterministic, reports the lookup and every lookup alias is a frame',()=>{
    const cfg={...base,materials:['sand','water'],overlayEdge:{rim:true,world:{levels:2,flavours:1}}};
    const a=gen(cfg),b=gen(cfg),aliases=new Set(a.report.frames.map(f=>f.alias));
    expect(JSON.stringify(a.operations)).toBe(JSON.stringify(b.operations));
    expect(a.report.world.levels).toBe(2);expect(a.report.world.depths.length).toBe(2);
    let n=0;
    for(const masks of Object.values(a.report.world.lookup))for(const keys of Object.values(masks))for(const list of Object.values(keys))for(const al of list){expect(aliases.has(al)).toBe(true);n++;}
    expect(n).toBe(a.report.frames.filter(f=>f.corners).length);
  });

  test('overlays.skip and overlays.masks leave out cells nothing draws',()=>{
    const full=gen(base).report.frames.length;
    const skipped=gen({...base,overlays:{skip:['water']}}).report.frames;
    expect(skipped.length).toBe(full-46*2);
    expect(skipped.some(f=>f.material==='water'&&f.role==='overlay')).toBe(false);
    expect(skipped.some(f=>f.alias==='water_0')).toBe(true);
    expect(gen({...base,overlays:{masks:[1,4,5]}}).report.frames.filter(f=>f.role==='overlay').length).toBe(3*3*2);
    const per=gen({...base,overlays:{masks:{sand:[1],'*':[4]}}}).report.frames.filter(f=>f.role==='overlay');
    expect(per.filter(f=>f.material==='sand').every(f=>f.mask===1)).toBe(true);
    expect(per.filter(f=>f.material==='dust').every(f=>f.mask===4)).toBe(true);
    expect(()=>gen({...base,overlays:{masks:[3]}})).toThrow(/valid overlay masks/);
    expect(()=>gen({...base,overlays:{skip:['lava']}})).toThrow(/skip/);
  });

  test('pairs add their own set with their own reach',()=>{
    const cfg={...base,materials:['sand','water'],overlayEdge:{rim:true,world:{levels:2,flavours:1,pairs:[{over:'sand',on:'water',reach:3,soft:true}]}}};
    const r=gen(cfg).report;
    expect(r.frames.some(f=>f.alias.startsWith('sand-on-water_'))).toBe(true);
    expect(r.frames.some(f=>f.alias.startsWith('sand-on-water-soft_'))).toBe(true);
    expect(r.world.pairs[0].stem).toBe('sand-on-water');
    expect(r.world.pairs[0].depths[0]).toBeLessThan(r.world.depths[0]);
    expect(()=>gen({...cfg,overlayEdge:{rim:true,world:{pairs:[{over:'sand',on:'sand'}]}}})).toThrow(/differ/);
    expect(()=>gen({...cfg,overlayEdge:{rim:true,world:{pairs:[{over:'sand',on:'ice'}]}}})).toThrow(/pair on/);
  });

  test('animate gives an animated material an overlay in every phase, tagged',()=>{
    const r=gen({...base,materials:['sand','water'],overlays:{masks:[1]},overlayEdge:{rim:true,animate:['water']}});
    const aliases=r.report.frames.filter(f=>f.material==='water'&&f.role==='overlay').map(f=>f.alias);
    expect(aliases).toEqual(expect.arrayContaining(['water_1_0','water_1_0-f1','water_1_0-f2','water_1_0-f3']));
    const tag=r.report.animations.find(a=>a.name==='water_1_0-anim');
    expect(tag.frames).toEqual(['water_1_0','water_1_0-f1','water_1_0-f2','water_1_0-f3']);
    expect(r.report.animations.find(a=>a.name==='water').frames.some(a=>a.includes('-f'))).toBe(false);
    expect(()=>gen({...base,overlayEdge:{animate:['sand']}})).toThrow(/animated/);
  });

  test('validation rejects unknown fields and out-of-range values',()=>{
    const w=world=>()=>gen({...base,overlayEdge:{world}});
    expect(w({bogus:1})).toThrow(/Unknown overlayEdge world field/);
    expect(w({levels:9})).toThrow(/levels/);
    expect(w({reach:50})).toThrow(/reach/);
    expect(w({reach:{lava:3}})).toThrow(/not in materials/);
    expect(w({pairs:[]})).toThrow(/pairs/);
    expect(()=>gen({kind:'terrain',overlays:{}})).toThrow(/overlays/);
  });
});
