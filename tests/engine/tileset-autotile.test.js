import {test,expect} from 'vitest';
import {autotileTiles,BLOB_MASKS,FENCE_MASKS,MATERIALS,AUTOTILE_KINDS,normalizeBlobMask} from '../../server/authoring/tileset-autotile.js';

const N=1,NE=2,E=4,SE=8,S=16,SW=32,W=64,NW=128;
const tiles=(kind,material)=>autotileTiles({kind,material,prefix:`${kind}_${material}`});
const byMask=set=>Object.fromEntries(set.map(t=>[t.mask,t.pixels]));
const col=(p,x)=>p.map(r=>r[x]),row=(p,y)=>p[y];
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);

test('blob masks are the 47 connection masks and fences the 16 edge-only ones',()=>{
  expect(BLOB_MASKS.length).toBe(47);expect(FENCE_MASKS.length).toBe(16);
  expect(normalizeBlobMask(N|NE)).toBe(N);expect(normalizeBlobMask(N|E|NE)).toBe(N|E|NE);expect(normalizeBlobMask(255)).toBe(255);
  for(const m of FENCE_MASKS)expect(m&(NE|SE|SW|NW)).toBe(0);
});

test.each([['wall',['scrap','wood','brick','concrete','glass']],['floor',['planks','slab','tile','scrap-plate']],['roof',['sheet','thatch','roof-tile']]])('%s materials produce 47 distinct, fully inside tiles',(kind,materials)=>{
  for(const material of materials){
    const set=tiles(kind,material);expect(set.map(t=>t.mask)).toEqual(BLOB_MASKS);
    expect(new Set(set.map(t=>t.name)).size).toBe(47);
    for(const t of set){expect(t.pixels.length).toBe(16);for(const r of t.pixels){expect(r.length).toBe(16);for(const c of r)expect(c).toMatch(/^#[0-9a-f]{6}$/);}}
    expect(new Set(set.map(t=>t.pixels.flat().join())).size).toBeGreaterThan(30);
  }
});

test('a joined side carries no outline or edge colour, so runs read as one piece',()=>{
  for(const [kind,material] of [['wall','brick'],['floor','slab'],['roof','roof-tile']]){
    const m=byMask(tiles(kind,material)),o=MATERIALS[material].o;
    const eastJoined=m[N|E|S|W|NE|SE|SW|NW];
    for(let y=2;y<13;y++)expect(eastJoined[y][15],`${kind} row ${y}`).not.toBe(o);
    // the same pattern pixel appears at the seam whichever other sides are open
    expect(m[E|W][5][15]).toBe(m[E|W|N][5][15]);
  }
});

test('open sides are outlined or edged and joined sides are not',()=>{
  const wall=byMask(tiles('wall','concrete')),o=MATERIALS.concrete.o;
  expect(row(wall[0],0).every(c=>c===o)).toBe(true);expect(col(wall[0],0).every(c=>c===o)).toBe(true);expect(col(wall[0],15).every(c=>c===o)).toBe(true);
  const joined=wall[N|E|S|W|NE|SE|SW|NW];expect(joined.flat().includes(o)).toBe(false);
  // an inner corner keeps a single outline pixel where the diagonal neighbour is missing
  const inner=wall[N|E|S|W|SE|SW|NW];expect(inner[0][15]).toBe(o);expect(inner[0][14]).not.toBe(o);
  // the south face is darker than the lit top surface
  const lum=h=>parseInt(h.slice(1,3),16)+parseInt(h.slice(3,5),16)+parseInt(h.slice(5,7),16);
  expect(lum(wall[E|W][13][8])).toBeLessThan(lum(wall[E|W][3][8])+1);
});

test('floors have no outline, only a soft dark edge',()=>{
  const floor=byMask(tiles('floor','planks'));expect(floor[0].flat().filter(c=>c===MATERIALS.planks.o).length).toBeLessThan(70);
});

test('fences connect on the sides given by the mask and doors come in closed and open',()=>{
  const fence=byMask(tiles('fence','wood'));
  const filled=(p,x,y)=>p[y][x]!==null;
  expect(filled(fence[E],15,7)).toBe(true);expect(filled(fence[E],0,7)).toBe(false);
  expect(filled(fence[W],0,7)).toBe(true);expect(filled(fence[N],7,0)).toBe(true);expect(filled(fence[S],7,15)).toBe(true);expect(filled(fence[0],0,0)).toBe(false);
  expect(fence[0].flat().some(c=>c!==null)).toBe(true);
  const door=autotileTiles({kind:'door',material:'scrap',prefix:'d',leaf:'wood'});expect(door.map(t=>t.name)).toEqual(['d','d_open']);
  expect(door[0].pixels.flat().join()).not.toEqual(door[1].pixels.flat().join());
  expect(door[0].pixels.flat()).toContain(MATERIALS.wood.a);
});

test('role overrides recolour a material and bad input is a clear error',()=>{
  const custom=autotileTiles({kind:'wall',material:'brick',prefix:'w',overrides:{a:'#123456'}});expect(custom[0].pixels.flat()).toContain('#123456');
  expect(()=>autotileTiles({kind:'wall',material:'brick',prefix:'w',overrides:{z:'#123456'}})).toThrow(/Unknown material role/);
  expect(()=>autotileTiles({kind:'wall',material:'brick',prefix:'w',overrides:{a:'red'}})).toThrow(/#rrggbb/);
  expect(()=>autotileTiles({kind:'moat',material:'brick',prefix:'w'})).toThrow(/Unknown auto-tile kind/);
  expect(AUTOTILE_KINDS).toEqual(['wall','floor','roof','fence','door','gate']);
});

const NEW_MATERIALS=['adobe','rammed','timber','shingle','cinder','flags','plate','tread','lapped','ceramic','panel','glasshouse'];
const FENCE_STYLES=['wattle','paling','lowblock','mesh','slimrail'];

test.each(['wall','floor','roof'])('new %s presets are 47 full hard-alpha tiles',kind=>{
  for(const material of NEW_MATERIALS){
    const set=tiles(kind,material);expect(set.map(t=>t.mask)).toEqual(BLOB_MASKS);
    for(const t of set)for(const r of t.pixels)for(const c of r)expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(byMask(set)[255].flat().filter(Boolean).length).toBe(256);
  }
});

test('new patterns differ from each other and from the originals',()=>{
  const sig=material=>byMask(tiles('wall',material))[255].flat().join();
  const names=[...NEW_MATERIALS,'scrap','wood','brick','concrete'];
  expect(new Set(names.map(sig)).size).toBe(names.length);
});

test('fence styles keep the 16 edge masks, connect on the mask sides and draw a post',()=>{
  for(const material of FENCE_STYLES){
    const fence=byMask(tiles('fence',material)),filled=(p,x,y)=>p[y][x]!==null;
    expect(Object.keys(fence).length).toBe(16);
    expect(filled(fence[E],15,8)||filled(fence[E],15,6)).toBe(true);expect(filled(fence[E],0,7)).toBe(false);
    expect(filled(fence[W],0,8)||filled(fence[W],0,6)).toBe(true);expect(filled(fence[N],7,0)).toBe(true);expect(filled(fence[S],7,15)).toBe(true);
    expect(fence[0].flat().some(c=>c!==null)).toBe(true);
    expect(new Set(Object.values(fence).map(p=>p.flat().join())).size).toBe(16);
  }
});

test('door leaf presets colour the leaf while the frame follows the wall material',()=>{
  const door=autotileTiles({kind:'door',material:'plate',prefix:'d',leaf:'leaf-steel'});
  expect(door[0].pixels.flat()).toContain(MATERIALS['leaf-steel'].a);expect(door[0].pixels.flat()).toContain(MATERIALS.plate.a);
});

test('the original presets keep their order and colours',()=>{
  expect(Object.keys(MATERIALS).slice(0,12)).toEqual(['scrap','wood','brick','concrete','glass','planks','slab','tile','scrap-plate','thatch','sheet','roof-tile']);
  expect(MATERIALS.scrap.a).toBe('#85847c');
});

test('gates come in shut and open, with a post each side, in every fence style and the default',()=>{
  for(const material of ['scrap',...FENCE_STYLES]){
    const set=autotileTiles({kind:'gate',material,prefix:'g'});expect(set.map(t=>t.name)).toEqual(['g','g_open']);
    const [shut,open]=set.map(t=>t.pixels),filled=(p,x,y)=>p[y][x]!==null;
    for(const p of [shut,open]){
      for(const row of p)for(const c of row)if(c!==null)expect(c).toMatch(/^#[0-9a-f]{6}$/);
      // a post at the hinge edge and at the latch edge, so the gate joins a fence line on both sides
      expect(filled(p,1,8),`${material} hinge post`).toBe(true);expect(filled(p,14,8),`${material} latch post`).toBe(true);
      // the corners above the posts stay clear
      expect(filled(p,0,0)).toBe(false);expect(filled(p,15,0)).toBe(false);
    }
    // shut: the leaf crosses the middle of the tile; open: the way between the posts is clear
    expect(filled(shut,7,5)||filled(shut,7,6)||filled(shut,7,7),`${material} leaf`).toBe(true);
    for(let x=7;x<=11;x++)for(let y=0;y<16;y++)expect(filled(open,x,y),`${material} open way ${x},${y}`).toBe(false);
    expect(shut.flat().join()).not.toEqual(open.flat().join());
  }
  // a gate is its fence style: the styles differ from each other
  const sig=m=>autotileTiles({kind:'gate',material:m,prefix:'g'})[0].pixels.flat().join();
  expect(new Set(['scrap',...FENCE_STYLES].map(sig)).size).toBe(6);
});

const mk=(extra={})=>byMask(autotileTiles({kind:'wall',material:'brick',prefix:'r',...extra}));
const cells=p=>p.flat().filter(c=>c!==null).length;

test('ragged crumbles open top and side edges with hard alpha and leaves the base flush',()=>{
  const plain=mk(),rag=mk({ragged:3,seed:2});
  expect(cells(rag[0])).toBeLessThan(cells(plain[0]));
  for(const px of Object.values(rag))for(const c of px.flat())expect(c===null||/^#[0-9a-f]{6}$/.test(c)).toBe(true); // no partial alpha
  for(let x=0;x<16;x++){expect(rag[0][15][x]).toBe(plain[0][15][x]);expect(rag[0][14][x]).not.toBeNull();} // the base stays on the ground
  // depth never exceeds ragged=N
  for(let x=3;x<13;x++){let d=0;while(d<16&&rag[0][d][x]===null)d++;expect(d).toBeLessThanOrEqual(3);}
  // the new boundary is outlined
  const o=MATERIALS.brick.o;for(let x=3;x<13;x++){const y=rag[0].findIndex(r=>r[x]!==null);expect(rag[0][y][x]).toBe(o);}
});

test('ragged leaves joined sides alone, and a run of tiles crumbles continuously across the seam',()=>{
  const plain=mk(),rag=mk({ragged:4,seed:1});
  const joined=N|E|S|W|NE|SE|SW|NW;expect(rag[joined]).toEqual(plain[joined]);
  // an open north edge has the same profile whichever sides are joined: E|W and E|W|S tiles share their top silhouette
  const top=p=>Array.from({length:16},(_,x)=>p.findIndex(r=>r[x]!==null));
  expect(top(rag[E|W])).toEqual(top(rag[E|W|S]));
  // vertical runs: the west profile is the same for a tile with the north joined
  const left=p=>Array.from({length:12},(_,y)=>p[y].findIndex(c=>c!==null));
  expect(left(rag[N|S|E])).toEqual(left(rag[N|S|E|SE]));
});

test('ragged is deterministic, depends on the seed and keeps the 47 masks',()=>{
  const a=autotileTiles({kind:'wall',material:'concrete',prefix:'r',ragged:3,seed:5}),b=autotileTiles({kind:'wall',material:'concrete',prefix:'r',ragged:3,seed:5});
  expect(a).toEqual(b);expect(a.map(t=>t.mask)).toEqual(BLOB_MASKS);
  const c=autotileTiles({kind:'wall',material:'concrete',prefix:'r',ragged:3,seed:6});expect(c).not.toEqual(a);
  const r=autotileTiles({kind:'roof',material:'thatch',prefix:'r',ragged:2});expect(r.length).toBe(47);
});

test('without ragged or offset the tiles are unchanged, and offset shifts only the pattern',()=>{
  const plain=mk(),zero=mk({ragged:0,seed:0,offset:[0,0]});expect(zero).toEqual(plain);
  const shifted=mk({offset:[8,4]});
  const outline=p=>p.map(r=>r.map(c=>(c===null?0:1)));
  expect(outline(shifted[0])).toEqual(outline(plain[0])); // same silhouette
  expect(shifted[0]).not.toEqual(plain[0]);expect(shifted[N|E|S|W|NE|SE|SW|NW]).not.toEqual(plain[N|E|S|W|NE|SE|SW|NW]);
  // two variants of one material differ in pattern but remain periodic on their own seams
  expect(shifted[E|W][5][15]).toBe(shifted[E|W|N][5][15]);
  const flags=autotileTiles({kind:'wall',material:'flags',prefix:'f',offset:[15,15]});expect(flags.length).toBe(47); // wraps, never indexes past the pattern
});
