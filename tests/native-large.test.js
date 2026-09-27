import {test,expect} from 'vitest';
import {nativeMannequin} from '../examples/native-character/native-mannequin.mjs';
import {SKIN_TONES} from '../server/engine/skin-tones.js';

test('large mannequin retains adult heads, motion and pivots while broadening the body',()=>{
 const adult=nativeMannequin('adult');
 const large=nativeMannequin('large');
 expect(large.filter(o=>['name','group','pivot'].includes(o.command))).toEqual(adult.filter(o=>['name','group','pivot'].includes(o.command)));
 for(const {cell} of adult.filter(o=>o.command==='name')){
  const head=new Set(adult.find(o=>o.command==='shape-group'&&o.cell===cell&&o.name==='head').shapes);
  expect(large.filter(o=>o.command==='draw'&&o.cell===cell&&head.has(o.name))).toEqual(adult.filter(o=>o.command==='draw'&&o.cell===cell&&head.has(o.name)));
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
