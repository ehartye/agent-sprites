import {test,expect} from 'vitest';
import {lensRows,shadowPixels,shadeTiles,normalizeShadeMask,SHADE_MASKS,SHADE_BITS} from '../../server/authoring/tileset-shadow.js';

const {n:N,e:E,w:W,nw:NW}=SHADE_BITS;
const solid=p=>p.map(r=>r.map(c=>c?1:0));
const by=set=>Object.fromEntries(set.map(t=>[t.mask,solid(t.pixels)]));

test('a lens is symmetric, stepped, widest in the middle and never wider than asked',()=>{
  for(const [w,h] of [[10,5],[16,6],[26,7],[40,9],[3,3],[11,7],[9,1]]){
    const rows=lensRows(w,h);expect(rows.length).toBe(h);
    expect(Math.max(...rows)).toBe(w);
    for(const r of rows){expect(r).toBeGreaterThanOrEqual(1);expect(r).toBeLessThanOrEqual(w);expect((w-r)%2).toBe(0);}
    const mid=Math.floor(h/2);for(let k=0;k<mid;k++)expect(rows[k]).toBeLessThanOrEqual(rows[k+1]);
    expect(rows).toEqual([...rows].reverse().slice(0,0).concat(rows)); // deterministic
  }
});

test('shadow pixels are one flat colour with hard alpha',()=>{
  const px=shadowPixels({w:11,h:7,color:'#17242d'});
  expect(px.length).toBe(7);
  const colours=new Set(px.flat().filter(Boolean));expect([...colours]).toEqual(['#17242d']);
  expect(px[3].every(Boolean)).toBe(true);expect(px[0].filter(Boolean).length).toBeLessThan(11);
  expect(()=>shadowPixels({w:0,h:3})).toThrow();expect(()=>shadowPixels({w:3,h:3,color:'red'})).toThrow();
});

test('shade masks: nine normalised masks, NW dropped when N or W already shadow the tile',()=>{
  expect(SHADE_MASKS.length).toBe(9);
  for(const m of SHADE_MASKS)expect(normalizeShadeMask(m)).toBe(m);
  expect(normalizeShadeMask(N|NW)).toBe(N);expect(normalizeShadeMask(W|NW)).toBe(W);expect(normalizeShadeMask(NW|E)).toBe(NW|E);
  expect(normalizeShadeMask(2|8|16|32)).toBe(0); // casters to the north-east, south or south-west cast nothing here
});

test('bands lie along the north and west edges, with a thin contact line on the east',()=>{
  const m=by(shadeTiles({prefix:'edge_wall',n:3,w:2,e:1}));
  const north=m[N];for(let x=0;x<16;x++){expect(north[0][x]).toBe(1);expect(north[2][x]).toBe(1);expect(north[3][x]).toBe(0);}
  const west=m[W];for(let y=0;y<16;y++){expect(west[y][0]).toBe(1);expect(west[y][1]).toBe(1);expect(west[y][2]).toBe(0);}
  const east=m[E];for(let y=0;y<16;y++){expect(east[y][15]).toBe(1);expect(east[y][14]).toBe(0);}
  expect(m[N|W][0][0]).toBe(1);expect(m[N|W][15][1]).toBe(1);expect(m[N|W][5][5]).toBe(0);
  // a diagonal caster leaves a chamfered corner block only
  const c=m[NW];expect(c[0][0]).toBe(1);expect(c[2][1]).toBe(0);expect(c[3][0]).toBe(0);expect(c[8][8]).toBe(0);
});

test('neighbouring tiles join: the band meets the edge in the same rows on every tile',()=>{
  const m=by(shadeTiles({prefix:'p',n:4,w:3,e:1}));
  for(const mask of [N,N|E,N|W,N|E|W])for(let x=0;x<16;x++)expect(m[mask][0][x]).toBe(1);
  expect(m[N][0].join()).toBe(m[N|E][0].slice(0,15).concat(1).join());
});

test('invalid shade depth is rejected',()=>{
  expect(()=>shadeTiles({prefix:'p',n:0,w:1})).toThrow();expect(()=>shadeTiles({prefix:'p',n:9,w:1})).toThrow();expect(()=>shadeTiles({prefix:'p',n:1,w:1,color:'x'})).toThrow();
});
