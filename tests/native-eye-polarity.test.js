import {test,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {nativeEyePixels} from '../server/authoring/native/native-eyes.mjs';
import {nativeMannequin} from '../server/authoring/native/native-mannequin.mjs';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const kinds=['adult','child','large'];
test('SE/SW near-eye whites are outward from the iris and nose, far iris remains inward',()=>{
 for(const kind of kinds)for(const dir of ['front-right','front-left']){const pixels=nativeEyePixels(dir,{kind,x:8,y:7}),left=dir.endsWith('left'),nose=left?9:10;
  for(const [whiteRole,irisRole]of [['white-shadow','iris-shadow'],['white-highlight','iris-highlight']]){const white=pixels.find(p=>p.role===whiteRole),iris=pixels.find(p=>p.role===irisRole&&p.x===(left?10:9)),far=pixels.find(p=>p.role===irisRole&&p.x===(left?8:11));
   expect(white).toBeDefined();expect(far).toBeDefined();expect(left?white.x>iris.x:white.x<iris.x,`${kind}/${dir}/${whiteRole} faces nose`).toBe(true);
   expect(Math.abs(white.x-nose)).toBeGreaterThan(Math.abs(iris.x-nose));expect(white.y).toBe(iris.y);
  }
  expect(pixels.filter(p=>p.role==='brow').map(p=>p.x).sort((a,b)=>a-b)).toEqual(left?[8,10,11]:[8,9,11]);
  expect(pixels.filter(p=>p.y===8).map(p=>p.x).sort((a,b)=>a-b)).toEqual(left?[8,10,11]:[8,9,11]);
 }
});
test('all actual front diagonal poses place near whites outside and preserve every other body pixel',()=>{
 const goldens={adult:'71c697c84449506869d3d0a68f7610e406d1ed8fba034b70511eb94cfe88ec81',child:'2bb13d8b5b21829ab1e0b91f91a332c79dcfa832d3da6f21fe986470120621d2',large:'e7b94b6913f887f2d1612f9033a1269062f6ae8b9874e38a77fac13abd3cd1e7'};
 for(const kind of kinds){const ops=nativeMannequin(kind),frames=ops.filter(o=>o.command==='name'),masked=[];
  for(const f of frames){const ps=ops.filter(o=>o.command==='draw'&&o.cell===f.cell),front=/^front-(right|left)(_|$)/.test(f.as),bob=f.as.includes('_walk_')?+f.as.split('_').at(-1)%2:0,top=(kind==='child'?8:2)+bob,left=f.as.startsWith('front-left');
   if(front){const groups=Object.fromEntries(ops.filter(o=>o.command==='shape-group'&&o.cell===f.cell).map(g=>[g.name,g.shapes]));for(const suffix of ['shadow','highlight']){const white=ps.find(p=>groups[`eyes-white-${suffix}`].includes(p.name)),iris=ps.find(p=>groups[`eyes-iris-${suffix}`].includes(p.name)&&p.x===(left?6:9));expect(white.x).toBe(left?7:8);expect(white.y).toBe(iris.y);}}
   masked.push([f.as,ps.filter(p=>!front||!(p.y===top+5&&[9,10].includes(left?15-p.x:p.x)||[top+6,top+7].includes(p.y)&&[8,9,10].includes(left?15-p.x:p.x))).map(p=>[p.x,p.y,p.color]).sort()]);
  }
  expect(hash(masked),kind+' changed unrelated pixels/brows/cardinals/head/body').toBe(goldens[kind]);
 }
});
