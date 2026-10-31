// Animated terrain materials with `variants`: `<material>_f<k>_<v>` tiles (k the frame, v the look), unambiguous against overlay aliases.
import {test,expect,describe} from 'vitest';
import {createHash} from 'node:crypto';
import {generateEnvironmentRecipe} from '../../server/authoring/environment.js';
import {GRID,ANIMATION_FRAMES,materialTile,validateCustomMaterial} from '../../server/authoring/environment-materials.js';
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
const digest=f=>createHash('sha256').update(Buffer.from(f.data)).digest('hex');

const pond={name:'pond',ramp:['#2a4a5a','#1a3040','#3f7a8a','#9be8d0'],patterns:[{kind:'ripples',density:.9},{kind:'speckle',density:.2,tone:'dark'}],animated:true,fps:6};
const withLooks=n=>({...pond,variants:n});
// matches an overlay alias `<material>_<mask>_<variant>`, with the optional phase suffix of `overlayEdge.animate`
const OVERLAY_ALIAS=/^[a-z][a-z0-9-]*_\d+_\d+(-f\d)?$/;
const terrain=(extra={})=>generateEnvironmentRecipe({kind:'terrain',materials:['pond'],customMaterials:[withLooks(3)],...extra});
const overlay=(extra={})=>generateEnvironmentRecipe({kind:'terrain-overlay',materials:['pond','dust'],customMaterials:[withLooks(3)],variants:3,...extra});
const byAlias=(recipe,alias)=>recipe.report.frames.find(f=>f.alias===alias);

describe('animated variants: validation',()=>{
  test.each([[1],[3],[4]])('variants %i is accepted on an animated material',n=>expect(validateCustomMaterial(withLooks(n),[]).variants).toBe(n));
  test('omitted variants leaves the validated material without the field',()=>expect('variants' in validateCustomMaterial(pond,[])).toBe(false));
  test.each([[0],[5],[2.5],['3'],[null]])('variants %j is rejected naming variants',n=>expect(()=>validateCustomMaterial({...pond,variants:n},[])).toThrow(/variants/));
  test('variants on a still material is rejected',()=>expect(()=>validateCustomMaterial({...pond,animated:false,fps:undefined,variants:2},[])).toThrow(/variants.*animated/));
});

describe('animated variants: names',()=>{
  const recipe=terrain();
  test('every frame and look is named <material>_f<k>_<v>, looks in rows of four frames, none an overlay alias',()=>{
    const aliases=recipe.report.frames.map(f=>f.alias);
    expect(aliases).toEqual([0,1,2].flatMap(v=>[0,1,2,3].map(k=>`pond_f${k}_${v}`)));
    for(const a of aliases)expect(a).not.toMatch(OVERLAY_ALIAS);
    for(const f of recipe.report.frames)expect(f).toMatchObject({material:'pond',variant:Number(f.alias.at(-1)),frame:Number(f.alias[f.alias.indexOf('_f')+2])});
  });
  test('one four frame tag per look, in step order',()=>{
    expect(recipe.report.animations.map(a=>[a.name,a.variant,a.frames])).toEqual([0,1,2].map(v=>[`pond_v${v}`,v,[0,1,2,3].map(k=>`pond_f${k}_${v}`)]));
    expect(recipe.operations.filter(o=>o.command==='group').map(o=>o.name)).toEqual(['pond_v0','pond_v1','pond_v2']);
    for(const a of recipe.report.animations)expect(a.fps).toBe(6);
  });
  test('a sheet with base tiles and every overlay alias has no duplicate name and no base name reads as an overlay',()=>{
    const r=overlay({overlayEdge:{rim:true,animate:true}}),aliases=r.report.frames.map(f=>f.alias);
    expect(new Set(aliases).size).toBe(aliases.length);
    const base=r.report.frames.filter(f=>f.role==='base'&&f.material==='pond').map(f=>f.alias);
    expect(base).toHaveLength(12);
    for(const a of base)expect(a).not.toMatch(OVERLAY_ALIAS);
    for(const f of r.report.frames.filter(f=>f.role==='overlay'))expect(f.alias).toMatch(OVERLAY_ALIAS);
    expect(r.report.aliasPattern).toContain('<material>_f<frame>_<variant>');
  });
  test('the total is four frames times the variant count per animated material',()=>{
    for(const n of [1,2,3,4]){
      const r=terrain({customMaterials:[withLooks(n)]});
      expect(r.report.frames.length).toBe(ANIMATION_FRAMES*n);
    }
    const mixed=generateEnvironmentRecipe({kind:'terrain',materials:['dust','water','pond'],customMaterials:[withLooks(3)],variants:2});
    expect(mixed.report.frames.filter(f=>f.material==='pond')).toHaveLength(12);
    expect(mixed.report.frames.filter(f=>f.material==='water').map(f=>f.alias)).toEqual(['water_0','water_1','water_2','water_3']);
    expect(mixed.report.frames.filter(f=>f.material==='dust').map(f=>f.alias)).toEqual(['dust_0','dust_1']);
  });
});

