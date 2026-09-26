import {profileFoot} from './humanoid-feet.js';

export const BODY_PROFILES = Object.freeze({
  adult: {headTop:12,headSize:16,torsoTop:28,hip:38,profileHip:37,width:12,gap:7,stride:8,segment:8},
  'adult-sturdy': {headTop:12,headSize:16,torsoTop:28,hip:38,profileHip:37,width:14,gap:8,stride:8,segment:8},
  'adult-slim': {headTop:12,headSize:16,torsoTop:28,hip:38,profileHip:37,width:11,gap:7,stride:8,segment:8},
  child: {headTop:24,headSize:14,torsoTop:38,hip:45,profileHip:44,width:10,gap:6,stride:4,segment:4.5},
  'older-child': {headTop:18,headSize:15,torsoTop:33,hip:41,profileHip:40,width:11,gap:6,stride:5,segment:6.5},
  rangy: {headTop:9,headSize:16,torsoTop:25,hip:35,profileHip:34,width:10,gap:7,stride:8,segment:9.5},
});
export const GROUND = 54;
const center=20, ankleY=52, bobs=[1,0,-1,0,1,0,-1,0];

/** Two-link construction; quantize candidates without reversing the knee hinge. */
export function forwardKnee(hip,ankle,length){
  const dx=ankle[0]-hip[0],dy=ankle[1]-hip[1],distance=Math.hypot(dx,dy);
  if(!distance||distance>length*2+.001)throw Error('Unreachable character leg pose.');
  const height=Math.sqrt(Math.max(0,length*length-distance*distance/4));
  const x=(hip[0]+ankle[0])/2+dy/distance*height,y=(hip[1]+ankle[1])/2-dx/distance*height;
  const choices=[];
  for(let kx=Math.floor(x)-1;kx<=Math.ceil(x)+1;kx++)for(let ky=Math.floor(y)-1;ky<=Math.ceil(y)+1;ky++){
    if(dy*(kx-hip[0])-dx*(ky-hip[1])<0)continue;
    const upper=Math.hypot(kx-hip[0],ky-hip[1]),lower=Math.hypot(kx-ankle[0],ky-ankle[1]);
    choices.push({point:[kx,ky],error:(upper-length)**2+(lower-length)**2+.005*((kx-x)**2+(ky-y)**2)});
  }
  return choices.sort((a,b)=>a.error-b.error)[0].point;
}

// Lengths belong to paired anatomy; near/far shading and projection never change them.
function armChain(shoulder,phase,walking,lengths,side,out,lower=false){
  const swing=walking?[-.52,-.35,0,.25,.42,.25,0,-.35][phase]:0;
  const upperAngle=lower?1.08+(walking ? .06*Math.sin(phase*Math.PI/4) : 0):swing;
  const lowerAngle=lower ? .91+(walking ? .06*Math.sin((phase-1)*Math.PI/4) : 0) : upperAngle+.22;
  const rawUpper=[Math.sin(upperAngle)*lengths.upper,Math.cos(upperAngle)*lengths.upper];
  const rawLower=[Math.sin(lowerAngle)*lengths.lower,Math.cos(lowerAngle)*lengths.lower];
  // Front/back is a foreshortened view, not a second anatomical model.
  const project=v=>side?v:[lower?v[0]*out*.4:0,v[1]];
  const a=project(rawUpper),b=project(rawLower);
  const elbow=[shoulder[0]+Math.round(a[0]),shoulder[1]+Math.round(a[1])];
  const wrist=[elbow[0]+Math.round(b[0]),elbow[1]+Math.round(b[1])];
  return {shoulder,elbow,wrist,lengths:{...lengths},projection:side?'profile':'foreshortened'};
}

