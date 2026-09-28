import {test,expect} from 'vitest';
import {nativeMannequin} from '../examples/native-character/native-mannequin.mjs';
import {nativeReport} from '../examples/native-character/native-report.mjs';
import {jointsFor} from '../examples/native-character/joints.mjs';
import {attachmentFor,groundAnchor,createWalker} from '../server/build/playback-runtime.mjs';
import {bodySideRole} from '../server/authoring/humanoid-poses.js';

const RUNTIME={front:'down',back:'up',right:'right',left:'left'};

test('the native report matches the recipe contract with native names',()=>{
  const ops=nativeMannequin('adult'),r=nativeReport(ops,'adult');
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

test('runtime helpers work from a native report; the walker explains a report without walk data',()=>{
  const r=nativeReport(nativeMannequin('child'),'child'),f=r.frames.find(x=>x.alias==='right');
  expect(groundAnchor(r,f)).toEqual({x:8,y:29});
  expect(attachmentFor(f,'right','wrist',groundAnchor(r,f),100,200,{scale:2})).toMatchObject({role:'near',layer:'over-body'});
  const stripped={...r,frames:r.frames.map(({locomotion,...frame})=>frame)};
  expect(()=>createWalker([stripped],{person:'',outfit:'',mode:'continuous-root',facing:'right'}).update(1,0)).toThrow(/no locomotion data in this report/);
});