describe('animated variants: the tiles',()=>{
  const recipe=terrain(),all=recipe.report.frames.map(f=>({f,px:grid(render(recipe,f)),hash:digest(render(recipe,f))}));
  test('all twelve tiles differ, and a look is another arrangement and phase of the loop, not a copy',()=>{
    expect(new Set(all.map(t=>t.hash)).size).toBe(12);
    for(let v=1;v<3;v++){
      const a=materialTile('pond',validateCustomMaterial(withLooks(3),[]),0,7,0),b=materialTile('pond',validateCustomMaterial(withLooks(3),[]),v,7,0);
      const marks=t=>new Set(t.flatMap((c,i)=>c!==t[0]?[i]:[]));
      const ma=marks(a),mb=marks(b),shared=[...ma].filter(i=>mb.has(i)).length;
      expect(shared,`look ${v} shares marks with look 0`).toBeLessThanOrEqual(Math.max(ma.size,mb.size)*.75);
    }
  });
  test('the loop still cycles: the four frames of a look are four different tiles on one set of edge pixels',()=>{
    for(let v=0;v<3;v++){
      const tiles=[0,1,2,3].map(k=>all.find(t=>t.f.alias===`pond_f${k}_${v}`));
      expect(new Set(tiles.map(t=>t.hash)).size).toBe(4);
      for(let k=1;k<4;k++)for(let i=0;i<32;i++){
        // the outer ring is canonical: it does not move with the frame
        for(const idx of [i,31*32+i,i*32,i*32+31])expect(tiles[k].px[idx]).toBe(tiles[0].px[idx]);
      }
    }
  });
  test('tiles join their neighbours at the border: opposite edges match, and every look shares the same ring',()=>{
    for(const {px} of all)for(let i=0;i<32;i++){expect(px[i*32]).toBe(px[i*32+31]);expect(px[i]).toBe(px[31*32+i]);}
    for(const {px} of all)for(let i=0;i<32;i++)for(const idx of [i,31*32+i,i*32,i*32+31])expect(px[idx]).toBe(all[0].px[idx]);
  });
  test('with grain soft, the frames of one look still share a ring, and opposite edges still match',()=>{
    const r=terrain({customMaterials:[{...withLooks(3),grain:'soft'}]}),tiles=r.report.frames.map(f=>({f,px:grid(render(r,f))}));
    for(const {px} of tiles)for(let i=0;i<32;i++){expect(px[i*32]).toBe(px[i*32+31]);expect(px[i]).toBe(px[31*32+i]);}
    for(const {f,px} of tiles){
      const first=tiles.find(t=>t.f.variant===f.variant&&t.f.frame===0);
      for(let i=0;i<32;i++)for(const idx of [i,31*32+i,i*32,i*32+31])expect(px[idx]).toBe(first.px[idx]);
    }
  });
  test('a 20 by 20 lake: every row of 20 tiles shows at least three distinct tiles, in every frame, and no row repeats another',()=>{
    // a game picks a look per tile from the tile position; any integer hash will do
    const lookAt=(x,y)=>{let h=Math.imul(x+1,0x9e3779b1)^Math.imul(y+1,0x85ebca6b);h=Math.imul(h^h>>>15,0x2c1b3c6d);return ((h^h>>>12)>>>0)%3;};
    for(let k=0;k<4;k++){
      const rows=[];
      for(let y=0;y<20;y++){
        const row=Array.from({length:20},(_,x)=>all.find(t=>t.f.alias===`pond_f${k}_${lookAt(x,y)}`).hash);
        expect(new Set(row).size,`row ${y} frame ${k}`).toBeGreaterThanOrEqual(3);
        rows.push(row.join());
      }
      expect(new Set(rows).size,`distinct rows in frame ${k}`).toBe(20);
    }
  });
  test('variants 1 is the legacy loop under the new names: look 0 equals the legacy frame bytes',()=>{
    const legacy=validateCustomMaterial(pond,[]),one=validateCustomMaterial(withLooks(1),[]);
    for(const seed of [7,13])for(let k=0;k<4;k++)expect(materialTile('pond',one,0,seed,k)).toEqual(materialTile('pond',legacy,0,seed,k));
  });
  test('omitting variants keeps the legacy names, tag and tile bytes',()=>{
    const r=generateEnvironmentRecipe({kind:'terrain',materials:['pond'],customMaterials:[pond]});
    expect(r.report.frames.map(f=>f.alias)).toEqual(['pond_0','pond_1','pond_2','pond_3']);
    expect(r.report.animations).toEqual([{name:'pond',fps:6,frames:['pond_0','pond_1','pond_2','pond_3'],cells:['0,0','0,1','0,2','0,3']}]);
    const legacy=validateCustomMaterial(pond,[]);
    r.report.frames.forEach((f,k)=>{
      const px=grid(render(r,f)),tile=materialTile('pond',legacy,0,7,k);
      for(let y=0;y<32;y++)for(let x=0;x<32;x++)expect(px[y*32+x]).toBe(tile[(y>>1)*GRID+(x>>1)]);
    });
  });
});

