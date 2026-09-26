import {test,expect} from 'vitest';
import {BODY_PROFILES,humanoidPose,validatePose} from '../../server/authoring/humanoid-poses.js';
import {generateCharacterRecipe} from '../../server/authoring/character.js';
const bodies=Object.keys(BODY_PROFILES);
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const relative=(a,b)=>a.map((v,i)=>v-b[i]);

test('front rest and every walk phase retain the same blue leg and yellow arm orientation',()=>{
 for(const body of bodies)for(const arms of [2,4])for(const outfit of ['casual','service','retro','phase-suit'])for(const mode of ['idle','walk','expressions']){
  const recipe=generateCharacterRecipe({people:[{id:'person',body,arms}],outfits:[outfit],directions:['down'],mode});
  for(const frame of recipe.report.frames){
   const leg=frame.legs.find(l=>l.name==='left'),[x,y]=leg.ankle;
   expect(leg.hip[0]).toBe(x);expect(leg.knee[0]).toBe(x);
   const boot=recipe.operations.find(o=>o.cell===frame.cell&&o.name==='left_boot_outline');
   // Toe faces screen-left through contact, passing, swing and neutral poses.
   expect(boot.points).toEqual([{x:x+2,y:y-2},{x:x-1,y:y-2},{x:x-1,y:y-1},{x:x-3,y},{x:x-3,y:y+2},{x:x+2,y:y+2}]);
   const shin=recipe.operations.find(o=>o.cell===frame.cell&&o.name==='left_shin_outline');
   const width=body==='child'?4:5;
   expect(Math.min(...shin.points.map(p=>p.x))).toBe(x-Math.ceil(width/2));
   expect(Math.max(...shin.points.map(p=>p.x))).toBe(x+Math.floor(width/2));
   const arm=frame.arms.find(a=>a.name==='right'),axis=arm.shoulder[0];
   expect(arm.elbow[0]).toBe(axis);expect(arm.wrist[0]).toBe(axis);
   const forearm=recipe.operations.find(o=>o.cell===frame.cell&&o.name==='right_forearm_outline');
   const armWidth=arms===4||body==='child'?3:4;
   expect(Math.min(...forearm.points.map(p=>p.x))).toBe(axis-Math.ceil(armWidth/2));
   expect(Math.max(...forearm.points.map(p=>p.x))).toBe(axis+Math.floor(armWidth/2));
   const thumb=recipe.operations.find(o=>o.cell===frame.cell&&o.name==='right_glove_thumb');
   if(frame.sealed)expect(thumb.x).toBe(axis+2);
  }
 }
});

test('paired arms have equal shoulder-relative anatomy at matching phases and fixed bone lengths',()=>{
 for(const body of bodies)for(const direction of ['right','left'])for(const count of [2,4])for(let f=0;f<8;f++){
  const pose=humanoidPose(body,direction,f,true,count),opposite=humanoidPose(body,direction,(f+4)%8,true,count);
  for(const arm of pose.arms){
   const other=opposite.arms.find(a=>a.name===arm.name.replace(/^(left|right)/,n=>n==='left'?'right':'left'));
   expect(relative(arm.elbow,arm.shoulder)).toEqual(relative(other.elbow,other.shoulder));
   expect(relative(arm.wrist,arm.shoulder)).toEqual(relative(other.wrist,other.shoulder));
   expect(Math.abs(distance(arm.shoulder,arm.elbow)-arm.lengths.upper)).toBeLessThanOrEqual(.75);
   expect(Math.abs(distance(arm.elbow,arm.wrist)-arm.lengths.lower)).toBeLessThanOrEqual(.75);
  }
 }
});

test('front and back pairs share equal projected anatomy after their half-cycle shift',()=>{
 for(const body of bodies)for(const direction of ['down','up'])for(let f=0;f<8;f++){
  const pose=humanoidPose(body,direction,f,true,4),other=humanoidPose(body,direction,(f+4)%8,true,4);
  for(const leg of pose.legs){
   const pair=other.legs.find(l=>l.name!==leg.name);
   for(const key of ['knee','ankle'])expect(relative(leg[key],leg.hip)).toEqual(relative(pair[key],pair.hip));
  }
  for(const arm of pose.arms){
   const pair=other.arms.find(a=>a.name===arm.name.replace(/^(left|right)/,n=>n==='left'?'right':'left'));
   for(const key of ['elbow','wrist']){
    const a=relative(arm[key],arm.shoulder),b=relative(pair[key],pair.shoulder);
    expect(a[0]).toBe(-b[0]||0);expect(a[1]).toBe(b[1]);
   }
  }
 }
});

