import {test,expect} from 'vitest';
import {JOINTS,jointsFor,handBoxes} from '../examples/native-character/joints.mjs';
import {nativeMannequin} from '../examples/native-character/native-mannequin.mjs';

const FACINGS=['front','right','back','left'];
const cellOf=(ops,as)=>ops.find(o=>o.command==='name'&&o.as===as).cell;
const aliasOf=(facing,phase)=>phase===null?facing:`${facing}_walk_${phase}`;

for(const kind of ['adult','child','large'])test(`${kind}: every landmark sits on or beside a body pixel of its frame`,()=>{
  const ops=nativeMannequin(kind);
  for(const facing of FACINGS)for(const phase of [null,0,1,2,3]){
    const cell=cellOf(ops,aliasOf(facing,phase)),pts=ops.filter(o=>o.command==='draw'&&o.cell===cell);
    const j=jointsFor(kind,facing,phase);
    for(const side of ['left','right'])for(const joint of ['shoulder','wrist','hip']){
      const [x,y]=j[side][joint];
      expect(pts.some(p=>Math.abs(p.x-x)<=1&&Math.abs(p.y-y)<=1),`${kind} ${aliasOf(facing,phase)} ${side} ${joint} ${x},${y}`).toBe(true);
    }
  }
});

test('left mirrors right with side labels swapped',()=>{
  for(const phase of [null,0,1,2,3]){
    const r=jointsFor('adult','right',phase),l=jointsFor('adult','left',phase);
    for(const joint of ['shoulder','wrist','hip']){
      expect(l.left[joint]).toEqual([15-r.right[joint][0],r.right[joint][1]]);
      expect(l.right[joint]).toEqual([15-r.left[joint][0],r.left[joint][1]]);
    }
  }
});

test('back reuses front positions with side labels swapped',()=>{
  const f=jointsFor('adult','front',1),b=jointsFor('adult','back',1);
  expect(b.left).toEqual(f.right);expect(b.right).toEqual(f.left);
});

test('large maps adult x through the broadening split',()=>{
  const a=jointsFor('adult','front',0),g=jointsFor('large','front',0);
  const split=x=>x<7?x-1:x>8?x+1:x;
  expect(g.right.shoulder).toEqual([split(a.right.shoulder[0]),a.right.shoulder[1]]);
});

test('idle uses phase 0, and the table covers 8 source poses per body',()=>{
  expect(jointsFor('child','right',null)).toEqual(jointsFor('child','right',0));
  expect(Object.keys(JOINTS.adult).sort()).toEqual(['front_0','front_1','front_2','front_3','right_0','right_1','right_2','right_3']);
  expect(handBoxes('adult','right',1)).toEqual([[2,20,4,22],[11,20,13,22]]);
});
