import {test,expect} from 'vitest';
import {appendNativeDiagonals,diagonalJoints} from '../server/authoring/native/native-diagonal.mjs';
import {sourceMannequin,nativeMannequin} from '../server/authoring/native/native-mannequin.mjs';
import {broadenMannequin} from '../server/authoring/native/large-mannequin.mjs';
import {SKIN_TONES} from '../server/engine/skin-tones.js';
const dirs=['front-right','back-right','back-left','front-left'];
const cardinal=(kind,tone='peach')=>kind==='large'?broadenMannequin(sourceMannequin('adult',tone),tone,{bulk:2}):sourceMannequin(kind,tone);
const pack=ps=>ps.map(p=>[p.x,p.y,p.color]).sort();
test('diagonal idle and four keyed walks append after the exact original twenty cardinal cells',()=>{
 for(const kind of ['adult','child','large']){const before=cardinal(kind),after=appendNativeDiagonals(before,kind,'peach');
  expect(before[0].rows).toBe(4);expect(after[0].rows).toBe(8);expect(after.slice(1,before.length)).toEqual(before.slice(1));
  for(const [i,dir]of dirs.entries())for(let col=0;col<5;col++)expect(after.find(o=>o.command==='name'&&o.cell===`${i+4},${col}`).as).toBe(col?`${dir}_walk_${col-1}`:dir);
  for(const dir of dirs)expect(after.find(o=>o.command==='group'&&o.name===`walk_${dir}`)).toMatchObject({fps:8,cells:[1,2,3,4].map(c=>`${4+dirs.indexOf(dir)},${c}`)});
 }
});
test('all kinds and tones have native grounded editable diagonal anatomy and independent eyes',()=>{
 for(const kind of ['adult','child','large'])for(const tone of SKIN_TONES){const ops=appendNativeDiagonals(cardinal(kind,tone.id),kind,tone.id);
  const diagonalFrames=ops.filter(o=>o.command==='name'&&dirs.some(d=>facing(o.as)===d));expect(diagonalFrames).toHaveLength(20);
  for(const f of diagonalFrames){const ps=ops.filter(o=>o.command==='draw'&&o.cell===f.cell),groups=Object.fromEntries(ops.filter(o=>o.command==='shape-group'&&o.cell===f.cell).map(g=>[g.name,g.shapes]));
   expect(ps.length).toBeGreaterThan(100);expect(ps.every(p=>Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.x<16&&p.y>=0&&p.y<=29)).toBe(true);expect(Math.max(...ps.map(p=>p.y))).toBe(29);
   for(const part of ['head','body','arms'])expect(groups[part].length).toBeGreaterThan(0);
   const skin=new Set(Object.entries(groups).filter(([k])=>k.startsWith('skin-')).flatMap(([,v])=>v));
   for(const n of groups.eyes??[]){expect(groups.head).toContain(n);expect(skin.has(n)).toBe(false);}
   expect((groups.eyes??[]).length>0).toBe(f.as.startsWith('front-'));
   for(const [role,color]of Object.entries(tone.colors))for(const n of groups[`skin-${role}`]??[])expect(ps.find(p=>p.name===n).color).toBe(color);
  }
 }
});
test('published diagonals mirror complete pixel construction and retain outlined skin boundaries',()=>{
 for(const kind of ['adult','child','large']){const ops=nativeMannequin(kind),outline=SKIN_TONES.find(t=>t.id==='peach').colors.outline;
  const pixels=alias=>{const cell=ops.find(o=>o.command==='name'&&o.as===alias).cell;return ops.filter(o=>o.command==='draw'&&o.cell===cell);};
  for(const dir of ['front-right','back-right'])for(const phase of [null,0,1,2,3]){const alias=phase===null?dir:`${dir}_walk_${phase}`,a=pixels(alias),b=pixels(alias.replace('right','left'));
   expect(pack(b)).toEqual(pack(a.map(p=>({...p,x:15-p.x}))));
  }
  for(const f of ops.filter(o=>o.command==='name')){const ps=ops.filter(o=>o.command==='draw'&&o.cell===f.cell),occupied=new Set(ps.map(p=>`${p.x},${p.y}`));
   for(const p of ps.filter(p=>p.color!==outline))expect([[-1,0],[1,0],[0,-1],[0,1]].every(([dx,dy])=>occupied.has(`${p.x+dx},${p.y+dy}`)),`${kind}/${f.as} exposed pixel ${p.x},${p.y}`).toBe(true);
  }
 }
});
test('diagonal torsos retain an interior shadow plane and passing poses show two separate lower legs',()=>{
 for(const kind of ['adult','child','large']){const ops=appendNativeDiagonals(cardinal(kind),kind,'peach'),shadow=SKIN_TONES.find(t=>t.id==='peach').colors.shadow;
  for(const dir of dirs)for(const phase of [null,0,1,2,3]){const alias=phase===null?dir:`${dir}_walk_${phase}`,cell=ops.find(o=>o.command==='name'&&o.as===alias).cell,ps=ops.filter(o=>o.command==='draw'&&o.cell===cell),shoulder=diagonalJoints(kind,dir,phase).right.shoulder[1];
   expect(ps.some(p=>p.y>=shoulder&&p.y<=shoulder+3&&p.color===shadow),`${kind}/${alias} flat torso`).toBe(true);
   if(phase===1||phase===3){const remaining=new Set(ps.filter(p=>p.y>=27).map(p=>`${p.x},${p.y}`));let parts=0;
    while(remaining.size){parts++;const queue=[remaining.values().next().value];remaining.delete(queue[0]);for(const k of queue){const[x,y]=k.split(',').map(Number);for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]){const next=`${x+dx},${y+dy}`;if(remaining.delete(next))queue.push(next);}}}
    expect(parts,`${kind}/${alias} merged shins`).toBe(2);
   }
  }
 }
});
const facing=a=>a.split('_')[0];
test('actual limb pixels contain every reported joint and mirrored views swap anatomy',()=>{
 for(const kind of ['adult','child','large']){const ops=appendNativeDiagonals(cardinal(kind),kind,'peach');
  for(const dir of dirs)for(const phase of [null,0,1,2,3]){const alias=phase===null?dir:`${dir}_walk_${phase}`,cell=ops.find(o=>o.command==='name'&&o.as===alias).cell,ps=ops.filter(o=>o.command==='draw'&&o.cell===cell),j=diagonalJoints(kind,dir,phase);
   for(const side of ['left','right'])for(const point of ['shoulder','wrist','hip'])expect(ps.some(p=>p.x===j[side][point][0]&&p.y===j[side][point][1]),`${kind}/${alias}/${side}/${point}`).toBe(true);
   if(dir.endsWith('right')){const mirrored=diagonalJoints(kind,dir.replace('right','left'),phase);for(const side of ['left','right'])for(const point of ['shoulder','wrist','hip'])expect(mirrored[side][point]).toEqual([15-j[side==='left'?'right':'left'][point][0],j[side==='left'?'right':'left'][point][1]]);}
  }
 }
});
test('diagonal walk has four distinct foot/arm poses and a constant head after bob',()=>{
 for(const kind of ['adult','child','large']){const ops=appendNativeDiagonals(cardinal(kind),kind,'peach');
  for(const dir of dirs){const poses=[0,1,2,3].map(phase=>{const cell=ops.find(o=>o.command==='name'&&o.as===`${dir}_walk_${phase}`).cell,ps=ops.filter(o=>o.command==='draw'&&o.cell===cell);return{phase,ps,head:new Set(ops.find(o=>o.command==='shape-group'&&o.cell===cell&&o.name==='head').shapes)};});
   expect(new Set(poses.map(p=>JSON.stringify(pack(p.ps.filter(q=>q.y>=27))))).size).toBe(4);
   expect(new Set(poses.map(p=>JSON.stringify(pack(p.ps.filter(q=>p.head.has(q.name)).map(q=>({...q,y:q.y-p.phase%2})))))).size).toBe(1);
  }
 }
});
