import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {nativeMannequin,sourceMannequin} from '../examples/native-character/native-mannequin.mjs';
import {cutOutlineCorners} from '../server/engine/outline-corners.js';

for(const kind of ['adult','child'])test(`${kind} source stage preserves all source walking pixels and publishes four complete directions`,()=>{
  const source=JSON.parse(readFileSync(new URL(`../server/authoring/native/templates/${kind}.project.json`,import.meta.url)));
  const ops=sourceMannequin(kind),aliases=ops.filter(o=>o.command==='name');
  expect(aliases).toHaveLength(20);
  for(const direction of ['front','right','back','left']){
    const group=ops.find(o=>o.command==='group'&&o.name===`walk_${direction}`);
    expect(group.cells).toHaveLength(4);expect(group.fps).toBe(8);
    for(let frame=0;frame<4;frame++){
      const alias=aliases.find(o=>o.as===`${direction}_walk_${frame}`);expect(alias).toBeDefined();
      const points=ops.filter(o=>o.command==='draw'&&o.cell===alias.cell);
      expect(points.length).toBeGreaterThan(50);
      if(['front','right'].includes(direction)){
        const input=source.cells[`${direction==='front'?0:1},${frame}`].shapes;
        expect(points.map(o=>[o.x,o.y])).toEqual(input.map(s=>[s.params.x,s.params.y]));
      }
      if(direction==='left'){
        const right=aliases.find(o=>o.as===`right_walk_${frame}`);
        expect(points.map(o=>[o.x,o.y,o.color])).toEqual(ops.filter(o=>o.command==='draw'&&o.cell===right.cell).map(o=>[15-o.x,o.y,o.color]));
      }
      if(direction==='back'){
        const front=aliases.find(o=>o.as===`front_walk_${frame}`);
        const sourcePoints=ops.filter(o=>o.command==='draw'&&o.cell===front.cell);
        expect(points.map(o=>[o.x,o.y])).toEqual(sourcePoints.map(o=>[o.x,o.y]));
        const rearHead=new Set(ops.find(o=>o.command==='shape-group'&&o.cell===alias.cell&&o.name==='head').shapes);
        const crown=Math.min(...points.filter(o=>rearHead.has(o.name)).map(o=>o.y));
        expect(crown).toBe((kind==='adult'?2:8)+frame%2);
        const rearSkin=new Set(ops.filter(o=>o.command==='shape-group'&&o.cell===alias.cell&&o.name.startsWith('skin-')).flatMap(o=>o.shapes));
        expect(points.every(o=>rearSkin.has(o.name))).toBe(true);
      }
      expect(Math.max(...points.map(p=>p.y))).toBe(29);
      expect(points.every(p=>p.x>=0&&p.x<16&&p.y>=0&&p.y<32)).toBe(true);
    }
  }
});

for(const kind of ['adult','child'])test(`${kind} publishes its source with outside outline corners cut and no exposed skin`,()=>{
  const outline='#673649',source=sourceMannequin(kind),published=nativeMannequin(kind);
  const {ops:expected,removed}=cutOutlineCorners(source,outline);
  expect(removed.length).toBeGreaterThan(0);
  expect(published).toEqual(expected);
  const byCell=new Map();for(const o of published)if(o.command==='draw'){if(!byCell.has(o.cell))byCell.set(o.cell,new Map());byCell.get(o.cell).set(o.x+','+o.y,o);}
  for(const px of byCell.values())for(const p of px.values())if(p.color!==outline)
    expect([[-1,0],[1,0],[0,-1],[0,1]].every(([dx,dy])=>px.has((p.x+dx)+','+(p.y+dy))),`${kind} skin exposed at ${p.cell} ${p.x},${p.y}`).toBe(true);
});
