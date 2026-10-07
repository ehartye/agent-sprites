import {test,expect} from 'vitest';
import {nativeMannequin,sourceMannequin} from '../examples/native-character/native-mannequin.mjs';
import {nativeReport} from '../examples/native-character/native-report.mjs';
import {jointsFor} from '../examples/native-character/joints.mjs';
import {attachmentFor,groundAnchor,createWalker} from '../server/build/playback-runtime.mjs';
import {bodySideRole} from '../server/authoring/humanoid-poses.js';

const RUNTIME={front:'down',back:'up',right:'right',left:'left'};

test('the native report matches the recipe contract with native names',()=>{
  const ops=sourceMannequin('adult'),r=nativeReport(ops,'adult');
  expect(r).toMatchObject({version:1,ok:true,kind:'character',system:'native',cellSize:{width:16,height:32},ground:29,
    aliases:{idle:'{direction}',walk:'{direction}_walk_{frame}'},directions:{down:'front',up:'back',right:'right',left:'left'}});
  expect(r.frames).toHaveLength(20);
  for(const f of r.frames){
    const j=jointsFor('adult',f.direction,f.frame);
    for(const side of ['left','right']){
      expect(f.sides[side]).toEqual({role:bodySideRole(side,RUNTIME[f.direction]),...j[side]});
    }
    expect(f.gear).toEqual([]);
    expect(f.bounds.bottom).toBe(29);
  }
});

for(const kind of ['adult','child','large'])test(`${kind}: bare native reports publish eight directions with uncalibrated diagonal motion`,()=>{
  const r=nativeReport(nativeMannequin(kind),kind);
  expect(r.frames).toHaveLength(40);
  expect(r.directions).toEqual({down:'front',up:'back',right:'right',left:'left',
    'down-right':'front-right','up-right':'back-right','up-left':'back-left','down-left':'front-left'});
  for(const direction of ['front-right','back-right','back-left','front-left']){
    const near=direction.endsWith('-right')?'right':'left',far=near==='right'?'left':'right';
    const idle=r.frames.find(f=>f.alias===direction);
    expect(idle.locomotion).toBeUndefined();
    for(const f of r.frames.filter(f=>f.direction===direction)){
      const joints=jointsFor(kind,direction,f.frame);
      expect(f.sides[near]).toEqual({role:'near',...joints[near]});
      expect(f.sides[far]).toEqual({role:'far',...joints[far]});
      expect(attachmentFor(f,far,'wrist',groundAnchor(r,f),100,200).layer).toBe('under-body');
      if(f.frame!==null){
        expect(f.locomotion).toMatchObject({contactCalibration:'none',rootCompensation:'none',contacts:[],frameCount:4});
        expect(f.locomotion.frameDistances).toBeUndefined();
        const [x,y]=f.locomotion.direction;
        expect(Math.hypot(x,y)).toBeCloseTo(1);
        expect(Math.sign(x)).toBe(direction.endsWith('-right')?1:-1);
        expect(Math.sign(y)).toBe(direction.startsWith('front-')?1:-1);
      }
    }
  }
  const walker=createWalker(r,{mode:'authored-contact'});
  expect(walker.update(1,1)).toMatchObject({facing:'down-right',alias:'front-right_walk_0',contactsCalibrated:false,offset:[0,0]});
  expect(walker.update(0,0).alias).toBe('front-right');
});

test('report directions reflect only views actually present in the operations',()=>{
  const source=sourceMannequin('adult');
  const cells=new Set(source.filter(o=>o.command==='name'&&o.as.startsWith('right')).map(o=>o.cell));
  const r=nativeReport(source.filter(o=>cells.has(o.cell)),'adult');
  expect(r.directions).toEqual({right:'right'});
});

test('runtime helpers work from a native report; the walker explains a report without walk data',()=>{
  const r=nativeReport(nativeMannequin('child'),'child'),f=r.frames.find(x=>x.alias==='right');
  expect(groundAnchor(r,f)).toEqual({x:8,y:29});
  expect(attachmentFor(f,'right','wrist',groundAnchor(r,f),100,200,{scale:2})).toMatchObject({role:'near',layer:'over-body'});
  const stripped={...r,frames:r.frames.map(({locomotion,...frame})=>frame)};
  expect(()=>createWalker([stripped],{person:'',outfit:'',mode:'continuous-root',facing:'right'}).update(1,0)).toThrow(/no locomotion data in this report/);
});
