export const BODY_PROFILES = Object.freeze({
  adult: {headTop:12,headSize:16,torsoTop:28,hip:38,profileHip:37,width:12,gap:7,stride:8,segment:8.5},
  'adult-sturdy': {headTop:12,headSize:16,torsoTop:28,hip:38,profileHip:37,width:14,gap:8,stride:8,segment:8.5},
  'adult-slim': {headTop:12,headSize:16,torsoTop:28,hip:38,profileHip:37,width:11,gap:7,stride:8,segment:8.5},
  child: {headTop:24,headSize:14,torsoTop:38,hip:45,profileHip:44,width:10,gap:6,stride:4,segment:4.6},
  'older-child': {headTop:18,headSize:15,torsoTop:33,hip:41,profileHip:40,width:11,gap:6,stride:5,segment:6.7},
});
export const GROUND = 54;
const center=20, ankleY=52, bobs=[0,1,0,-1,0,1,0,-1];

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

export function humanoidPose(body,direction='down',frame=0,walking=true){
  const profile=BODY_PROFILES[body], side=['right','left'].includes(direction);
  const bob=walking?(body==='child'?Math.max(0,bobs[frame]):bobs[frame]):0;
  const canonical=direction==='left'?'right':direction;
  const ratio=(ankleY-profile.hip)/14;
  const legs=['left','right'].map(name=>{
    const phase=walking?(frame+(name==='left'?4:0))%8:0;
    const screenLeft=(name==='right')!==(canonical==='up');
    const x=center+(screenLeft?-Math.ceil(profile.gap/2):Math.floor(profile.gap/2));
    if(side){
      const offsets=[1,.625,.125,-.375,-1,-.875,-.25,.625];
      const lift=[0,0,0,0,0,3,5,3];
      const ankle=walking?[center+Math.round(profile.stride*offsets[phase]),ankleY-Math.round(lift[phase]*profile.segment/8.5)]:[center+(name==='right'?2:-2),ankleY];
      const hip=[center,profile.profileHip+bob];
      // Idle uses straight relaxed limbs; walking uses fixed-length articulated links.
      const knee=walking?forwardKnee(hip,ankle,profile.segment):[Math.round((hip[0]+ankle[0])/2),Math.round((hip[1]+ankle[1])/2)];
      const wristX=walking?center-Math.round(profile.stride*offsets[phase]*.75):center+(name==='right'?1:-1);
      const shoulder=[center+(name==='right'?1:-1),profile.torsoTop+2+bob];
      const wrist=[wristX,profile.hip+1+bob];
      return {name,phase,hip,knee,ankle,support:!walking||phase<4,shoulder,elbow:[Math.round((shoulder[0]+wristX)/2),Math.round((shoulder[1]+wrist[1])/2)],wrist};
    }
    const hip=[x,profile.hip+bob];
    const knee=[x,profile.hip+Math.round((ankleY-profile.hip)*.5)+Math.round([0,1,0,-1,-2,-3,-3,-1][phase]*ratio)];
    const ankle=[x,ankleY-(walking?Math.round([0,0,0,0,3,5,4,2][phase]*ratio):0)];
    const handX=center+(screenLeft?-1:1)*(Math.ceil(profile.width/2)+2);
    const wrist=[handX,profile.hip+1+bob+(walking?Math.round([-2,-1,0,2,2,1,0,-1][phase]*ratio):0)];
    return {name,phase,hip,knee,ankle,support:!walking||phase<4,shoulder:[handX,profile.torsoTop+2+bob],elbow:[handX,Math.round((profile.torsoTop+2+bob+wrist[1])/2)],wrist};
  });
  if(direction==='left')for(const leg of legs){leg.name=leg.name==='left'?'right':'left';for(const key of ['hip','knee','ankle','shoulder','elbow','wrist'])leg[key]=[40-leg[key][0],leg[key][1]];}
  return {direction,frame,bob,legs,segmentLength:profile.segment,head:{top:profile.headTop+bob,size:profile.headSize},ground:GROUND};
}

export function validatePose(pose,walking){
  const findings=[];
  if(!pose.legs.some(l=>l.support&&l.ankle[1]===ankleY))findings.push('no-ground-contact');
  for(const leg of pose.legs){
    if(['down','up'].includes(pose.direction)){
      if(leg.hip[0]!==leg.knee[0]||leg.knee[0]!==leg.ankle[0])findings.push('inward-knee-collapse');
    }else if(walking){
      const [hx,hy]=leg.hip,[kx,ky]=leg.knee,[ax,ay]=leg.ankle,sign=pose.direction==='right'?1:-1;
      if(sign*((ay-hy)*(kx-hx)-(ax-hx)*(ky-hy))<0)findings.push('backward-knee-hinge');
      for(const length of [Math.hypot(kx-hx,ky-hy),Math.hypot(kx-ax,ky-ay)])if(Math.abs(length-pose.segmentLength)>1.1)findings.push('limb-length-drift');
    }
  }
  return findings;
}
