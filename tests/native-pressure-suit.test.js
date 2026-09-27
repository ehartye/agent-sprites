import {test,expect} from 'vitest';
import {cast} from '../examples/native-character/generate-cast.mjs';
import {pressureSuitTemplate} from '../examples/native-character/pressure-suit.mjs';

const visible=(ops,cell)=>new Map(ops.filter(o=>o.command==='draw'&&o.cell===cell).map(o=>[`${o.x},${o.y}`,o]));
for(const style of ['field','service','retro'])for(const character of cast.characters)test(`${character.id} ${style}: sealed four-direction suit follows all twenty poses`,()=>{
  const ops=pressureSuitTemplate(character,style),frames=ops.filter(o=>o.command==='name');
  expect(frames).toHaveLength(20);
  expect(ops.filter(o=>o.command==='group')).toHaveLength(4);
  for(const frame of frames){
    const final=visible(ops,frame.cell),points=[...final.values()];
    expect(points.every(p=>p.x>=0&&p.x<16&&p.y>=0&&p.y<=29)).toBe(true);
    expect(Math.max(...points.map(p=>p.y))).toBe(29);
    const names=new Set(ops.filter(o=>o.command==='draw'&&o.cell===frame.cell).map(o=>o.name));
    for(const group of ops.filter(o=>o.command==='shape-group'&&o.cell===frame.cell))expect(group.shapes.length&&group.shapes.every(n=>names.has(n))).toBeTruthy();
    expect(points.some(p=>p.name.includes('helmet'))).toBe(true);
    const helmet=points.filter(p=>p.name.includes('helmet'));
    const bottom=Math.max(...helmet.map(p=>p.y));
    // A colored seal bridges helmet and torso; two dark rows read as detachment.
    expect([6,7,8,9].some(x=>[bottom,bottom+1].every(y=>final.has(`${x},${y}`)&&final.get(`${x},${y}`).color!=='#26333f')),`${frame.as}: visible collar bridge`).toBe(true);
    if(frame.as.startsWith('right')){
      const glints=helmet.filter(p=>['#82caca','#d6f5e4'].includes(p.color));
      expect(glints.length).toBeGreaterThan(0);
      expect(glints.every(p=>p.x>=8)).toBe(true);
    }
    // Original skin outside the head is now a sealed glove/undersuit material.
    const head=new Set(ops.filter(o=>o.command==='shape-group'&&o.cell===frame.cell&&o.name==='head').flatMap(o=>o.shapes));
    const skin=ops.filter(o=>o.command==='shape-group'&&o.cell===frame.cell&&o.name.startsWith('skin-')).flatMap(o=>o.shapes);
    expect(skin.every(name=>head.has(name))).toBe(true);
    if(frame.as.startsWith('left')){
      const right=frames.find(f=>f.as===frame.as.replace('left','right'));
      const sort=ps=>ps.map(p=>[p.x,p.y,p.color]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
      expect(sort(points)).toEqual(sort([...visible(ops,right.cell).values()].map(p=>({...p,x:15-p.x}))));
    }
  }
});

test('pressure-suit style must be explicit and supported',()=>{
  expect(()=>pressureSuitTemplate(cast.characters[0],'unknown')).toThrow(/suit/i);
});
