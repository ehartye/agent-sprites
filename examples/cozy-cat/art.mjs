import {readFileSync} from 'node:fs';
import {contourShapes} from './contour.mjs';
export const C=JSON.parse(readFileSync(new URL('./palette.json',import.meta.url),'utf8'));
const unlit={normal:{mode:'flat'},material:{unlit:true}};
const flat={normal:{mode:'flat'}};
const fur={normal:{mode:'dome',depth:1.6},material:{solid:true}};
const soft={normal:{mode:'dome',depth:1.1}};
const bevel={normal:{mode:'bevel',width:1,depth:.8},material:{solid:true}};
const shape=(name,type,color,params,surface=flat)=>({name,type,color:C[color]??color,params:{...params,surface}});
const poly=(name,color,points,surface)=>shape(name,'polygon',color,{points:points.map(([x,y])=>({x:Math.round(x),y:Math.round(y)})),filled:true},surface);
const rect=(name,color,x,y,w,h,surface)=>shape(name,'rect',color,{x,y,w,h,filled:true},surface);
const ellipse=(name,color,cx,cy,rx,ry,surface)=>shape(name,'ellipse',color,{cx,cy,rx,ry,filled:true},surface);
const line=(name,color,points,surface)=>shape(name,'polyline',color,{points:points.map(([x,y])=>({x:Math.round(x),y:Math.round(y)}))},surface);
const oval=(cx,cy,rx,ry,n=16)=>Array.from({length:n},(_,i)=>[cx+Math.cos(i*Math.PI*2/n)*rx,cy+Math.sin(i*Math.PI*2/n)*ry]);
const ribbon=(points,width)=>{
  const edge=points.map(([x,y],i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],d=Math.hypot(b[0]-a[0],b[1]-a[1])||1;return[-(b[1]-a[1])*width/(2*d),(b[0]-a[0])*width/(2*d)];});
  return points.map(([x,y],i)=>[x+edge[i][0],y+edge[i][1]]).concat(points.map(([x,y],i)=>[x-edge[i][0],y-edge[i][1]]).reverse());
};

