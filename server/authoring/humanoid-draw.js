import {BODY_PROFILES} from './humanoid-poses.js';
import {drawHumanoidHead} from './humanoid-face.js';
import {drawInsectoidHead} from './insectoid-face.js';
import {isSealed,drawTravelLayers,drawTorsoDetails} from './character-wardrobe.js';
const drawHead=(p,person,options)=>(person.head==='insectoid'?drawInsectoidHead:drawHumanoidHead)(p,options);

function segment(p,name,a,b,width,color){
  const [x,y]=a,[u,v]=b,length=Math.hypot(u-x,v-y)||1,nx=(v-y)/length*width/2,ny=(x-u)/length*width/2;
  p.poly(name,[[x+nx,y+ny],[u+nx,v+ny],[u-nx,v-ny],[x-nx,y-ny]].map(q=>q.map(Math.round)),color);
}
export function drawHumanoid(p,person,outfit,direction,pose,expression){
  const b=BODY_PROFILES[person.body],c=person.colors,dy=pose.bob,sealed=isSealed(outfit),side=direction==='right',back=direction==='up';
  const bulky=outfit==='service',ribbed=outfit==='retro',bodyColor=sealed?(ribbed?c.jacket:c.suit):c.jacket;
  const light=sealed?(ribbed?c.jacketLight:c.suitLight):c.jacketLight,shade=sealed?(ribbed?c.jacketShade:c.suitShade):c.jacketShade;
  const trouser=sealed?bodyColor:c.pants, trouserShade=sealed?shade:c.pantsShade;
  const limbWidth=b.headSize===14?3:4;
  const near=side?pose.legs.find(l=>l.name==='right'):pose.legs.reduce((a,l)=>a.ankle[1]>l.ankle[1]?a:l);
  const far=pose.legs.find(l=>l!==near);
  const leg=(l,isNear)=>{
    segment(p,`${l.name}_thigh_outline`,l.hip,l.knee,limbWidth+2,c.outline);
    segment(p,`${l.name}_shin_outline`,l.knee,l.ankle,limbWidth+1,c.outline);
    segment(p,`${l.name}_thigh`,l.hip,l.knee,limbWidth,isNear?trouser:trouserShade);
    segment(p,`${l.name}_shin`,l.knee,l.ankle,limbWidth-1,isNear?trouser:trouserShade);
    p.rect(`${l.name}_knee_pad`,l.knee[0]-1,l.knee[1]-1,3,2,sealed?c.accent:(isNear?c.pantsLight:c.pants));
    if(ribbed){p.line(`${l.name}_knee_rib_1`,l.knee[0]-2,l.knee[1]-2,l.knee[0]+2,l.knee[1]-2,c.suit);p.line(`${l.name}_knee_rib_2`,l.knee[0]-2,l.knee[1]+1,l.knee[0]+2,l.knee[1]+1,c.suitShade);}
    const [x,y]=l.ankle;
    if(side){
      p.poly(`${l.name}_boot_outline`,[[x-2,y-3],[x+1,y-3],[x+1,y-1],[x+3,y-1],[x+4,y],[x+4,y+2],[x-2,y+2]],c.outline);
      p.poly(`${l.name}_boot`,[[x-1,y-2],[x,y-2],[x,y],[x+2,y],[x+3,y+1],[x-1,y+1]],isNear?c.boots:c.pantsShade);
      p.line(`${l.name}_boot_toe`,x+1,y,x+3,y+1,isNear?c.metal:c.pantsLight);
    }else{
      const out=l.hip[0]<20?-1:1,local=points=>points.map(([u,v])=>[x+u*out,y+v]);
      p.poly(`${l.name}_boot_outline`,local([[-2,-2],[1,-2],[1,-1],[3,0],[3,2],[-2,2]]),c.outline);
      p.poly(`${l.name}_boot`,local([[-1,-1],[1,-1],[1,0],[2,0],[2,1],[-1,1]]),isNear?c.boots:c.pantsShade);
      p.line(`${l.name}_boot_sole`,x-out,y+1,x+2*out,y+1,c.metal);
    }
    p.rect(`${l.name}_ankle_seal`,x-1,y-3,3,2,sealed?c.accent:c.metal);
  };
  const arm=(l,isNear)=>{
    const armWidth=person.arms===4?3:limbWidth;
    segment(p,`${l.name}_upper_arm_outline`,l.shoulder,l.elbow,armWidth+1,c.outline);
    segment(p,`${l.name}_forearm_outline`,l.elbow,l.wrist,armWidth,c.outline);
    segment(p,`${l.name}_sleeve`,l.shoulder,l.elbow,armWidth-1,isNear?bodyColor:shade);
    segment(p,`${l.name}_forearm`,l.elbow,l.wrist,armWidth-2,isNear?light:bodyColor);
    if(ribbed)p.rect(`${l.name}_elbow_rib`,l.elbow[0]-1,l.elbow[1],3,1,c.suit);
    if(outfit==='wayfarer'){
      p.line(`${l.name}_sleeve_trim`,l.elbow[0],l.elbow[1],l.wrist[0],l.wrist[1]-2,c.jacketLight);
      p.rect(`${l.name}_woven_cuff`,l.wrist[0]-1,l.wrist[1]-2,3,2,c.accent);
    }
    if(sealed)p.rect(`${l.name}_wrist_seal`,l.wrist[0]-1,l.wrist[1]-2,3,2,c.accent);
    if(sealed)p.rect(`${l.name}_glove_outline`,l.wrist[0]-2,l.wrist[1]-2,5,5,c.outline);
    p.rect(`${l.name}_${sealed?'glove':'hand'}`,l.wrist[0]-1,l.wrist[1]-1,3,3,sealed?c.accent:(isNear?c.skin:c.skinShade));
    if(sealed)p.rect(`${l.name}_glove_thumb`,l.wrist[0]+(l.name.startsWith('right')?-2:1),l.wrist[1],1,1,c.metal);
  };
  drawTravelLayers(p,person,outfit,b,pose,direction);
  const lowerArms=pose.arms.filter(a=>a.name.endsWith('_lower'));
  leg(far,false);
  for(const a of lowerArms)if(a.name.startsWith(far.name))arm(a,false);
  arm(far,false);
  if(sealed){
    const packX=side?20-Math.ceil(b.width/2)-5:20-Math.ceil(b.width/2)-2,packW=side?(bulky?6:4):b.width+4;
    p.rect('life_support_pack_outline',packX-1,b.torsoTop+1+dy,packW+2,b.hip-b.torsoTop+1,c.outline);
    p.rect('life_support_pack',packX,b.torsoTop+2+dy,packW,b.hip-b.torsoTop-1,bulky?c.suitShade:c.accent);
    p.rect('pack_status',packX+1,b.torsoTop+3+dy,1,2,c.signal);
  }
  leg(near,true);
  const width=(side?Math.max(8,b.width-2):b.width)+(bulky?2:0),left=20-Math.ceil(width/2),top=b.torsoTop+dy;
  p.poly('torso_outline',[[left+2,top],[left+width-2,top],[left+width+1,top+3],[left+width, b.hip+2+dy],[left,b.hip+2+dy],[left-1,top+3]],c.outline);
  p.rect('torso',left,top+2,width,b.hip-b.torsoTop,bodyColor);
  p.rect('torso_shadow',left+width-3,top+2,3,b.hip-b.torsoTop,shade);
  p.rect('shoulder_yoke',left+1,top+1,width-2,2,light);
  p.rect('belt',left,b.hip+dy,width,2,c.boots);
  p.rect('belt_latch',side?left+width-2:19,b.hip+dy,2,2,c.metal);
  if(sealed){
    p.rect('chest_panel',side?left+width-3:17,top+4,side?2:6,3,c.outline);
    p.rect('chest_indicator',side?left+width-3:18,top+4,1,2,c.signal);
    if(back){p.rect('pack_back_panel',left+1,top+3,width-2,b.hip-b.torsoTop-2,c.suitShade);p.rect('pack_service_latch',19,top+4,2,2,c.accent);}
  }else{
    p.rect('shirt',side?left+width-2:19,top+3,2,Math.max(2,b.hip-b.torsoTop-3),c.suit);
    p.rect('pocket',left+1,top+4,3,2,c.accent);
    p.rect('neck',18,b.headTop+b.headSize-1+dy,4,3,c.skinShade);
    p.rect('pressure_collar',17,top,7,2,c.metal);
  }
  drawTorsoDetails(p,person,outfit,b,pose,direction);
  for(const a of lowerArms)if(a.name.startsWith(near.name))arm(a,true);
  arm(near,true);
  const headTop=pose.head.top,hs=pose.head.size;
  if(sealed){
    if(side){drawProfileHelmet(p,person,outfit,pose,expression);return;}
    const l=20-Math.ceil(hs/2)-4,r=20+Math.floor(hs/2)+3,t=headTop-4,bot=headTop+hs+2;
    const outline=[[l+4,t],[r-4,t],[r,t+4],[r,bot-4],[r-4,bot],[l+4,bot],[l,bot-4],[l,t+4]];
    p.poly('helmet_shell',outline,c.outline);
    p.poly('helmet_rim_base',[[l+4,t+1],[r-4,t+1],[r-1,t+4],[r-1,bot-4],[r-4,bot-1],[l+4,bot-1],[l+1,bot-4],[l+1,t+4]],ribbed?c.jacketLight:c.suit);
    p.poly('visor_well',[[l+4,t+3],[r-4,t+3],[r-3,t+5],[r-3,bot-5],[r-5,bot-3],[l+5,bot-3],[l+3,bot-5],[l+3,t+5]],c.visor);
    if(!back)drawHead(p,person,{cx:20,top:headTop,headSize:hs,direction,hair:person.hair,expression,colors:c,hood:true});
    else {p.rect('helmet_back',l+3,t+4,r-l-5,bot-t-7,bodyColor);p.rect('helmet_back_stripe',19,t+3,2,bot-t-5,c.accent);}
    p.rect('helmet_left_lock',l-1,headTop+Math.floor(hs/2),3,4,c.accent);p.rect('helmet_right_lock',r-1,headTop+Math.floor(hs/2),3,4,c.accent);
    p.rect('neck_seal',16,bot-1,9,3,c.outline);p.rect('neck_seal_latch',18,bot,5,1,c.metal);
    if(!back){p.line('visor_glint',l+5,t+4,l+3,t+7,c.glass);p.rect('visor_glint_point',r-4,t+5,1,2,c.glass);}
  }else drawHead(p,person,{cx:20,top:headTop,headSize:hs,direction,hair:person.hair,expression,colors:c,hood:false});
}

