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
  const mask=new Set([...body.keys(),...points.filter(p=>head.has(p.name)).map(p=>`${p.x},${p.y}`)]);
  const grouped={head:[],body:[],'skin-highlight':[],'skin-base':[],'skin-shadow':[],'skin-outline':[]};
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
