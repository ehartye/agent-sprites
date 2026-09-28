import {test,expect} from 'vitest';
import {nativeMannequin} from '../examples/native-character/native-mannequin.mjs';
import {nativeReport} from '../examples/native-character/native-report.mjs';
import {STRIDE} from '../examples/native-character/joints.mjs';
import {createWalker} from '../server/build/playback-runtime.mjs';

const walkerFor=(kind,mode='authored-contact',facing='right')=>createWalker([nativeReport(nativeMannequin(kind),kind)],{person:'',outfit:'',mode,facing});

test('strides are the measured per-body values',()=>{
  expect(STRIDE).toEqual({adult:3.5,child:2.5,large:4});
});

for(const kind of ['adult','child','large'])test(`${kind}: walking steps through the authored frames at its measured stride`,()=>{
  const w=walkerFor(kind),fd=STRIDE[kind];
  const seen=[];
  for(let i=0;i<Math.ceil(fd*8);i++)seen.push(w.update(1,0).alias);
  // Every frame advances after fd source pixels, cycling 0..3.
  expect(seen[Math.ceil(fd)-1]).toBe('right_walk_1');
  expect(new Set(seen)).toEqual(new Set(['right_walk_0','right_walk_1','right_walk_2','right_walk_3']));
  expect(w.update(0,0).alias).toBe('right');
});

test('native facing names are used for every direction, and nothing claims planted feet',()=>{
  for(const mode of ['authored-contact','continuous-root']){
    const w=walkerFor('adult',mode);
    for(const [dx,dy,alias,idle] of [[-1,0,'left_walk_0','left'],[0,1,'front_walk_0','front'],[0,-1,'back_walk_0','back']]){
      const s=w.update(dx,dy);
      expect(s).toMatchObject({alias,offset:[0,0],contactsCalibrated:false});
      expect(w.update(0,0).alias).toBe(idle);
    }
  }
});

test('walk frames carry uncalibrated locomotion; idle frames carry none',()=>{
  const r=nativeReport(nativeMannequin('child'),'child');
  const f=r.frames.find(x=>x.alias==='front_walk_2');
  expect(f.locomotion).toEqual({cycleDistance:10,frameDistance:2.5,phaseDistance:5,frameCount:4,fps:8,direction:[0,1],contactCalibration:'none',rootCompensation:'none',contacts:[]});
  expect(r.frames.find(x=>x.alias==='front').locomotion).toBeUndefined();
});
