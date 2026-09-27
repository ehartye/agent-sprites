import {SKIN_TONES} from '../../server/engine/skin-tones.js';

// Author a broad adult body in native pixels, preserving the head and timing.
// Split expansion adds shoulder/limb mass without enlarging the face or feet height.
export function broadenMannequin(source,tone){
 const ramp=SKIN_TONES.find(t=>t.id===tone).colors;
 const result=source.filter(o=>!['draw','shape-group'].includes(o.command));
 result[0]={...result[0],name:'native-large'};
 for(const {cell,as:alias} of source.filter(o=>o.command==='name')){
  const points=source.filter(o=>o.command==='draw'&&o.cell===cell);
  const groups=Object.fromEntries(source.filter(o=>o.command==='shape-group'&&o.cell===cell).map(o=>[o.name,o.shapes]));
  const head=new Set(groups.head),roleByName=new Map();
  for(const [g,names]of Object.entries(groups))if(g.startsWith('skin-'))for(const n of names)roleByName.set(n,g.slice(5));
  const bob=Math.min(...points.filter(p=>head.has(p.name)).map(p=>p.y))-2;
  const body=new Map();
  for(const p of points.filter(p=>!head.has(p.name))){
   const xs=p.y<14+bob?[p.x]:p.x<7?[p.x-1,...(p.x===6?[6]:[])]:p.x>8?[p.x+1,...(p.x===9?[9]:[])]:[p.x];
   for(const x of xs){
    if(x<0||x>15)throw Error(`Large body clips ${alias} at ${x},${p.y}`);
    body.set(`${x},${p.y}`,{...p,x,name:`large-body-${x}-${p.y}`,role:roleByName.get(p.name)??'base'});
   }
  }
  // Pose-specific arm bands add actual cross-sectional mass, not just spacing.
  const phase=Number(alias.split('_').at(-1))||0;
  const profile=alias.startsWith('right')||alias.startsWith('left');
  const arms=new Set();
  const bands=[];
  const band=(left,right,top,bottom)=>{for(let y=top;y<=bottom;y++)bands.push([left,right,y]);};
  if(!profile){
   band(1,4,15+bob,18+bob);band(11,14,15+bob,18+bob);
   if(phase%2===0){band(0,3,19,22);band(12,15,19,22);}
   else if(phase===1){band(1,4,19,20);band(11,14,19,22);}
   else {band(1,4,19,22);band(11,14,19,20);}
  }else if(phase%2===0){
   band(2,6,15,20);band(11,14,18,20);
  }else if(phase===1){
   band(3,6,16,16);band(4,7,17,17);band(5,9,18,18);
   band(7,11,19,19);band(10,14,20,21);band(0,3,20,21);
  }else{
   band(2,6,16,18);band(1,5,19,20);band(0,4,21,22);
   band(10,14,20,21);
  }
  for(const [left,right,y] of bands)for(let originalX=left;originalX<=right;originalX++){
   const x=alias.startsWith('left')?15-originalX:originalX;
   const name=`large-body-${x}-${y}`;
   const worldLeft=alias.startsWith('left')?15-right:left;
   const role=originalX===left||originalX===right?'outline':x<8?(x===worldLeft+1?'highlight':'base'):(x===worldLeft+1?'base':'shadow');
   body.set(`${x},${y}`,{command:'draw',type:'point',cell,name,x,y,role});arms.add(name);
  }
  const mask=new Set([...body.keys(),...points.filter(p=>head.has(p.name)).map(p=>`${p.x},${p.y}`)]);
  const grouped={head:[],body:[],arms:[...arms],'skin-highlight':[],'skin-base':[],'skin-shadow':[],'skin-outline':[]};
  for(const p of points.filter(p=>head.has(p.name))){result.push(p);grouped.head.push(p.name);const r=roleByName.get(p.name);if(r)grouped[`skin-${r}`].push(p.name);}
  for(const p of body.values()){
   let role=p.role;
   if(alias.startsWith('front')&&p.y===16+bob&&[5,6,9,10].includes(p.x))role='shadow';
   if([[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dy])=>!mask.has(`${p.x+dx},${p.y+dy}`)))role='outline';
   const {role:unused,...draw}=p;
   result.push({...draw,color:ramp[role]});grouped.body.push(p.name);grouped[`skin-${role}`].push(p.name);
  }
  for(const [name,shapes]of Object.entries(grouped))result.push({command:'shape-group',sub:'create',cell,name,shapes});
 }
 return result;
}