describe('animated variants: base and overlay agree',()=>{
  // no rim, so every opaque overlay pixel is a pixel of the material tile it was cut from
  const r=overlay({overlayEdge:{animate:true}});
  const agrees=(over,base)=>{
    const o=grid(render(r,over)),b=grid(render(r,base));
    let opaque=0;
    for(let i=0;i<o.length;i++)if(o[i]!==null){opaque++;if(o[i]!==b[i])return {opaque,ok:false};}
    return {opaque,ok:true};
  };
  test('an overlay cell of look v in phase k is cut from the base tile pond_f<k>_<v>',()=>{
    const cells=r.report.frames.filter(f=>f.role==='overlay'&&f.material==='pond'&&f.mask===85);
    expect(cells.length).toBe(3*4);
    for(const cell of cells){
      const phase=cell.phase??0,base=byAlias(r,`pond_f${phase}_${cell.variant%3}`);
      const res=agrees(cell,base);
      expect(res.opaque,cell.alias).toBeGreaterThan(40);
      expect(res.ok,`${cell.alias} vs ${base.alias}`).toBe(true);
    }
  });
  test('overlay variants beyond the look count wrap onto the looks',()=>{
    const w=overlay({variants:5,overlayEdge:{animate:true}});
    for(const cell of w.report.frames.filter(f=>f.role==='overlay'&&f.material==='pond'&&f.mask===85)){
      const base=w.report.frames.find(f=>f.alias===`pond_f${cell.phase??0}_${cell.variant%3}`);
      const o=grid(render(w,cell)),b=grid(render(w,base));
      for(let i=0;i<o.length;i++)if(o[i]!==null)expect(o[i],cell.alias).toBe(b[i]);
    }
  });
  test('a plain overlay without animate is cut from frame 0 of its look',()=>{
    const p=overlay();
    for(const cell of p.report.frames.filter(f=>f.role==='overlay'&&f.material==='pond'&&f.mask===85)){
      const base=byAlias(p,`pond_f0_${cell.variant%3}`),o=grid(render(p,cell)),b=grid(render(p,base));
      for(let i=0;i<o.length;i++)if(o[i]!==null)expect(o[i]).toBe(b[i]);
    }
  });
  test('the foam band still cycles: the animated overlay tag steps through four different cells in the base order',()=>{
    const tags=r.report.animations.filter(a=>a.overlay);
    expect(tags.length).toBeGreaterThan(0);
    for(const tag of tags){
      expect(tag.frames).toHaveLength(4);
      const cells=tag.frames.map(a=>byAlias(r,a));
      expect(cells.map(c=>c.phase)).toEqual([0,1,2,3]);
      // a thin edge band can miss every ripple; a band with enough cover shows all four
      if(cells[0].mask===85)expect(new Set(cells.map(c=>digest(render(r,c)))).size,tag.name).toBe(4);
    }
    expect(tags.some(t=>t.frames.some(a=>byAlias(r,a).mask===85))).toBe(true);
    // base tags and overlay tags are separate sets that do not collide
    const names=r.report.animations.map(a=>a.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining(['pond_v0','pond_v1','pond_v2']));
  });
  test('the rim and soft twins of an animated look material still build',()=>{
    const rr=overlay({overlayEdge:{rim:true,soft:true,round:2,animate:true,shade:{width:2}}}),aliases=rr.report.frames.map(f=>f.alias);
    expect(new Set(aliases).size).toBe(aliases.length);
    expect(aliases).toContain('pond_85_0-f3');
    expect(aliases).toContain('pond-soft_85_2-f1');
  });
});

