import {test,expect} from 'vitest';
import {nativeMannequin} from '../examples/native-character/native-mannequin.mjs';
import {nativeReport} from '../examples/native-character/native-report.mjs';
import {STRIDE,PROFILE_STEPS} from '../examples/native-character/joints.mjs';
import {createWalker} from '../server/build/playback-runtime.mjs';

const walkerFor=(kind,mode='authored-contact',facing='right')=>createWalker([nativeReport(nativeMannequin(kind),kind)],{person:'',outfit:'',mode,facing});

// Sole centres on the ground row (29) of a walk frame, left to right.
const soles=(ops,alias)=>{
  const cell=ops.find(o=>o.command==='name'&&o.as===alias).cell;
  const xs=[...new Set(ops.filter(o=>o.command==='draw'&&o.cell===cell&&o.y===29).map(o=>o.x))].sort((a,b)=>a-b),runs=[];
  for(const x of xs){const r=runs.at(-1);if(r&&x===r[1]+1)r[1]=x;else runs.push([x,x]);}
  return runs.map(([a,b])=>(a+b)/2);
};

test('front and back strides are the measured per-body values',()=>{
  expect(STRIDE).toEqual({adult:3.5,child:2.5,large:4});
});

for(const kind of ['adult','child','large'])test(`${kind}: profile steps match the support foot's travel in the art`,()=>{
  const ops=nativeMannequin(kind);
  for(const dir of ['right','left']){
    const [[c0],s1,[c2],s3]=[0,1,2,3].map(f=>soles(ops,`${dir}_walk_${f}`));
    // Facing right the back foot is the left run; facing left it is the right run.
    const [back1,front1]=dir==='right'?s1:[...s1].reverse(),[back3,front3]=dir==='right'?s3:[...s3].reverse();
    expect([c0-back1,front1-c2,c2-back3,front3-c0].map(Math.abs)).toEqual(PROFILE_STEPS[kind]);
  }
});

for(const kind of ['adult','child','large'])for(const dir of ['right','left'])test(`${kind} ${dir}: the support foot stays planted across frames`,()=>{
  const ops=nativeMannequin(kind),w=walkerFor(kind,'authored-contact',dir),sign=dir==='right'?1:-1;
  const sole=[0,1,2,3].map(f=>soles(ops,`${dir}_walk_${f}`));
  const back=s=>dir==='right'?s[0]:s.at(-1),front=s=>dir==='right'?s.at(-1):s[0];
  // During frame i the planted foot is: passing frames' single sole, stride frames' front foot.
  const planted=i=>i%2===0?sole[i][0]:front(sole[i]);
  // Entering frame i the same foot appears as: stride frames' back foot, passing frames' sole.
  const arriving=i=>i%2===1?back(sole[i]):sole[i][0];
  let travelled=0,prev=null;
  for(let n=0;n<160;n++){
    const s=w.update(sign*0.25,0);travelled+=0.25;
    expect(s.contactsCalibrated).toBe(true);
    const i=Number(s.alias.split('_').at(-1)),root=sign*travelled+s.offset[0];
    if(prev&&prev.i===i)expect(root).toBeCloseTo(prev.root,9); // the body holds still within a frame
    if(prev&&prev.i!==i)expect(root+arriving(i)).toBeCloseTo(prev.root+planted(prev.i),9);
    prev={i,root};
  }
});

test('front and back keep a uniform uncalibrated stride and native facing names',()=>{
  for(const mode of ['authored-contact','continuous-root']){
    const w=walkerFor('adult',mode,'down');
    for(const [dx,dy,alias,idle] of [[0,1,'front_walk_0','front'],[0,-1,'back_walk_0','back']]){
      expect(w.update(dx,dy)).toMatchObject({alias,offset:[0,0],contactsCalibrated:false});
      expect(w.update(0,0).alias).toBe(idle);
    }
  }
  const w=walkerFor('child','authored-contact','down'),seen=[];
  for(let i=0;i<10;i++)seen.push(w.update(0,1).alias);
  expect(seen[Math.ceil(STRIDE.child)-1]).toBe('front_walk_1');
});

test('continuous-root never claims planted feet',()=>{
  expect(walkerFor('adult','continuous-root').update(1,0)).toMatchObject({offset:[0,0],contactsCalibrated:false});
});

test('walk frames carry locomotion; idle frames carry none',()=>{
  const r=nativeReport(nativeMannequin('child'),'child');
  expect(r.frames.find(x=>x.alias==='front_walk_2').locomotion).toEqual({cycleDistance:10,frameDistance:2.5,phaseDistance:5,frameCount:4,fps:8,direction:[0,1],contactCalibration:'none',rootCompensation:'none',contacts:[]});
  expect(r.frames.find(x=>x.alias==='right_walk_2').locomotion).toEqual({cycleDistance:10,frameDistance:2.5,frameDistances:[3.5,1,3.5,2],phaseDistance:4.5,frameCount:4,fps:8,direction:[1,0],contactCalibration:'profile',rootCompensation:'subtract-phase-remainder',contacts:[]});
  expect(r.frames.find(x=>x.alias==='front').locomotion).toBeUndefined();
});
