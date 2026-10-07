import {test,expect} from 'vitest';
import {nativeMannequin} from '../examples/native-character/native-mannequin.mjs';
import {SKIN_TONES} from '../server/engine/skin-tones.js';

test('large mannequin retains the adult face above the jaw, motion and pivots while broadening the body',()=>{
 const adult=nativeMannequin('adult');
 const large=nativeMannequin('large');
 expect(large.filter(o=>['name','group','pivot'].includes(o.command))).toEqual(adult.filter(o=>['name','group','pivot'].includes(o.command)));
 for(const {cell} of adult.filter(o=>o.command==='name')){
  const head=new Set(adult.find(o=>o.command==='shape-group'&&o.cell===cell&&o.name==='head').shapes);
  // Only the jaw row (nine rows below the head top, as the generator measures it) is widened;
  // everything above it is the adult face. Back views widen the same row at the skull base.
  const adultHead=adult.filter(o=>o.command==='draw'&&o.cell===cell&&head.has(o.name)),jaw=Math.min(...adultHead.map(p=>p.y))+9;
  expect(large.filter(o=>o.command==='draw'&&o.cell===cell&&head.has(o.name)&&o.y<jaw)).toEqual(adultHead.filter(p=>p.y<jaw));
  const points=large.filter(o=>o.command==='draw'&&o.cell===cell);
  expect(points.every(p=>p.x>=0&&p.x<16&&p.y>=0&&p.y<32)).toBe(true);
  expect(new Set(points.map(p=>`${p.x},${p.y}`)).size).toBe(points.length);
  expect(points.length).toBeGreaterThan(adult.filter(o=>o.command==='draw'&&o.cell===cell).length);
  for(const g of large.filter(o=>o.command==='shape-group'&&o.cell===cell))expect(g.shapes.every(n=>points.some(p=>p.name===n))).toBe(true);
 }
});
test('large body remains fully skin-selectable in all seven ramps',()=>{
 for(const tone of SKIN_TONES){
  const ops=nativeMannequin('large',tone.id);
  for(const g of ops.filter(o=>o.command==='shape-group'&&o.name.startsWith('skin-'))){
   for(const n of g.shapes)expect(ops.find(o=>o.command==='draw'&&o.cell===g.cell&&o.name===n).color).toBe(tone.colors[g.name.slice(5)]);
  }
 }
});

test('large arms contain two adjacent skin pixels inside their outline in every pose',()=>{
 const ops=nativeMannequin('large');
 for(const {cell,as:alias} of ops.filter(o=>o.command==='name')){
  const names=ops.find(o=>o.command==='shape-group'&&o.cell===cell&&o.name==='arms')?.shapes;
  expect(names,alias).toBeDefined();
  const arm=ops.filter(o=>o.command==='draw'&&o.cell===cell&&names.includes(o.name)&&o.color!=='#673649');
  const rows=new Set(arm.filter(p=>arm.some(q=>q.y===p.y&&q.x===p.x+1)).map(p=>p.y));
  expect(rows.size,alias).toBeGreaterThanOrEqual(3);
 }
 for(const cell of ['0,0','2,0'])for(const y of [16,17,18]){
  const points=ops.filter(o=>o.command==='draw'&&o.cell===cell&&o.y===y);
  for(const x of [2,3,12,13])expect(points.find(p=>p.x===x)?.color).not.toBe('#673649');
 }
});

import {cutOutlineCorners} from '../server/engine/outline-corners.js';
const OUTLINE='#673649';
const cellsOf=ops=>{const m=new Map();for(const o of ops)if(o.command==='draw'){if(!m.has(o.cell))m.set(o.cell,new Map());m.get(o.cell).set(o.x+','+o.y,o);}return m;};
const aliasOf=(ops,cell)=>ops.find(o=>o.command==='name'&&o.cell===cell).as;
const widths=(ops,cell,y)=>{const xs=ops.filter(o=>o.command==='draw'&&o.cell===cell&&o.y===y).map(o=>o.x);return Math.max(...xs)-Math.min(...xs)+1;};

test('large shoulders, neck and jaw are broader than the adult in front and back views',()=>{
 const adult=nativeMannequin('adult'),large=nativeMannequin('large');
 for(const {cell,as} of adult.filter(o=>o.command==='name'&&/^(front|back)(_|$)/.test(o.as))){
  const head=new Set(adult.find(o=>o.command==='shape-group'&&o.cell===cell&&o.name==='head').shapes);
  const jaw=Math.min(...adult.filter(o=>o.command==='draw'&&o.cell===cell&&head.has(o.name)).map(p=>p.y))+9;
  expect(widths(large,cell,jaw),as+' jaw').toBeGreaterThan(widths(adult,cell,jaw));
  expect(widths(large,cell,jaw+2),as+' neck').toBeGreaterThanOrEqual(widths(adult,cell,jaw+2)+4);
  expect(widths(large,cell,jaw+3),as+' shoulders').toBeGreaterThan(widths(adult,cell,jaw+3));
 }
});

test('outside outline corners join diagonally without exposing skin',()=>{
 const large=nativeMannequin('large');
 // A filled 4x4 square outlined in OUTLINE loses exactly its four corner pixels.
 const box=[];for(let y=0;y<4;y++)for(let x=0;x<4;x++)box.push({command:'draw',type:'point',cell:'0,0',name:`p${x}${y}`,x,y,color:x%3&&y%3?'#ffa9ad':OUTLINE});
 const {ops,removed}=cutOutlineCorners([...box,{command:'shape-group',sub:'create',cell:'0,0',name:'all',shapes:box.map(p=>p.name)}],OUTLINE);
 expect(removed.map(p=>p.x+','+p.y).sort()).toEqual(['0,0','0,3','3,0','3,3']);
 expect(ops.find(o=>o.command==='shape-group').shapes).not.toContain('p00');
 for(const [cell,px] of cellsOf(large)){
  for(const p of px.values()){
   if(p.color===OUTLINE)continue;
   expect([[-1,0],[1,0],[0,-1],[0,1]].every(([dx,dy])=>px.has((p.x+dx)+','+(p.y+dy))),`${aliasOf(large,cell)} skin exposed at ${p.x},${p.y}`).toBe(true);
  }
  // The cut is one pass: a second pass may only find the few corners the first created,
  // at walking foot soles, never above the ankles.
  const again=cutOutlineCorners([...px.values()],OUTLINE).removed;
  expect(again.every(p=>p.y>=27),`${aliasOf(large,cell)} second-order corners ${JSON.stringify(again)}`).toBe(true);
 }
});

test('swinging profile arms leave no stale outline stripes beside the arm band',()=>{
 const ops=nativeMannequin('large'),cells=cellsOf(ops);
 for(const {cell,as} of ops.filter(o=>o.command==='name'&&/^(right|left)_walk_[13]$/.test(o.as))){
  const arms=new Set(ops.find(o=>o.command==='shape-group'&&o.cell===cell&&o.name==='arms').shapes),px=cells.get(cell);
  const armAt=new Set([...px.values()].filter(p=>arms.has(p.name)).map(p=>p.x+','+p.y));
  const stale=[...px.values()].filter(p=>p.color===OUTLINE&&!arms.has(p.name)
   &&[[-1,0],[1,0],[0,-1],[0,1]].every(([dx,dy])=>px.has((p.x+dx)+','+(p.y+dy)))
   &&[-1,0,1].some(dx=>[-1,0,1].some(dy=>(dx||dy)&&armAt.has((p.x+dx)+','+(p.y+dy)))));
  expect(stale.map(p=>p.x+','+p.y),as).toEqual([]);
 }
});