describe('animated variants: worldReport',()=>{
  const world=generateEnvironmentRecipe({kind:'terrain-overlay',materials:['sand','pond'],customMaterials:[withLooks(3)],variants:3,overlayEdge:{rim:true,animate:true,world:{levels:2,flavours:2}}});
  test('parses the names: stems are bare materials, frames of the new base scheme are not mistaken for cells',()=>{
    const lookup=world.report.world.lookup;
    expect(Object.keys(lookup).sort()).toEqual(['pond','sand']);
    const listed=Object.values(lookup).flatMap(masks=>Object.values(masks).flatMap(keys=>Object.values(keys).flat()));
    expect(listed.length).toBeGreaterThan(0);
    for(const a of listed){expect(a).toMatch(OVERLAY_ALIAS);expect(a).not.toMatch(/_f\d+_\d+$/);expect(a).not.toMatch(/-f\d$/);}
    for(const a of listed)expect(world.report.frames.some(f=>f.alias===a&&f.corners)).toBe(true);
  });
  test('the base tiles of the look material sit beside the world cells without a corner record',()=>{
    const base=world.report.frames.filter(f=>f.role==='base'&&f.material==='pond');
    expect(base.map(f=>f.alias)).toEqual([0,1,2].flatMap(v=>[0,1,2,3].map(k=>`pond_f${k}_${v}`)));
    for(const f of base)expect(f.corners).toBeUndefined();
  });
  test('a world overlay cell wears the look of its flavour, in the frame of its phase',()=>{
    const cells=world.report.frames.filter(f=>f.role==='overlay'&&f.material==='pond'&&f.corners&&!f.alias.includes('-soft'));
    expect(cells.length).toBeGreaterThan(0);
    for(const cell of cells.slice(0,24)){
      const base=byAlias(world,`pond_f${cell.phase??0}_${cell.flavour%3}`),o=grid(render(world,cell)),b=grid(render(world,base));
      // the rim recolours only the outline, so nearly every opaque pixel is the base pixel
      let opaque=0,same=0;
      for(let i=0;i<o.length;i++)if(o[i]!==null){opaque++;if(o[i]===b[i])same++;}
      if(opaque>60)expect(same/opaque,cell.alias).toBeGreaterThan(.6);
    }
  });
});
