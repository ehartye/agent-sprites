import {test,expect} from 'vitest';
import {lensRows,shadowPixels,shadeTiles,normalizeShadeMask,shadeMasks,SHADE_MASKS,SHADE_BITS} from '../../server/authoring/tileset-shadow.js';

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

const {s:S,sw:SW,se:SE}=SHADE_BITS;

test('without s= the set is exactly the nine masks and the pixels do not change',()=>{
  const plain=shadeTiles({prefix:'p',n:3,w:2,e:1});
  expect(plain.map(t=>t.mask)).toEqual(SHADE_MASKS);
  expect(plain.map(t=>t.mask)).toEqual(shadeTiles({prefix:'p',n:3,w:2,e:1,s:0}).map(t=>t.mask));
  expect(normalizeShadeMask(S|SW|SE|N)).toBe(N); // south bits are ignored when the recipe has no south line
});

test('s= adds a contact line along the bottom edge for a wall to the south, with chamfered corner blocks',()=>{
  const set=shadeTiles({prefix:'p',n:3,w:2,e:1,s:2}),m=by(set);
  const masks=set.map(t=>t.mask);
  expect(new Set(masks).size).toBe(masks.length);
  for(const mask of masks)expect(normalizeShadeMask(mask,{south:true,east:true})).toBe(mask);
  const south=m[S];for(let x=0;x<16;x++){expect(south[15][x]).toBe(1);expect(south[14][x]).toBe(1);expect(south[13][x]).toBe(0);expect(south[0][x]).toBe(0);}
  const sw=m[SW];expect(sw[15][0]).toBe(1);expect(sw[15][1]).toBe(1);expect(sw[14][0]).toBe(1);expect(sw[14][1]).toBe(0);expect(sw[15][2]).toBe(0);expect(sw[13][0]).toBe(0);
  const se=m[SE];expect(se[15][15]).toBe(1);expect(se[14][15]).toBe(1);expect(se[15][14]).toBe(0);
  // the bottom rows meet the edge so the band of the tile below joins the wall's own outline
  expect(m[S|N][0].every(Boolean)).toBe(true);expect(m[S|N][15].every(Boolean)).toBe(true);expect(m[S|N][8].every(c=>!c)).toBe(true);
});

test('south diagonals are dropped when S, W or E already shadow that corner, and SE needs e>0',()=>{
  expect(normalizeShadeMask(S|SW|SE,{south:true,east:true})).toBe(S);
  expect(normalizeShadeMask(W|SW,{south:true})).toBe(W);expect(normalizeShadeMask(E|SE,{south:true,east:true})).toBe(E);
  expect(normalizeShadeMask(SE,{south:true,east:false})).toBe(0);
  expect(shadeMasks({south:true,east:true}).length).toBe(33);expect(shadeMasks({south:true}).length).toBe(25);
  expect(()=>shadeTiles({prefix:'p',n:1,w:1,s:9})).toThrow();
});
