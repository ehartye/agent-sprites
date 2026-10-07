import {test,expect} from 'vitest';
import {nativeMannequin,sourceMannequin} from '../examples/native-character/native-mannequin.mjs';
import {parseGear,drawNativeGear} from '../examples/native-character/native-gear.mjs';
import {appendNativeDiagonals,diagonalJoints} from '../server/authoring/native/native-diagonal.mjs';
import {broadenMannequin} from '../server/authoring/native/large-mannequin.mjs';
import {nativeReport} from '../examples/native-character/native-report.mjs';
import {dressTemplate} from '../examples/native-character/dress-template.mjs';
import {castTemplate,cast} from '../examples/native-character/generate-cast.mjs';

const RIGHT=[{item:'trowel',side:'right'}];
// Visible top pixel per position, per cell.
const top=(ops,cell)=>{const m=new Map();for(const o of ops)if(o.command==='draw'&&o.cell===cell)m.set(o.x+','+o.y,o);return m;};
const cellOf=(ops,as)=>ops.find(o=>o.command==='name'&&o.as===as).cell;
function gearPixels(ops,as){return [...top(ops,cellOf(ops,as)).values()].filter(p=>p.name.startsWith('gear_trowel_'));}
const ALIASES=f=>[f,`${f}_walk_0`,`${f}_walk_1`,`${f}_walk_2`,`${f}_walk_3`];

for(const kind of ['adult','child','large'])test(`${kind}: diagonal gear points toward the facing and clips only the far hand behind the body`,()=>{
  const cardinal=kind==='large'?broadenMannequin(sourceMannequin('adult'),'peach',{bulk:2}):sourceMannequin(kind);
  const plain=appendNativeDiagonals(cardinal,kind,'peach');
  for(const facing of ['front-right','back-right','back-left','front-left']){
    const near=facing.endsWith('-right')?'right':'left',far=near==='right'?'left':'right',sign=near==='right'?1:-1;
    const gearList=[{item:'trowel',side:near},{item:'trowel',side:far}];
    const held=drawNativeGear(plain,kind,gearList),report=nativeReport(held,kind,{gear:gearList});
    for(const [index,alias] of ALIASES(facing).entries()){
      const cell=cellOf(plain,alias),body=top(plain,cell),j=diagonalJoints(kind,facing,index===0?null:index-1);
      const gear=held.filter(o=>o.command==='draw'&&o.cell===cell&&o.name.startsWith('gear_trowel_'));
      const nearPixels=gear.filter(p=>p.name.startsWith(`gear_trowel_${near}_`));
      expect(nearPixels.some(p=>p.x===j[near].wrist[0]&&p.y===j[near].wrist[1]),`${kind} ${alias} wrist`).toBe(true);
      expect(nearPixels.some(p=>sign*(p.x-j[near].wrist[0])>0),`${kind} ${alias} blade facing`).toBe(true);
      expect(gear.filter(p=>p.name.startsWith(`gear_trowel_${far}_`)&&body.has(p.x+','+p.y)),`${kind} ${alias} far clipping`).toEqual([]);
      expect(gear.every(p=>p.x>=0&&p.x<16&&p.y>=0&&p.y<32)).toBe(true);
      expect(report.frames.find(f=>f.alias===alias).gear).toEqual([{item:'trowel',side:near,role:'near'},{item:'trowel',side:far,role:'far'}]);
    }
  }
});

for(const kind of ['adult','child'])test(`${kind}: a right-hand trowel follows the body side in every facing`,()=>{
  const plain=nativeMannequin(kind),held=nativeMannequin(kind,'peach',{gear:RIGHT});
  // Near (facing right): clearly visible in every frame.
  for(const as of ALIASES('right'))expect(gearPixels(held,as).length,`${kind} ${as}`).toBeGreaterThanOrEqual(4);
  // Far (facing left): never drawn over the body; it may show where it extends past it.
  for(const as of ALIASES('left')){
    const body=top(plain,cellOf(plain,as));
    expect(gearPixels(held,as).filter(p=>body.has(p.x+','+p.y)),`${kind} ${as} far over body`).toEqual([]);
  }
  // From the front the character's right is the image left; from behind, the image right.
  const meanX=as=>{const px=gearPixels(held,as);return px.reduce((s,p)=>s+p.x,0)/px.length;};
  expect(meanX('front')).toBeLessThan(8);
  expect(meanX('back')).toBeGreaterThan(8);
});

test('gear is validated, grouped and listed in the report with its role',()=>{
  expect(()=>parseGear(['gear=sword:right'])).toThrow(/Unknown gear item: sword/);
  expect(()=>parseGear(['gear=trowel:middle'])).toThrow(/Gear side must be left or right/);
  expect(()=>parseGear(['gear=trowel:right','gear=trowel:right'])).toThrow(/Only one hand item per side/);
  expect(parseGear(['gear=trowel:left'])).toEqual([{item:'trowel',side:'left'}]);
  const ops=nativeMannequin('adult','peach',{gear:RIGHT}),cell=cellOf(ops,'right');
  const group=ops.find(o=>o.command==='shape-group'&&o.cell===cell&&o.name==='gear');
  expect(group.shapes.every(n=>/^gear_trowel_right_\d+$/.test(n))).toBe(true);
  const report=nativeReport(ops,'adult',{gear:RIGHT});
  expect(report.frames.find(f=>f.alias==='right').gear).toEqual([{item:'trowel',side:'right',role:'near'}]);
  expect(report.frames.find(f=>f.alias==='left').gear).toEqual([{item:'trowel',side:'right',role:'far'}]);
});

test('wardrobe and cast sheets carry declared gear through their single corner pass',()=>{
  const dressed=dressTemplate('adult','jacket','peach','short',{gear:RIGHT});
  expect(gearPixels(dressed,'right').length).toBeGreaterThanOrEqual(4);
  // The cast manifest declares gear per character; set it on the loaded entry.
  const profile=cast.characters[0];profile.gear=RIGHT;
  try{expect(gearPixels(castTemplate(profile.id),'right').length).toBeGreaterThanOrEqual(4);}
  finally{delete profile.gear;}
});

test('sheets without gear are unchanged by the gear path',()=>{
  expect(nativeMannequin('adult','peach',{gear:[]})).toEqual(nativeMannequin('adult'));
  expect(dressTemplate('child','dress','peach','tied',{gear:[]})).toEqual(dressTemplate('child','dress'));
});
