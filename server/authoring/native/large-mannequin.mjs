import {SKIN_TONES} from '../../engine/skin-tones.js';

// Author a broad adult body in native pixels, preserving the head and timing.
// Split expansion adds shoulder/limb mass without enlarging the face or feet height.
export function broadenMannequin(source,tone,{bulk=0}={}){
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
   else if(phase===1){band(1,4,20,21);band(11,14,21,24);}
   else {band(1,4,21,24);band(11,14,20,21);}
  }else if(phase%2===0){
   band(2,6,15,20);band(11,14,18,20);
  }else if(phase===1){
   // Even 1-then-2 steps to a hand at the body front; uneven steps read as a zigzag.
   band(3,6,16,16);band(4,7,17,17);band(5,8,18,18);band(7,10,19,19);band(9,13,20,21);band(0,3,20,21);
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
  // Neck, jaw and shoulder bulk. Rows are relative to the head's bob; the face
  // above the jaw row is untouched. Profiles bulk toward the face and the nape.
  const added=new Set();
  if(bulk){
   const headAt=new Set(points.filter(p=>head.has(p.name)).map(p=>p.x+','+p.y));
   const filled=(x,y)=>body.has(x+','+y)||headAt.has(x+','+y);
   const row=y=>{const xs=[];for(let x=0;x<16;x++)if(filled(x,y))xs.push(x);return xs;};
   const add=(x,y)=>{if(x<0||x>15)throw Error('Large bulk clips '+alias+' at '+x+','+y);if(filled(x,y))return;const name='large-body-'+x+'-'+y;body.set(x+','+y,{command:'draw',type:'point',cell,name,x,y,role:'base'});added.add(x+','+y);};
   const forward=alias.startsWith('left')?-1:1;
   // widen(y,side,front): front/back views add `side` pixels to each end of the row;
   // profiles add `side` behind (nape, back) and `front` toward the face.
   const widen=(y,side,front)=>{const xs=row(y);if(!xs.length)return;const lo=Math.min(...xs),hi=Math.max(...xs);
    if(profile){const [b,f2]=forward>0?[lo,hi]:[hi,lo];for(let i=1;i<=side;i++)add(b-forward*i,y);for(let i=1;i<=front;i++)add(f2+forward*i,y);}
    else{for(let i=1;i<=side;i++){add(lo-i,y);add(hi+i,y);}}};
   const jaw=11+bob,neckTop=12+bob,neckLow=13+bob,shoulder=14+bob;
   widen(jaw,1,1);
   widen(neckTop,bulk,0);
   widen(neckLow,bulk,profile?1:0);
   // Square the shoulder line over the arm tops (front/back), deepen it in profile.
   if(profile)widen(shoulder,1,bulk>1?1:0);
   else{const below=row(shoulder+1);if(below.length)for(let x=Math.min(...below);x<=Math.max(...below);x++)add(x,shoulder);}
   // Strength 2 adds a trapezius step from the neck base toward the shoulders.
   if(bulk>1&&!profile)widen(neckLow,1,0);
  }
  const mask=new Set([...body.keys(),...points.filter(p=>head.has(p.name)).map(p=>`${p.x},${p.y}`)]);
  const grouped={head:[],body:[],arms:[...arms],'skin-highlight':[],'skin-base':[],'skin-shadow':[],'skin-outline':[],
    ...Object.fromEntries(Object.entries(groups).filter(([name])=>name==='eyes'||name.startsWith('eyes-')).map(([name,names])=>[name,names.filter(n=>head.has(n))]))};
  // A jaw outline pixel that bulk now encloses becomes under-jaw shading.
  const enclosed=(p,any)=>[[-1,0],[1,0],[0,-1],[0,1]].every(([dx,dy])=>mask.has((p.x+dx)+','+(p.y+dy)))&&(any||[[-1,0],[1,0]].some(([dx])=>added.has((p.x+dx)+','+p.y)));
  const armAt=new Set([...body.values()].filter(q=>arms.has(q.name)).map(q=>q.x+','+q.y));
  const touchesArm=p=>[-1,0,1].some(dx=>[-1,0,1].some(dy=>(dx||dy)&&armAt.has((p.x+dx)+','+(p.y+dy))));
  for(const p0 of points.filter(p=>head.has(p.name))){const p=bulk&&p0.color===ramp.outline&&enclosed(p0)?{...p0,color:ramp.shadow}:p0;if(p!==p0)roleByName.set(p.name,'shadow');result.push(p);grouped.head.push(p.name);const r=roleByName.get(p.name);if(r)grouped[`skin-${r}`].push(p.name);}
  for(const p of body.values()){
   let role=p.role;
   if(bulk&&role==='outline'&&!added.has(p.x+','+p.y)&&enclosed(p))role='shadow';
   // Swinging profile arms: the adult's own diagonal arm outline survives the
   // column split beside the new arm band and reads as stripes across the torso.
   // Enclosed leftovers touching the band become the arm's shadow on the body.
   if(bulk&&profile&&phase%2===1&&role==='outline'&&!arms.has(p.name)&&enclosed(p,true)&&touchesArm(p))role='shadow';
   if(alias.startsWith('front')&&p.y===16+bob&&[5,6,9,10].includes(p.x))role='shadow';
   if([[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dy])=>!mask.has(`${p.x+dx},${p.y+dy}`)))role='outline';
   const {role:unused,...draw}=p;
   result.push({...draw,color:ramp[role]});grouped.body.push(p.name);grouped[`skin-${role}`].push(p.name);
  }
  for(const [name,shapes]of Object.entries(grouped))result.push({command:'shape-group',sub:'create',cell,name,shapes});
 }
 return result;
}
