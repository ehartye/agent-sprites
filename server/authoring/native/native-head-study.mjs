import {nativeMannequin} from './native-mannequin.mjs';
import {nativeDiagonalHead} from './native-diagonal-head.mjs';
export {nativeDiagonalHead} from './native-diagonal-head.mjs';

/** Eight head references per body kind, sharing the walking mannequin's construction. */
export function nativeHeadStudy(tone='peach'){
  const ops=[{command:'new',name:'native-eye-construction',size:'16x16',rows:3,cols:8}],dirs=['front','right','back','left','front-right','back-right','back-left','front-left'];
  for(const [row,kind]of ['adult','child','large'].entries()){
    const body=nativeMannequin(kind,tone);
    for(const [col,dir]of dirs.entries()){
      const cell=`${row},${col}`,groups={head:[]};let points;
      if(dir.includes('-'))points=nativeDiagonalHead(kind,dir,tone);
      else{
        const ref=body.find(o=>o.command==='name'&&o.as===dir).cell,groupList=body.filter(o=>o.command==='shape-group'&&o.cell===ref),head=new Set(groupList.find(g=>g.name==='head').shapes);
        const roleByName=new Map(groupList.filter(g=>g.name.startsWith('skin-')||g.name.startsWith('eyes-')).flatMap(g=>g.shapes.map(n=>[n,g.name])));
        points=body.filter(o=>o.command==='draw'&&o.cell===ref&&head.has(o.name)).map(p=>{const role=roleByName.get(p.name),split=role?.indexOf('-');return {...p,material:role?.slice(0,split),role:role?.slice(split+1)};});
      }
      const top=Math.min(...points.map(p=>p.y));ops.push({command:'name',cell,as:`${kind}_${dir.replaceAll('-','_')}`});
      for(const p of points){
        const name=`head_${p.x}_${p.y-top}`;ops.push({command:'draw',type:'point',cell,name,x:p.x,y:p.y-top,color:p.color});groups.head.push(name);
        if(p.material){(groups[`${p.material}-${p.role}`]??=[]).push(name);if(p.material==='eyes')(groups.eyes??=[]).push(name);}
      }
      for(const [name,shapes]of Object.entries(groups))ops.push({command:'shape-group',sub:'create',cell,name,shapes});
    }
  }
  return ops;
}
