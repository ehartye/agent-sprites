import {test,expect} from 'vitest';
import {nativeMannequin,sourceMannequin} from '../server/authoring/native/native-mannequin.mjs';
import {SKIN_TONES} from '../server/engine/skin-tones.js';
import {nativeEyePixels} from '../server/authoring/native/native-eyes.mjs';
import {nativeDiagonalHead,nativeHeadStudy} from '../server/authoring/native/native-head-study.mjs';

test('adult, child and large mannequins preserve editable eye roles independently of skin in every pose',()=>{
  for(const kind of ['adult','child','large'])for(const tone of SKIN_TONES){
    const ops=nativeMannequin(kind,tone.id);
    for(const frame of ops.filter(o=>o.command==='name')){
      const groups=Object.fromEntries(ops.filter(o=>o.command==='shape-group'&&o.cell===frame.cell).map(o=>[o.name,o.shapes]));
      if(frame.as.startsWith('back')){expect(groups.eyes??[]).toHaveLength(0);continue;}
      expect((groups.eyes??[]).length,`${kind}/${tone.id}/${frame.as}`).toBeGreaterThan(0);
      const head=new Set(groups.head),skin=new Set(Object.entries(groups).filter(([n])=>n.startsWith('skin-')).flatMap(([,v])=>v));
      const points=ops.filter(o=>o.command==='draw'&&o.cell===frame.cell),byName=new Map(points.map(p=>[p.name,p]));
      for(const name of groups.eyes){expect(head.has(name)).toBe(true);expect(skin.has(name)).toBe(false);expect(byName.has(name)).toBe(true);}
      const roles=kind==='child'?{'eyes-brow':'#010101','eyes-white-shadow':'#b2e5f9','eyes-white-highlight':'#edf4fa','eyes-iris-shadow':'#3d4f78','eyes-iris-highlight':'#8f72c6'}:{'eyes-brow':'#000000','eyes-white-shadow':'#d3c0b8','eyes-white-highlight':'#fffdfc','eyes-iris-shadow':'#682b0f','eyes-iris-highlight':'#813f20'};
      for(const [role,color]of Object.entries(roles)){
        expect((groups[role]??[]).length,`${kind}/${frame.as}/${role}`).toBeGreaterThan(0);
        for(const name of groups[role]){expect(groups.eyes).toContain(name);expect(byName.get(name).color).toBe(color);}
      }
      const ys=groups.eyes.map(n=>byName.get(n).y);expect(Math.max(...ys)-Math.min(...ys)+1).toBe(3);
    }
  }
});

test('reusable native eyes preserve three rows, identity palettes and exact mirrored counterparts',()=>{
  for(const kind of ['adult','child','large'])for(const [right,left]of [['right','left'],['front-right','front-left']]){
    const a=nativeEyePixels(right,{kind,x:4,y:5}),b=nativeEyePixels(left,{kind,x:4,y:5}),width=right==='right'?3:4;
    const pack=p=>p.map(q=>[q.x,q.y,q.color,q.role]).sort();
    expect(pack(b)).toEqual(pack(a.map(p=>({...p,x:8+width-1-p.x}))));
    expect(new Set(a.map(p=>p.y)).size).toBe(3);
    expect(a.filter(p=>p.y===5).every(p=>p.role==='brow')).toBe(true);
    expect(a.filter(p=>p.role==='iris-shadow').every(p=>p.color===(kind==='child'?'#3d4f78':'#682b0f'))).toBe(true);
  }
  expect(nativeEyePixels('back')).toEqual([]);
  expect(()=>nativeEyePixels('north-east')).toThrow();
  expect(()=>nativeEyePixels('front',{x:.5})).toThrow();
});

test('reusable cardinal eye patterns reproduce the established mannequin clusters exactly',()=>{
  const pack=ps=>ps.map(p=>[p.x,p.y,p.color]).sort();
  for(const kind of ['adult','child'])for(const [direction,cell,x,y]of [['front','0,0',4,8],['right','1,0',8,7]]){
    const ops=sourceMannequin(kind),names=new Set(ops.find(o=>o.command==='shape-group'&&o.cell===cell&&o.name==='eyes').shapes);
    const eyes=ops.filter(o=>o.command==='draw'&&o.cell===cell&&names.has(o.name));
    expect(pack(nativeEyePixels(direction,{kind,x,y:y+(kind==='child'?6:0)}))).toEqual(pack(eyes));
  }
});

test('diagonal head references retain native depth, closed interiors and stable eyes through head bob',()=>{
  for(const kind of ['adult','child','large'])for(const tone of SKIN_TONES)for(const bob of [0,1]){
    const a=nativeDiagonalHead(kind,'front-right',tone.id,{bob}),b=nativeDiagonalHead(kind,'front-left',tone.id,{bob}),top=(kind==='child'?8:2)+bob;
    const pack=p=>p.map(q=>[q.x,q.y,q.color,q.material,q.role]).sort();expect(pack(b)).toEqual(pack(a.map(p=>({...p,x:15-p.x}))));
    expect(Math.min(...a.map(p=>p.y))).toBe(top);expect(Math.max(...a.map(p=>p.y))).toBe(top+10);
    expect(Math.max(...a.map(p=>p.x))-Math.min(...a.map(p=>p.x))+1).toBe(10);
    for(let y=top;y<=top+10;y++){const xs=a.filter(p=>p.y===y).map(p=>p.x);expect(xs.length).toBe(Math.max(...xs)-Math.min(...xs)+1);}
    const eyes=a.filter(p=>p.material==='eyes');expect(new Set(eyes.map(p=>p.y))).toEqual(new Set([top+5,top+6,top+7]));
    expect(eyes.filter(p=>p.y===top+5).every(p=>p.role==='brow')).toBe(true);
    const neutral=nativeDiagonalHead(kind,'front-right',tone.id);expect(pack(a.map(p=>({...p,y:p.y-bob})))).toEqual(pack(neutral));
  }
});

test('the head-only study exposes eight facings per kind with editable eye groups',()=>{
  const ops=nativeHeadStudy(),frames=ops.filter(o=>o.command==='name');expect(frames).toHaveLength(24);
  expect(ops[0]).toMatchObject({size:'16x16',rows:3,cols:8});expect(ops.some(o=>o.command==='group')).toBe(false);
  for(const f of frames){
    const points=ops.filter(o=>o.command==='draw'&&o.cell===f.cell);expect(points.length).toBeGreaterThan(60);
    expect(points.every(p=>p.x>=0&&p.x<16&&p.y>=0&&p.y<16)).toBe(true);
    const eyes=ops.find(o=>o.command==='shape-group'&&o.cell===f.cell&&o.name==='eyes');
    expect(Boolean(eyes)).toBe(!f.as.includes('_back'));
  }
});