// Side elevation: the opaque shell covers the rear cranium; only the forward
// visor wraps around the face. Left-facing art mirrors this whole construction.
function drawProfileHelmet(p,person,outfit,pose,expression){
  const c=person.colors,{top:headTop,size:hs}=pose.head,ribbed=outfit==='retro';
  const l=20-Math.ceil(hs/2)-4,f=20+Math.floor(hs/2)+5,t=headTop-4,bot=headTop+hs+2;
  const shell=ribbed?c.jacketLight:c.suit,shade=ribbed?c.jacketShade:c.suitShade;
  p.poly('helmet_shell',[[l+4,t],[23,t],[28,t+3],[f,t+8],[f,bot-6],[f-4,bot-1],[22,bot],[l+4,bot-1],[l,bot-6],[l,t+5]],c.outline);
  p.poly('helmet_rim_base',[[l+4,t+1],[23,t+1],[27,t+4],[f-1,t+8],[f-1,bot-6],[f-4,bot-2],[22,bot-1],[l+4,bot-2],[l+1,bot-6],[l+1,t+5]],shell);
  p.poly('visor_well',[[23,t+4],[26,t+5],[f-2,t+9],[f-2,bot-7],[f-5,bot-4],[20,bot-3],[20,t+7]],c.visor);
  drawHead(p,person,{cx:20,top:headTop,headSize:hs,direction:'right',hair:person.hair,expression,colors:c,hood:true});
  p.poly('helmet_side_panel',[[l+4,t+1],[22,t+1],[25,t+4],[22,t+7],[20,t+10],[20,bot-6],[23,bot-2],[l+4,bot-2],[l+1,bot-6],[l+1,t+5]],shell);
  p.poly('helmet_rear_shade',[[l+1,t+7],[l+4,t+5],[l+5,bot-4],[l+4,bot-2],[l+1,bot-6]],shade);
  p.line('helmet_crown_light',l+4,t+2,21,t+2,c.suitLight);
  p.rect('helmet_side_hinge_outline',17,headTop+6,6,6,c.outline);
  p.rect('helmet_side_hinge',18,headTop+7,4,4,c.accent);
  p.rect('helmet_side_hinge_pin',19,headTop+8,2,2,c.metal);
  p.line('helmet_rear_vent',l+3,bot-7,l+6,bot-7,c.outline);
  p.line('visor_glint',f-3,t+9,f-2,t+12,c.glass);
  p.line('visor_lower_rim',f-4,bot-3,25,bot-2,shell);
  p.rect('neck_seal',16,bot-1,11,3,c.outline);
  p.rect('neck_seal_latch',22,bot,4,1,c.metal);
}
