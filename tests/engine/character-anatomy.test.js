import {test,expect} from 'vitest';
import {BODY_PROFILES,humanoidPose,validatePose} from '../../server/authoring/humanoid-poses.js';
import {generateCharacterRecipe} from '../../server/authoring/character.js';
import {drawHumanoid} from '../../server/authoring/humanoid-draw.js';
const bodies=Object.keys(BODY_PROFILES);
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const relative=(a,b)=>a.map((v,i)=>v-b[i]);

test('front rest flips only the blue-guide leg around its fixed hip, across body and clothing presets',()=>{
 for(const body of bodies)for(const outfit of ['casual','service','retro'])for(const direction of ['down','right','up']){
  const pose=humanoidPose(body,direction,0,false),axis=pose.legs.find(l=>l.name==='left').hip[0];
  const person={body,head:'human',hair:'short',arms:2,colors:new Proxy({},{get:(_,key)=>key})};
  const capture=resting=>{
   const calls=[];
   const pen=Object.fromEntries(['poly','rect','line','ellipse'].map(type=>[type,(...args)=>calls.push({type,args})]));
   drawHumanoid(pen,person,outfit,direction,pose,'neutral',resting);
   return calls;
  };
  const before=capture(false),after=capture(true);
  expect(after).toHaveLength(before.length);
  for(let i=0;i<before.length;i++){
   const a=before[i],b=after[i];
   if(direction!=='down'||!/^left_(thigh|shin|knee|boot|ankle)/.test(a.args[0])){expect(b).toEqual(a);continue;}
   expect(b.type).toBe(a.type);expect(b.args[0]).toBe(a.args[0]);expect(b.args.at(-1)).toBe(a.args.at(-1));
   if(a.type==='poly')for(let j=0;j<a.args[1].length;j++){
    expect(a.args[1][j][0]+b.args[1][j][0]).toBe(2*axis);
    expect(b.args[1][j][1]).toBe(a.args[1][j][1]);
   }
   if(a.type==='rect'){
    expect(a.args[1]+b.args[1]+a.args[3]-1).toBe(2*axis);
    expect(b.args.slice(2)).toEqual(a.args.slice(2));
   }
   if(a.type==='line'){
    expect(a.args[1]+b.args[1]).toBe(2*axis);expect(a.args[3]+b.args[3]).toBe(2*axis);
    expect(b.args[2]).toBe(a.args[2]);expect(b.args[4]).toBe(a.args[4]);
   }
  }
 }
 const recipe=generateCharacterRecipe({people:[{id:'farmer'}],mode:'idle'});
 expect(recipe.operations.find(o=>o.name==='left_boot_outline').points).toContainEqual({x:21,y:54});
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
