import {test,expect,describe} from 'vitest';
import {generateEnvironmentRecipe} from '../../server/authoring/environment.js';
import {GRID} from '../../server/authoring/environment-materials.js';
import {OVERLAY_MASKS,overlayCoverage,edgeShadePixels} from '../../server/authoring/environment-overlay.js';

const N=1,E=4,S=16,W=64;
const depthN=cov=>Array.from({length:GRID},(_,x)=>{let d=0;while(d<GRID&&cov[d*GRID+x])d++;return d;});

describe('edge shade pixels',()=>{
  test('the band hugs the ragged overlay edge: it starts exactly where the coverage ends, column by column',()=>{
    let ragged=false;
    for(let v=0;v<6;v++){
      const cov=overlayCoverage(N,v,7),px=edgeShadePixels(cov,{width:2,color:'#102030'}),d=depthN(cov);
      if(new Set(d).size>1)ragged=true;
      for(let x=0;x<GRID;x++)for(let y=0;y<GRID;y++){
        const shaded=px[y*GRID+x]!==null;
        expect(shaded,`v${v} x${x} y${y}`).toBe(y>=d[x]&&y<d[x]+2);
      }
    }
    expect(ragged).toBe(true); // the edge is not a straight tile-edge line
  });

  test('only the tile’s own pixels are shaded, with one colour and hard alpha',()=>{
    for(const mask of OVERLAY_MASKS){
      const cov=overlayCoverage(mask,1,7),px=edgeShadePixels(cov,{width:3,dir:'all',color:'#1b2040'});
      for(let i=0;i<px.length;i++){if(cov[i])expect(px[i]).toBeNull();else expect([null,'#1b2040']).toContain(px[i]);}
    }
  });

  test('light shades below and right of the overlay, all shades every side, mask 0 nothing',()=>{
    const cov=overlayCoverage(S,0,7),light=edgeShadePixels(cov,{dir:'light'}),all=edgeShadePixels(cov,{dir:'all'});
    expect(light.filter(Boolean).length).toBeLessThan(all.filter(Boolean).length/2); // a south overlay has (almost) nothing below it inside the tile
    expect(all.filter(Boolean).length).toBeGreaterThan(8);
    const west=edgeShadePixels(overlayCoverage(W,0,7),{dir:'light'});expect(west.filter(Boolean).length).toBeGreaterThan(8);
    expect(edgeShadePixels(overlayCoverage(0,0,7),{dir:'all'}).filter(Boolean).length).toBe(0);
  });

  test('wider bands only add pixels',()=>{
    const cov=overlayCoverage(N|E,2,7),a=edgeShadePixels(cov,{width:1,dir:'all'}),b=edgeShadePixels(cov,{width:3,dir:'all'});
    a.forEach((c,i)=>{if(c)expect(b[i]).not.toBeNull();});
    expect(b.filter(Boolean).length).toBeGreaterThan(a.filter(Boolean).length);
  });
});

describe('overlayEdge.shade in an environment recipe',()=>{
  const recipe=(shade,extra={})=>generateEnvironmentRecipe({kind:'terrain-overlay',materials:['dust','water'],variants:2,pixelScale:2,overlayEdge:{shade},...extra});
  test('absent: nothing changes',()=>{
    const a=generateEnvironmentRecipe({kind:'terrain-overlay',materials:['dust','water'],variants:2,pixelScale:2}),b=generateEnvironmentRecipe({kind:'terrain-overlay',materials:['dust','water'],variants:2,pixelScale:2,overlayEdge:{rim:true}});
    expect(a.report.edgeShade).toBeUndefined();expect(b.report.edgeShade).toBeUndefined();
    expect(b.report.frames.length).toBe(a.report.frames.length);
  });
  test('shade adds <material>-shade_<mask>_<variant> frames with the overlay masks and a report entry',()=>{
    const plain=recipe(undefined),r=recipe({width:2,materials:['water']}),names=r.report.frames.map(f=>f.alias);
    expect(r.report.frames.length).toBe(plain.report.frames.length+2*46);
    expect(names).toContain('water-shade_5_1');expect(names).not.toContain('dust-shade_5_0');
    const f=r.report.frames.find(x=>x.alias==='water-shade_5_1');
    expect(f).toMatchObject({material:'water',role:'edge-shade',mask:5,variant:1,neighbors:['n','e']});
    expect(r.report.edgeShade).toMatchObject({width:2,color:'#1b2040',dir:'light',materials:['water'],aliasPattern:'<material>-shade_<mask>_<variant>'});
    expect(r.report.frames.filter(x=>x.role==='overlay').length).toBe(plain.report.frames.filter(x=>x.role==='overlay').length);
    // frames carry one flat colour only
    const colors=new Set(r.operations.filter(o=>o.command==='draw'&&o.cell===f.cell).map(o=>o.color));expect([...colors]).toEqual(['#1b2040']);
  });
  test('true shades every material, and the same seed gives identical shapes',()=>{
    const a=recipe(true),b=recipe(true);expect(a.operations).toEqual(b.operations);
    expect(a.report.frames.map(f=>f.alias)).toContain('dust-shade_1_0');
  });
  test('bad settings are rejected with a reason',()=>{
    expect(()=>recipe({width:4})).toThrow(/width/);expect(()=>recipe({color:'red'})).toThrow(/color/);expect(()=>recipe({dir:'up'})).toThrow(/dir/);
    expect(()=>recipe({materials:['lava']})).toThrow(/not in materials/);expect(()=>recipe({colour:'#000000'})).toThrow(/Unknown overlayEdge shade field/);
    expect(()=>generateEnvironmentRecipe({kind:'terrain',overlayEdge:{shade:true}})).toThrow(/terrain-overlay/);
  });
});

test('the shipped wasteland example publishes shade bands for water and concrete only',async()=>{
  const {readFileSync}=await import('node:fs');
  const config=JSON.parse(readFileSync(new URL('../../examples/environment/wasteland/sprite-project.json',import.meta.url),'utf8')).environment;
  const names=generateEnvironmentRecipe(config).report.frames.map(f=>f.alias);
  expect(names).toContain('water-shade_1_0');expect(names).toContain('concrete-shade_255_2'.replace('255','85'));expect(names).not.toContain('dust-shade_1_0');
});