function room(){
  return [
    rect('wall','wall',0,0,160,67,unlit),rect('floor','floor',0,67,160,45,unlit),
    rect('wall-bottom-shadow','wallShade',0,60,160,7,unlit),rect('skirting','woodLight',0,64,160,4,bevel),rect('skirting-shadow','floorLine',0,68,160,2,unlit),
    rect('floor-board-1','floorLine',0,85,160,1,unlit),rect('floor-board-2','floorLine',0,104,160,1,unlit),
    rect('floor-joint-1','floorLine',25,70,1,15,unlit),rect('floor-joint-2','floorLine',137,70,1,15,unlit),rect('floor-joint-3','floorLine',86,105,1,7,unlit),
    rect('window-shadow','wallShade',87,12,46,43,unlit),rect('window-frame-outer','woodDark',84,10,46,43,bevel),rect('window-frame','woodLight',85,11,44,41,bevel),
    rect('window-sky','sky',89,15,36,33,unlit),poly('window-cloud','skyLight',[[89,22],[97,20],[106,21],[113,18],[125,19],[125,25],[89,27]],unlit),
    rect('window-vertical','woodLight',106,15,3,34,bevel),rect('window-horizontal','woodLight',89,30,36,3,bevel),
    rect('window-sill-shadow','wood',82,52,50,3,bevel),rect('window-sill','creamShade',81,49,51,3,bevel),
    rect('window-key','cream',91,16,2,11,{...unlit,lamps:[{name:'morning-window',x:99,y:35,radius:140,power:.28,z:28,color:'#ffdb9a'}]}),
    poly('sunlit-floor','woodLight',[[101,70],[125,70],[155,103],[125,103]],unlit),
    rect('picture-frame','wood',17,18,23,23,bevel),rect('picture-paper','cream',19,20,19,19,unlit),
    poly('picture-leaf-1','sage',[[28,34],[24,30],[25,24],[29,28]],unlit),poly('picture-leaf-2','sageDark',[[28,35],[30,27],[34,25],[34,30]],unlit),line('picture-stem','wood',[[28,35],[29,25]],unlit),
    ellipse('pot-shadow','floorLine',144,64,10,2,unlit),poly('flower-pot','pot',[[137,52],[151,52],[149,64],[139,64]],bevel),rect('pot-lip','wood',136,51,16,3,bevel),
    line('plant-stem','plantDark',[[144,52],[143,35]],unlit),poly('plant-left-leaf','plant',[[143,45],[136,42],[133,34],[139,35],[144,42]],soft),
    poly('plant-right-leaf','plantDark',[[144,48],[149,40],[155,38],[155,44],[149,49]],soft),poly('plant-top-leaf','plant',[[143,41],[140,33],[143,27],[147,32],[146,38]],soft)
  ];
}
function rug(){
  const shapes=[ellipse('rug-shadow','floorLine',84,92,69,18,unlit),ellipse('rug-edge','rugEdge',84,90,68,17,unlit),ellipse('rug-main','rug',84,89,66,15,unlit),ellipse('rug-center','wallShade',84,89,58,11,unlit)];
  for(let i=0;i<9;i++)shapes.push(line(`fringe-${i+1}`,'rugEdge',[[25+i*15,100+(i%2)],[23+i*15,104+(i%2)]],unlit));
  return shapes;
}
function basket(){
  const back=[ellipse('basket-shadow','shadow',36,88,26,5,unlit),ellipse('back-shell','woodDark',36,75,26,14,bevel),ellipse('back-wicker','wood',36,74,25,12,bevel),ellipse('cushion-dark','sageDark',36,74,23,10,soft),ellipse('cushion-top','sage',36,72,21,8,soft),ellipse('cushion-light','sageLight',32,70,16,5,soft),line('cushion-seam','sageDark',[[18,74],[23,77],[35,79],[48,77],[53,73]],flat)];
  const front=[poly('basket-front-edge','woodDark',[[11,74],[18,78],[35,81],[52,78],[61,73],[58,84],[51,88],[21,89],[14,85]],bevel),poly('basket-front-weave','wood',[[13,77],[21,81],[35,83],[50,81],[58,77],[56,83],[49,86],[23,87],[16,84]],bevel),line('rim-light','woodLight',[[12,74],[20,78],[35,81],[51,78],[60,74]],flat),line('weave-row','woodLight',[[16,82],[25,85],[37,86],[50,84],[56,81]],flat)];
  for(let i=0;i<7;i++)front.push(poly(`woven-band-${i+1}`,'woodLight',[[18+i*6,80+(i<2||i>5?0:2)],[20+i*6,81+(i<2||i>5?0:2)],[19+i*6,86],[17+i*6,85]],bevel));
  return {back,front};
}

