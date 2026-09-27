import {test,expect} from 'vitest';
import {dressTemplate} from '../examples/native-character/dress-template.mjs';
import {SKIN_TONES} from '../server/engine/skin-tones.js';

for(const kind of ['adult','child'])for(const style of ['jacket','dress'])test(`${kind} ${style} preserves eyes, bounds and wardrobe across skin ramps`,()=>{
  const baseline=dressTemplate(kind,style);
  const wardrobe=ops=>ops.filter(p=>p.command==='draw'&&/^(front|right|back)-(hair|cloth|trim|trousers|shoes)-/.test(p.name));
  for(const tone of SKIN_TONES){
    const ops=dressTemplate(kind,style,tone.id);
    expect(wardrobe(ops)).toEqual(wardrobe(baseline));
    for(const cell of ['0,0','0,1','0,2']){
      const points=ops.filter(p=>p.command==='draw'&&p.cell===cell);
      const names=new Set(points.map(p=>p.name));
      expect(names.size).toBe(points.length);
      expect(points.every(p=>Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.x<16&&p.y>=0&&p.y<32)).toBe(true);
      expect(Math.max(...points.map(p=>p.y))).toBe(29);
      const skin=new Set(ops.filter(p=>p.command==='shape-group'&&p.cell===cell&&p.name.startsWith('skin-')).flatMap(p=>p.shapes));
      expect(wardrobe(ops).filter(p=>p.cell===cell).every(p=>!skin.has(p.name))).toBe(true);
      const final=new Map(points.map(p=>[`${p.x},${p.y}`,p]));
      // Facial colors are the only source points outside semantic skin roles.
      if(cell!=='0,2')for(const p of points.filter(p=>!skin.has(p.name)&&!wardrobe(ops).includes(p)))expect(final.get(`${p.x},${p.y}`).name).toBe(p.name);
      for(const g of ops.filter(p=>p.command==='shape-group'&&p.cell===cell))expect(g.shapes.every(n=>names.has(n))).toBe(true);
    }
  }
});
