const mix=(a,b,t)=>a+(b-a)*t;
const ease=t=>t*t*(3-2*t);
const ballStart={x:112,y:88,spin:0};
const base={x:36,y:78,form:'curl',face:1,angle:0,eye:'sleep',tail:0,headLift:0,breath:0,ball:ballStart};
export const storyBeats=[
  {title:'A soft start',frame:2,description:'Marmalade sleeps curled into the sage cushion.'},
  {title:'Out of bed',frame:17,description:'A sleepy somersault lands on the rug.'},
  {title:'Just one little tap',frame:34,description:'The cream paw meets the yarn before it rolls away.'},
  {title:'Got you',frame:45,description:'A pounce becomes a playful flop with the yarn between the paws.'},
  {title:'Back to the warm spot',frame:76,description:'The yarn rests where it began and Marmalade curls into bed.'}
];
export const timeline=Array.from({length:80},(_,frame)=>{
  let p={...base,frame,ball:{...ballStart},beat:'sleep'};
  if(frame<8){p.breath=[0,0,.3,.5,.5,.3,0,0][frame];}
  else if(frame<12){const t=(frame-8)/3;p={...p,beat:'wake',eye:frame===8?'sleep':frame===9?'blink':'open',headLift:t*3,tail:t*.4};}
  else if(frame<22){
    const i=frame-12;
    p={...p,beat:'roll-out',form:'tuck',eye:'open',x:[42,46,50,54,58,62,66,69,72,73][i],y:[78,78,79,81,84,86,88,88,88,88][i],angle:[0,28,65,107,151,198,244,290,333,360][i],tail:Math.sin(i*.8)};
  }else if(frame<28){
    const i=frame-22;
    p={...p,beat:'stretch',form:'stretch',x:73,y:88,eye:i<2?'blink':'open',stretch:[.3,.7,1,1,.7,.3][i],tail:.5};
  }else if(frame<34){
    const i=frame-28;
    p={...p,beat:'stalk',form:'low',eye:'open',x:[74,76,78,80,83,85][i],y:88,tail:.2,pawReach:[10,11,12,14,17,20][i],gait:i};
  }else if(frame<40){
    const i=frame-34;
    p={...p,beat:'first-bat',form:'low',eye:'open',x:[85,86,88,90,92,94][i],y:88,tail:.3,pawReach:[23,18,12,10,10,10][i],gait:i,ball:{x:[115,121,127,131,134,136][i],y:88,spin:i+1}};
  }else if(frame<44){
    const i=frame-40;
    p={...p,beat:'pounce',form:i===0?'low':'pounce',eye:'open',x:[95,102,110,118][i],y:[88,81,78,87][i],tail:[.5,-.5,-1,1][i],pawReach:[10,24,25,20][i],ball:{x:[136,136,136,139][i],y:[88,88,88,86][i],spin:[7,7,7,10][i]}};
  }else if(frame<50){
    const i=frame-44;
    const ball=[{x:136,y:85},{x:132,y:80},{x:126,y:76},{x:124,y:80},{x:126,y:85},{x:128,y:88}][i];
    p={...p,beat:'play-flop',form:'tuck',eye:i===2?'happy':'open',x:[123,126,128,130,132,134][i],y:[89,90,90,90,89,88][i],angle:[35,78,125,165,205,270][i],tail:-Math.sin(i),grab:true,ball:{...ball,spin:11+i}};
  }else if(frame<56){
    const i=frame-50;
    p={...p,beat:'bat-back',form:'low',face:-1,eye:'open',x:[135,134,133,132,131,130][i],y:88,tail:.7,pawReach:[7,12,17,18,13,10][i],ball:{x:[128,125,121,117,114,112][i],y:88,spin:[16,15.75,15.5,15.25,15.05,Math.PI*2/.42][i]}};
  }else if(frame<70){
    const i=frame-56,t=i/13;
    p={...p,beat:'homeward',form:'walk',face:-1,eye:'open',x:mix(129,51,t),y:mix(88,80,ease(t)),tail:.9,gait:i,ball:{...ballStart}};
  }else if(frame<74){
    const i=frame-70;
    p={...p,beat:'curl-in',form:i<2?'tuck':'curl',face:i===0?-1:1,eye:i<2?'blink':'sleep',x:[47,42,38,36][i],y:[79,77,78,78][i],angle:[-20,-55,-15,0][i],tail:.3};
  }else{p.beat='sleep';p.breath=[0,.2,.4,.2,0,0][frame-74];}
  return {...p,x:Math.round(p.x),y:Math.round(p.y),durationMs:100};
});
