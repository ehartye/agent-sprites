import {test,expect} from 'vitest';
import {cast,castTemplate} from '../examples/native-character/generate-cast.mjs';
import {costumeTemplate} from '../examples/native-character/costume-template.mjs';
import {dressTemplate} from '../examples/native-character/dress-template.mjs';

const drawings=(ops,cell)=>ops.filter(o=>o.command==='draw'&&o.cell===cell);
const visible=(ops,cell)=>new Map(drawings(ops,cell).map(p=>[`${p.x},${p.y}`,p]));
const pixels=map=>[...map.values()].map(p=>[p.x,p.y,p.color]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);

for(const profile of cast.characters)test(`${profile.id}: complete grounded costume, mirrored profiles and exposed hands`,()=>{
  const ops=castTemplate(profile.id),frames=ops.filter(o=>o.command==='name');
  const base=dressTemplate(profile.kind,profile.outfit,'peach',profile.wig);
  expect(frames).toHaveLength(20);
  expect(ops.filter(o=>o.command==='group')).toEqual(base.filter(o=>o.command==='group'));
  for(const frame of frames){
    const points=drawings(ops,frame.cell),names=new Set(points.map(p=>p.name));
    expect(names.size).toBe(points.length);
    expect(points.every(p=>Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.x<16&&p.y>=0&&p.y<=29)).toBe(true);
    expect(Math.max(...points.map(p=>p.y))).toBe(29);
    for(const group of ops.filter(o=>o.command==='shape-group'&&o.cell===frame.cell))expect(group.shapes.length&&group.shapes.every(n=>names.has(n))).toBeTruthy();
    const assembled=visible(ops,frame.cell);
    const headNames=new Set(base.find(o=>o.command==='shape-group'&&o.cell===frame.cell&&o.name==='head').shapes);
    const headTop=Math.min(...drawings(base,frame.cell).filter(p=>headNames.has(p.name)).map(p=>p.y));
    const shoulder=(profile.kind==='adult'?15:20)+headTop-(profile.kind==='adult'?2:8);
    const skin=new Set(base.filter(o=>o.command==='shape-group'&&o.cell===frame.cell&&o.name.startsWith('skin-')).flatMap(o=>o.shapes));
    for(const [key,p] of visible(base,frame.cell))if(skin.has(p.name)&&!headNames.has(p.name)&&p.y>=shoulder)expect(assembled.get(key)?.name,`${frame.as}: hand ${key}`).toBe(p.name);
    if(frame.as.startsWith('left')){
      const right=frames.find(f=>f.as===frame.as.replace('left','right'));
      const reflected=new Map([...visible(ops,right.cell)].map(([key,p])=>[key,{...p,x:15-p.x}]));
      expect(pixels(assembled)).toEqual(pixels(reflected));
    }
    if(!frame.as.includes('_walk_')){
      const passing=frames.find(f=>f.as===`${frame.as}_walk_0`);
      expect(pixels(assembled)).toEqual(pixels(visible(ops,passing.cell)));
    }
    if(profile.replaceHead)expect(points.filter(p=>headNames.has(p.name))).toHaveLength(0);
  }
  if(profile.bodyMaterial)expect(ops.filter(o=>o.command==='shape-group'&&o.name.startsWith('skin-'))).toHaveLength(0);
});

test('costume head attachments bob with their head in every direction',()=>{
  for(const profile of cast.characters){
    const ops=castTemplate(profile.id),frames=ops.filter(o=>o.command==='name');
    for(const facing of ['front','right','back','left']){
      const idle=frames.find(f=>f.as===facing),stride=frames.find(f=>f.as===`${facing}_walk_1`);
      for(const [index,motif] of profile.motifs.entries())if(motif.anchor==='head'&&!motif.frames){
        const prefix=`costume-${index}-`;
        const from=drawings(ops,idle.cell).filter(p=>p.name.startsWith(prefix)).map(p=>[p.x,p.y+1]);
        const to=drawings(ops,stride.cell).filter(p=>p.name.startsWith(prefix)).map(p=>[p.x,p.y]);
        expect(to).toEqual(from);
      }
    }
  }
});

test('costume configuration rejects invalid landmarks, colors, clipping and layer names',()=>{
  const basic={id:'probe',kind:'adult',motifs:[{name:'mark',anchor:'head',x:7,y:0,rows:['x'],colors:{x:'#abcdef'}}]};
  expect(()=>costumeTemplate({...basic,id:'../invalid'})).toThrow(/id/);
  expect(()=>costumeTemplate({...basic,materials:{cloth:{base:'#ffffff'}}})).toThrow(/four/);
  expect(()=>costumeTemplate({...basic,colors:{o:'transparent'}})).toThrow(/hex/);
  expect(()=>costumeTemplate({...basic,materials:{unknown:{outline:'#000000',shadow:'#111111',base:'#222222',highlight:'#333333'}}})).toThrow(/material/);
  for(const override of [{directions:['left']},{frames:[['x']]},{x:1.2}])expect(()=>costumeTemplate({...basic,motifs:[{...basic.motifs[0],...override}]})).toThrow();
  for(const [override,pattern] of [[{anchor:'toe'},/anchor/],[{x:20},/outside/],[{layer:'mystery'},/layer/],[{colors:{}},/color/]])expect(()=>costumeTemplate({...basic,motifs:[{...basic.motifs[0],...override}]})).toThrow(pattern);
});
