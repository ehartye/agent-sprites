import {nativeDiagonalHead} from './native-diagonal-head.mjs';
import {SKIN_TONES} from '../../engine/skin-tones.js';

export const DIAGONAL_DIRECTIONS=['front-right','back-right','back-left','front-left'];
const mirror=([x,y])=>[15-x,y];
const mapSides=(j,f)=>Object.fromEntries(Object.entries(j).map(([side,points])=>[side,Object.fromEntries(Object.entries(points).map(([name,p])=>[name,f(p)]))]));
function pose(kind,phase){
  if(!['adult','child','large'].includes(kind))throw Error('Choose adult, child or large.');
  if(phase!==null&&(!Number.isInteger(phase)||phase<0||phase>3))throw Error('Choose idle or walk phase 0..3.');
  const child=kind==='child',large=kind==='large',bob=phase===null?0:phase%2,shoulder=(child?20:15)+bob,hip=(child?24:21)+bob;
  const wrists=child?[[[3,23],[12,24]],[[6,25],[9,22]],[[12,24],[4,23]],[[9,22],[6,25]]]:[[[3,20],[12,21]],[[6,22],[9,19]],[[12,21],[4,20]],[[9,19],[6,22]]];
  const [nearWrist,farWrist]=phase===null?(child?[[4,24],[11,23]]:[[4,21],[11,20]]):wrists[phase];
  const feet=child?[[[9,29],[5,27]],[[6,29],[10,28]],[[4,27],[10,29]],[[6,28],[10,29]]]:large?[[[10,29],[4,27]],[[5,29],[11,28]],[[3,27],[11,29]],[[5,28],[11,29]]]:[[[9,29],[5,27]],[[6,29],[10,28]],[[5,27],[10,29]],[[6,28],[10,29]]];
  return{bob,shoulder,hip,width:large?4:3,nearFoot:phase===null?[6,29]:feet[phase][0],farFoot:phase===null?[10,28]:feet[phase][1],joints:{right:{shoulder:[large?4:5,shoulder],wrist:nearWrist,hip:[6,hip]},left:{shoulder:[large?11:10,shoulder-1],wrist:farWrist,hip:[9,hip]}}};
}
/** Native cell coordinates, including authored bob. Right diagonal: right side near. */
export function diagonalJoints(kind,facing,phase=null){
  if(!DIAGONAL_DIRECTIONS.includes(facing))throw Error('Choose a native diagonal facing.');
  let j=pose(kind,phase).joints;
  if(facing.startsWith('back'))j=mapSides(j,mirror);
  if(facing.endsWith('left')){j=mapSides(j,mirror);j={left:j.right,right:j.left};}
  return j;
}
function frame(kind,facing,phase,tone,cell){
  const ramp=SKIN_TONES.find(t=>t.id===tone)?.colors;if(!ramp)throw Error('Choose a supported skin tone.');
  const p=pose(kind,phase),pixels=new Map(),armAt=new Set(),rear=facing.startsWith('back'),left=facing.endsWith('left');
  const transform=([x,y])=>{if(rear)x=15-x;if(left)x=15-x;return[x,y];};
  const dot=(x,y,part,shade)=>{const lightX=x;[x,y]=transform([x,y]);if(x<0||x>15||y<0||y>29)throw Error(`Native diagonal clips ${kind}/${facing}/${phase}`);const k=`${x},${y}`;pixels.set(k,{x,y,part,lightX,shade});if(part==='arms')armAt.add(k);};
  const band=(x0,x1,y,part,shade)=>{for(let x=x0;x<=x1;x++)dot(x,y,part,typeof shade==='function'?shade(x):shade);};
  const stroke=(a,b,width,part,side)=>{const n=Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]));for(let i=0;i<=n;i++){const t=n?i/n:0,x=Math.round(a[0]+(b[0]-a[0])*t),y=Math.round(a[1]+(b[1]-a[1])*t),lo=x-Math.floor(width/2),hi=x+Math.ceil(width/2)-1;
    band(lo,hi,y,part,q=>q===lo?'outline':side==='far'?'shadow':q===hi?'shadow':'highlight');}};
  const leg=(hip,foot,side)=>{stroke(hip,[foot[0],foot[1]-1],p.width,'body',side);band(foot[0]-1,foot[0]+1,foot[1],'body',side==='far'?'shadow':'highlight');};
  const arm=(j,side)=>{const elbow=[Math.round((j.shoulder[0]+j.wrist[0])/2),Math.round((j.shoulder[1]+j.wrist[1])/2)];stroke(j.shoulder,elbow,p.width,'arms',side);stroke(elbow,j.wrist,p.width,'arms',side);};
  leg(p.joints.left.hip,p.farFoot,'far');leg(p.joints.right.hip,p.nearFoot,'near');
  arm(p.joints.left,'far');
  const neck=(kind==='child'?19:13)+p.bob;
  for(let y=neck;y<p.shoulder;y++)band(7,9,y,'body');
  for(let y=p.shoulder-1;y<=p.hip+1;y++){const wide=kind==='large'?1:0,taper=y>=p.hip?1:0;
    band(4-wide+taper,10+wide,y,'body',x=>y===p.hip-1&&x>=6&&x<=9?'shadow':x>=8?'shadow':x<=6?'highlight':'base');}
  arm(p.joints.right,'near');
  const head=nativeDiagonalHead(kind,facing,tone,{bob:p.bob}),mask=new Set([...pixels.keys(),...head.map(q=>`${q.x},${q.y}`)]),groups={head:[],body:[],arms:[]};
  const ops=[];
  for(const q of pixels.values()){
    const edge=[[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dy])=>!mask.has(`${q.x+dx},${q.y+dy}`));
    const role=edge?'outline':q.shade??(q.lightX<=5?'highlight':q.lightX>=10?'shadow':'base'),name=`${q.part}_${q.x}_${q.y}`;
    ops.push({command:'draw',type:'point',cell,name,x:q.x,y:q.y,color:ramp[role]});groups[q.part].push(name);(groups[`skin-${role}`]??=[]).push(name);
    if(q.part!=='arms'&&armAt.has(`${q.x},${q.y}`))groups.arms.push(name);
  }
  // Head replaces neck pixels at the same location. Eye points belong only to
  // the head/eye groups; skin recolouring never captures brows or irises.
  const headAt=new Set(head.map(q=>`${q.x},${q.y}`));
  for(let i=ops.length-1;i>=0;i--)if(headAt.has(`${ops[i].x},${ops[i].y}`)){const name=ops[i].name;ops.splice(i,1);for(const names of Object.values(groups)){const at=names.indexOf(name);if(at>=0)names.splice(at,1);}}
  for(const q of head){const name=`head_${q.x}_${q.y}`;ops.push({command:'draw',type:'point',cell,name,x:q.x,y:q.y,color:q.color});groups.head.push(name);(groups[`${q.material}-${q.role}`]??=[]).push(name);if(q.material==='eyes')(groups.eyes??=[]).push(name);}
  for(const[name,shapes]of Object.entries(groups))if(shapes.length)ops.push({command:'shape-group',sub:'create',cell,name,shapes});
  return ops;
}
/** Append four authored three-quarter rows; all original operations retain order/geometry. */
export function appendNativeDiagonals(cardinalOps,kind,tone){
  pose(kind,null);if(!SKIN_TONES.some(t=>t.id===tone))throw Error('Choose a supported skin tone.');
  const ops=[{...cardinalOps[0],rows:8},...cardinalOps.slice(1)];
  for(const[row,facing]of DIAGONAL_DIRECTIONS.entries()){
    for(let col=0;col<5;col++){const cell=`${row+4},${col}`,phase=col===0?null:col-1;ops.push({command:'name',cell,as:phase===null?facing:`${facing}_walk_${phase}`},...frame(kind,facing,phase,tone,cell));}
    ops.push({command:'group',sub:'create',name:`walk_${facing}`,cells:[1,2,3,4].map(col=>`${row+4},${col}`),fps:8});
  }
  return ops;
}