export function catParts(p){
  const parts={},placements=[];
  const add=(name,shapes)=>{parts[name]={shapes};placements.push({kind:'stamp',part:name,name,x:0,y:0});};
  const angle=p.angle*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  const tr=([x,y])=>{x*=p.face;const dy=y+11;return[Math.round(p.x+x*cos-dy*sin),Math.round(p.y-11+x*sin+dy*cos)];};
  const P=points=>points.map(tr);
  const q=(name,color,points,surface)=>poly(name,color,P(points),surface);
  const o=(name,color,cx,cy,rx,ry,surface)=>q(name,color,oval(cx,cy,rx,ry),surface);
  const tuck=p.form==='tuck',curl=p.form==='curl',stretch=p.form==='stretch',low=p.form==='low',pounce=p.form==='pounce';
  const bob=p.form==='walk'?[0,-1,0,0][p.gait%4]:0;
  const bellyY=(low?-9:stretch?-11:-13)+bob-(p.breath??0);
  const bodyRx=stretch?13+(p.stretch??0)*3:tuck?11:curl?13:13;
  const bodyRy=tuck?9:curl?9:stretch?6:low?7:8;
  const headX=curl?9:tuck?8:stretch?16:13;
  const headY=curl?-11-(p.headLift??0):tuck?-13:stretch?-10+(p.stretch??0)*2:low?-16:pounce?-18:-22+bob;
  let tailPoints;
  if(curl)tailPoints=[[-10,-13],[-15,-10],[-14,-4],[-7,-1],[2,-2],[7,-5]];
  else if(tuck)tailPoints=[[-10,-12],[-15,-15],[-16,-23],[-12,-28],[-7,-26+(p.tail??0)*2]];
  else if(p.face<0)tailPoints=[[-11,-12],[-18,-16],[-19,-24],[-16,-30],[-11,-29+(p.tail??0)*2]];
  else tailPoints=[[-11,-11],[-21,-12-(p.tail??0)*3],[-26,-18-(p.tail??0)*3],[-25,-26],[-20,-29]];
  const tail=[q('tail-fur','fur',ribbon(tailPoints,4),fur),q('tail-light','furLight',ribbon(tailPoints.map(([x,y])=>[x-.4,y-.8]),1.5),soft),q('tail-tip-band','stripe',ribbon(tailPoints.slice(-2),3),flat)];
  if(!curl)add('tail',tail);
  const limb=(name,root,end,near)=>{
    const dx=end[0]-root[0],dy=end[1]-root[1],d=Math.hypot(dx,dy)||1,nx=-dy/d*2,ny=dx/d*2;
    add(name,[q('leg',near?'fur':'furShadow',[[root[0]+nx,root[1]+ny],[root[0]-nx,root[1]-ny],[end[0]-2,end[1]],[end[0]+2,end[1]]],fur),o('cream-paw','cream',end[0]+1,end[1]-.5,3,2,soft)]);
  };
  const gait=p.form==='walk'||p.form==='low'?(p.gait??0):0;
  const walk=p.form==='walk';
  const stride=walk?[-4,0,4,0][gait%4]:0;
  const lift=walk?[0,3,0,0][gait%4]:0;
  let nearFore=[p.pawReach??10,0],farFore=[9,0],nearHind=[-10,0],farHind=[-8,0];
  if(curl){nearFore=[7,-4];farFore=[3,-5];nearHind=[-8,-5];farHind=[-6,-5];}
  else if(tuck){nearFore=[6,-5];farFore=[9,-7];nearHind=[-4,-4];farHind=[-7,-6];}
  else if(stretch){nearFore=[22,0];farFore=[18,-1];nearHind=[-13,0];farHind=[-10,-1];}
  else if(pounce){nearFore=[p.pawReach??23,-2];farFore=[20,-5];nearHind=[-17,-2];farHind=[-15,-5];}
  else if(walk){nearFore=[10-stride,-lift];farFore=[9+stride,-(gait%4===3?3:0)];nearHind=[-10+stride,-(gait%4===3?3:0)];farHind=[-8-stride,-lift];}
  if(p.grab){
    const dx=p.ball.x-p.x,dy=p.ball.y-(p.y-11);
    const lx=(dx*cos+dy*sin)*p.face,ly=-dx*sin+dy*cos-11;
    nearFore=[lx-2,ly+3];farFore=[lx+2,ly-3];
  }
  limb('far-hind',[-8,bellyY+3],farHind,false);limb('far-fore',[7,bellyY+3],farFore,false);
  add('body',[
    o('main-fur','fur',0,bellyY,bodyRx,bodyRy,fur),
    q('warm-back','furLight',[[ -11,bellyY-3],[-8,bellyY-bodyRy+1],[1,bellyY-bodyRy],[9,bellyY-4],[5,bellyY-1],[-6,bellyY]],fur),
    q('belly-shade','furShadow',[[-11,bellyY+3],[-4,bellyY+5],[6,bellyY+3],[12,bellyY],[10,bellyY+6],[1,bellyY+bodyRy],[-8,bellyY+6]],soft),
    q('cream-bib','creamShade',[[7,bellyY-2],[11,bellyY-3],[13,bellyY+1],[9,bellyY+5],[6,bellyY+4]],soft),
    ...[-7,-1,5].map((x,i)=>q(`tabby-stripe-${i+1}`,'stripe',[[x-2,bellyY-bodyRy+1],[x+1,bellyY-bodyRy+1],[x+2,bellyY-2],[x,bellyY]],flat))
  ]);
  limb('near-hind',[-9,bellyY+3],nearHind,true);limb('near-fore',[8,bellyY+3],nearFore,true);
  const face=[
    q('ear-far','furShadow',[[headX-7,headY-3],[headX-7,headY-12],[headX-1,headY-7]],fur),
    o('cheeks','fur',headX,headY,8,7,fur),
    q('ear-near','fur',[[headX+1,headY-5],[headX+5,headY-13],[headX+8,headY-3]],fur),
    q('ear-pink','pink',[[headX+3,headY-6],[headX+5,headY-10],[headX+6,headY-5]],soft),
    q('far-ear-pink','pink',[[headX-6,headY-5],[headX-6,headY-9],[headX-3,headY-6]],soft),
    q('forehead-light','furLight',[[headX-6,headY-4],[headX-2,headY-7],[headX+3,headY-5],[headX+4,headY-1],[headX-1,headY]],fur),
    q('forehead-mark-1','stripe',[[headX-3,headY-6],[headX-1,headY-6],[headX,headY-2],[headX-2,headY-3]],flat),
    q('forehead-mark-2','stripe',[[headX+1,headY-6],[headX+3,headY-5],[headX+3,headY-2],[headX+1,headY-3]],flat),
    o('muzzle','cream',headX+3,headY+3,5,3,soft)
  ];
  const closed=p.eye==='sleep'||p.eye==='blink',happy=p.eye==='happy';
  for(const [i,ex] of [-2,4].entries()){
    if(closed)face.push(q(`eye-${i+1}`,'ink',[[headX+ex-1,headY],[headX+ex,headY+1],[headX+ex+2,headY]],unlit));
    else if(happy)face.push(q(`eye-${i+1}`,'ink',[[headX+ex-1,headY],[headX+ex,headY-1],[headX+ex+1,headY-1],[headX+ex+2,headY]],unlit));
    else face.push(q(`eye-${i+1}`,'eye',[[headX+ex-1,headY-2],[headX+ex+1,headY-2],[headX+ex+2,headY-1],[headX+ex+1,headY+1],[headX+ex-1,headY+1]],unlit),q(`eye-light-${i+1}`,'cream',[[headX+ex,headY-2],[headX+ex+1,headY-2],[headX+ex,headY-1]],unlit));
  }
  face.push(q('nose','pink',[[headX+3,headY+2],[headX+6,headY+2],[headX+4,headY+4]],soft),q('mouth','ink',[[headX+4,headY+4],[headX+3,headY+5],[headX+1,headY+5],[headX+3,headY+4]],unlit));
  face.push(q('whisker-upper','ink',[[headX+6,headY+3],[headX+11,headY+1],[headX+10,headY+2]],unlit),q('whisker-lower','ink',[[headX+6,headY+4],[headX+11,headY+5],[headX+8,headY+5]],unlit));
  add('head',face);
  if(curl)add('tail',tail);
  add('outer-contour',contourShapes(parts,placements,C.ink));
  return {parts,placements,tr,paws:{nearFore:tr(nearFore),farFore:tr(farFore),nearHind:tr(nearHind),farHind:tr(farHind)}};
}