export function humanoidPose(body,direction='down',frame=0,walking=true,armCount=2){
  const profile=BODY_PROFILES[body],side=['right','left'].includes(direction),canonical=direction==='left'?'right':direction;
  const bob=walking?bobs[frame]:0,small=body==='child',step=small||body==='older-child'?2:3;
  const armLength=small?3:body==='older-child'?4:5;
  const lengths={upper:armLength,lower:armLength};
  const legs=['left','right'].map(name=>{
    const phase=walking?(frame+(name==='left'?4:0))%8:0;
    const screenLeft=(name==='right')!==(canonical==='up'),out=screenLeft?-1:1;
    const x=center+out*Math.ceil(profile.gap/2);
    const shoulder=[side?center+(name==='right'?1:-1):center+out*(Math.ceil(profile.width/2)+2),profile.torsoTop+2+bob];
    const arm=armChain(shoulder,phase,walking,lengths,side,out);
    if(side){
      const offsets=[2,1,0,-1,-2,-1.8,-.3,1.2];
      const ankle=walking?[center+Math.round(step*offsets[phase]),[52,52,52,51,51,50,50,51][phase]]:[center+(name==='right'?2:1),ankleY];
      const hip=[center,profile.profileHip+bob];
      const knee=walking?forwardKnee(hip,ankle,profile.segment):[Math.round((hip[0]+ankle[0])/2),Math.round((hip[1]+ankle[1])/2)];
      const state=walking?['heel','flat','flat','toe','toe','swing','swing','swing'][phase]:'flat';
      return {name,phase,hip,knee,ankle,support:!walking||phase<4,...arm,foot:profileFoot(ankle,'right',state)};
    }
    // The vertical projection compresses swing depth. Both sides share the same
    // model and phase; screen separation uses symmetric integer hip sockets.
    const hip=[x,profile.hip+bob];
    const depth=walking?[0,0,0,0,0,1,2,1][phase]:0;
    const ankle=[x,ankleY-depth];
    const knee=[x,Math.round((hip[1]+ankle[1])/2)];
    return {name,phase,hip,knee,ankle,support:!walking||phase<4,...arm,foot:{state:!walking?'flat':phase<5?'flat':'swing',contact:!walking||phase<5}};
  });
  const arms=legs.map(({name,shoulder,elbow,wrist,lengths,projection})=>({name,shoulder,elbow,wrist,lengths,projection}));
  if(armCount===4)for(const leg of legs){
    const out=leg.shoulder[0]<center?-1:1;
    const shoulder=[side?center:center+out*Math.ceil(profile.width/2),profile.torsoTop+5+bob];
    // The lower pair carries equipment ahead; both limbs use equal lengths and
    // the same angular construction, offset in time rather than stretched.
    const lowerLengths={upper:small?6:7,lower:small?6:7};
    arms.push({name:leg.name+'_lower',...armChain(shoulder,leg.phase,walking,lowerLengths,side,out,true)});
  }
  if(direction==='left'){
    for(const leg of legs){leg.name=leg.name==='left'?'right':'left';for(const key of ['hip','knee','ankle','shoulder','elbow','wrist'])leg[key]=[40-leg[key][0],leg[key][1]];leg.foot=profileFoot(leg.ankle,'left',leg.foot.state);}
    for(const arm of arms){arm.name=arm.name.replace(/^(left|right)/,n=>n==='left'?'right':'left');for(const key of ['shoulder','elbow','wrist'])arm[key]=[40-arm[key][0],arm[key][1]];}
  }
  if(side)for(const leg of legs)for(const key of ['heel','ball','toe'])leg[key]=[...leg.foot[key]];
  const hipY=(side?profile.profileHip:profile.hip)+bob;
  const torso={midlineX:center,neck:[center,profile.torsoTop+bob],pelvis:[center,hipY],top:profile.torsoTop+bob,waistY:hipY-1,hemY:hipY+1};
  const pelvis={hips:legs.map(l=>[...l.hip]),top:hipY-1,crotchY:hipY+3,seatY:hipY+2,width:profile.width,depth:side?Math.max(8,profile.width-2):profile.width};
  const alignment=side?{preset:'upright',neutral:!walking,
    shoulders:arms.filter(a=>!a.name.endsWith('_lower')).map(a=>{const {hip}=legs.find(l=>l.name===a.name);return {name:a.name,shoulder:[...a.shoulder],hip:[...hip],offsetX:a.shoulder[0]-hip[0]};}),
    feet:legs.map(({name,heel,toe,hip,support})=>({name,heel:[...heel],toe:[...toe],hip:[...hip],offsetX:heel[0]-hip[0],support})),
  }:undefined;
  const vector={right:[1,0],left:[-1,0],down:[0,1],up:[0,-1]}[direction];
  const locomotion={cycleDistance:step*8,frameDistance:step,phaseDistance:frame*step,frameCount:8,direction:vector,contactCalibration:side?'profile':'projected',rootCompensation:side?'subtract-phase-remainder':'none',contacts:legs.map(l=>({name:l.name,state:l.foot.state,support:l.support,contact:l.foot.contact,...(side?{heel:[...l.heel],ball:[...l.ball],toe:[...l.toe],anchor:[...l.foot.anchor]}:{})}))};
  return {direction,frame,bob,legs,arms,torso,pelvis,locomotion,...(alignment?{alignment}:{}),segmentLength:profile.segment,head:{top:profile.headTop+bob,size:profile.headSize},ground:GROUND};
}

export function validatePose(pose,walking){
  const findings=[],side=['right','left'].includes(pose.direction);
  if(!pose.legs.some(l=>l.support&&l.foot.contact))findings.push('no-ground-contact');
  if(side)for(const leg of pose.legs){
    const arm=pose.arms.find(a=>a.name===leg.name),foot=profileFoot(leg.ankle,pose.direction,leg.foot.state);
    if(Math.abs(leg.shoulder[0]-leg.hip[0])>1||Math.abs(arm.shoulder[0]-leg.hip[0])>1)findings.push('shoulder-hip-stack');
    if(Math.abs(pose.torso.midlineX-leg.hip[0])>1)findings.push('torso-hip-stack');
    if(!walking&&(Math.abs(foot.heel[0]-leg.hip[0])>1||foot.heel[1]!==GROUND||!leg.support))findings.push('neutral-heel-stack');
    if(['heel','ball','toe'].some(key=>!leg[key]||leg[key].some((v,i)=>v!==foot[key][i])))findings.push('foot-landmark-mismatch');
    if(foot.contact&&foot.anchor[1]!==GROUND)findings.push('foot-ground-mismatch');
  }
  for(const arm of pose.arms)if(arm.projection==='profile')for(const [a,b,length] of [[arm.shoulder,arm.elbow,arm.lengths.upper],[arm.elbow,arm.wrist,arm.lengths.lower]])if(Math.abs(Math.hypot(a[0]-b[0],a[1]-b[1])-length)>.75)findings.push('arm-length-drift');
  for(const leg of pose.legs){
    if(!side){if(leg.hip[0]!==leg.knee[0]||leg.knee[0]!==leg.ankle[0])findings.push('inward-knee-collapse');}
    else if(walking){
      const [hx,hy]=leg.hip,[kx,ky]=leg.knee,[ax,ay]=leg.ankle,sign=pose.direction==='right'?1:-1;
      if(sign*((ay-hy)*(kx-hx)-(ax-hx)*(ky-hy))<0)findings.push('backward-knee-hinge');
      for(const length of [Math.hypot(kx-hx,ky-hy),Math.hypot(kx-ax,ky-ay)])if(Math.abs(length-pose.segmentLength)>1.1)findings.push('limb-length-drift');
    }
  }
  return findings;
}