test('validation catches stretched arms and foot reports that disagree with the actual sole',()=>{
 const pose=structuredClone(humanoidPose('adult','right',2));
 pose.arms[0].wrist[0]+=5;
 expect(validatePose(pose,true)).toContain('arm-length-drift');
 const shifted=structuredClone(humanoidPose('adult','right',3));
 shifted.legs[1].toe[1]-=2;
 expect(validatePose(shifted,true)).toContain('foot-landmark-mismatch');
});

test('foot contact rolls heel to flat to toe, clears the floor modestly, and has continuous support',()=>{
 for(const body of bodies)for(const direction of ['right','left']){
  const cycle=Array.from({length:8},(_,f)=>humanoidPose(body,direction,f));
  expect(new Set(cycle.flatMap(p=>p.legs.map(l=>l.foot.state)))).toEqual(new Set(['heel','flat','toe','swing']));
  for(const pose of cycle){
   expect(pose.legs.some(l=>l.foot.contact&&l.support)).toBe(true);
   for(const leg of pose.legs){
    expect(leg.foot.outline).toContainEqual(leg.heel);
    expect(leg.foot.outline).toContainEqual(leg.toe);
    if(leg.foot.state==='heel')expect(leg.heel[1]).toBeGreaterThan(leg.toe[1]);
    if(leg.foot.state==='toe')expect(leg.toe[1]).toBeGreaterThan(leg.heel[1]);
    if(leg.foot.state==='swing')expect(pose.ground-Math.max(leg.heel[1],leg.toe[1])).toBeLessThanOrEqual(3);
   }
  }
 }
});

test('both legs keep the same physical heel and toe stationary through contact windows and cycle wrap',()=>{
 for(const body of bodies)for(const direction of ['right','left']){
  const sign=direction==='right'?1:-1,poses=Array.from({length:16},(_,absoluteFrame)=>humanoidPose(body,direction,absoluteFrame%8));
  let checkedWrap=false;
  for(const name of ['left','right']){
   const starts=poses.flatMap((pose,f)=>pose.legs.find(l=>l.name===name).phase===0&&f+4<poses.length?[f]:[]);
   expect(starts.length).toBeGreaterThan(0);
   for(const start of starts)for(const [key,phases] of [['heel',[0,1,2]],['toe',[1,2,3,4]]]){
    const indices=phases.map(phase=>start+phase);
    const points=indices.map(f=>poses[f].legs.find(l=>l.name===name)[key][0]+sign*f*poses[f].locomotion.frameDistance);
    expect(Math.max(...points)-Math.min(...points),`${body} ${direction} ${name} ${key} frames ${indices}`).toBeLessThanOrEqual(1);
    if(Math.floor(indices[0]/8)!==Math.floor(indices.at(-1)/8))checkedWrap=true;
   }
  }
  expect(checkedWrap).toBe(true);
 }
});

test('pelvic mass joins the seat to both thigh roots under every outfit and body',()=>{
 for(const body of bodies){
  const built=generateCharacterRecipe({people:[{id:'person',body}],directions:['down','right','up','left'],outfits:['casual','service'],mode:'walk'});
  for(const frame of built.report.frames){
   const pelvis=built.operations.find(o=>o.command==='draw'&&o.cell===frame.cell&&o.name==='pelvis_outline');
   expect(pelvis).toBeDefined();
   expect(Math.max(...pelvis.points.map(p=>p.y))).toBeGreaterThan(frame.torso.hemY);
   expect(frame.pelvis.hips).toHaveLength(2);
   expect(frame.locomotion).toMatchObject({frameCount:8,rootCompensation:['right','left'].includes(frame.direction)?'subtract-phase-remainder':'none'});
   if(['right','left'].includes(frame.direction))for(const leg of frame.legs){
    const boot=built.operations.find(o=>o.command==='draw'&&o.cell===frame.cell&&o.name===`${leg.name}_boot_outline`);
    for(const key of ['heel','ball','toe'])expect(boot.points).toContainEqual({x:leg[key][0],y:leg[key][1]});
   }
  }
 }
});