function yarn(p){
  const {x,y,spin}=p.ball,angle=spin*.42,co=Math.cos(angle),si=Math.sin(angle);
  const spinP=points=>points.map(([px,py])=>[x+px*co-py*si,y+px*si+py*co]);
  return [
    line('loose-thread','yarnShade',[[x+3,y+4],[x+7,94],[121,96],[126,94],[130,96],[134,95]],flat),
    shape('ball','circle','yarn',{cx:x,cy:y,r:5,filled:true},{normal:{mode:'dome',depth:2},material:{solid:true}}),
    ellipse('ball-light','yarnLight',x-1,y-1,2,3,soft),
    line('winding-one','yarnShade',spinP([[-3,-2],[-1,-3],[2,-2],[3,0],[2,3]]),flat),
    line('winding-two','yarnLight',spinP([[-4,0],[-1,-1],[2,0],[3,2]]),flat),
    line('winding-three','yarnShade',spinP([[-3,2],[0,3],[3,1]]),flat),
    shape('ball-outline','circle','yarnDark',{cx:x,cy:y,r:5,filled:false},unlit)
  ];
}
export function scene(p){
  const parts={},placements=[];
  const add=(name,shapes)=>{parts[name]={shapes};placements.push({kind:'stamp',part:name,name,x:0,y:0});};
  add('room',room());add('rug',rug());
  const bed=basket();add('basket-back',bed.back);
  add('contact-shadows',[ellipse('cat-shadow','shadow',p.x,Math.max(88,p.y),p.form==='tuck'?12:17,p.form==='pounce'?2:3,unlit),ellipse('ball-shadow','shadow',p.ball.x,94,6,2,unlit)]);
  const cat=catParts(p);
  for(const placement of cat.placements){const name=`cat-${placement.name}`;parts[name]=cat.parts[placement.part];placements.push({...placement,part:name,name});}
  add('basket-front',bed.front);add('yarn',yarn(p));
  return {parts,placements};
}
