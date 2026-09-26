import {test,expect} from 'vitest';
import {generateCharacterRecipe} from '../../server/authoring/character.js';
const recipe=(extra={})=>({name:'cast',people:[{id:'mara',body:'adult-sturdy',hair:'bun',skin:'umber'}],...extra});
test('recipes produce deterministic named editable parts and distinct age profiles',()=>{
  const config=recipe({people:[{id:'adult',body:'adult'},{id:'small',body:'child'},{id:'older',body:'older-child'}]});
  const built=generateCharacterRecipe(config);
  expect(generateCharacterRecipe(config)).toEqual(built);
  expect(built.operations[0]).toMatchObject({command:'new',size:'40x56'});
  expect(built.report.frames.map(f=>f.head.top)).toEqual([12,24,18]);
  for(const frame of built.report.frames){
    const ops=built.operations.filter(o=>o.cell===frame.cell&&o.command==='draw');
    expect(new Set(ops.map(o=>o.name)).size).toBe(ops.length);
    expect(ops.some(o=>o.name.includes('eye_sclera'))).toBe(true);
    expect(built.operations.some(o=>o.command==='shape-group'&&o.cell===frame.cell&&o.name==='face')).toBe(true);
    expect(built.operations.find(o=>o.command==='shape-group'&&o.cell===frame.cell&&o.name==='face').shapes).toEqual(expect.arrayContaining(['face','face_light']));
    expect(built.operations.find(o=>o.command==='shape-group'&&o.cell===frame.cell&&o.name==='face').shapes.some(n=>n.includes('forearm'))).toBe(false);
  }
});
test.each(['adult','adult-sturdy','adult-slim','child','older-child'])('%s walks retain planted support, aligned front knees and forward profile bends',body=>{
  const built=generateCharacterRecipe(recipe({people:[{id:'person',body}],mode:'walk',directions:['down','right','up','left']}));
  expect(built.report.frames).toHaveLength(32);
  for(const frame of built.report.frames){
    const legs=frame.legs;
    expect(legs.some(l=>l.support&&l.ankle[1]===52)).toBe(true);
    for(const leg of legs){
      if(['down','up'].includes(frame.direction))expect(leg.knee[0]).toBe(leg.ankle[0]);
      else{
        const [hx,hy]=leg.hip,[kx,ky]=leg.knee,[ax,ay]=leg.ankle,sign=frame.direction==='right'?1:-1;
        expect(sign*((ay-hy)*(kx-hx)-(ax-hx)*(ky-hy))).toBeGreaterThanOrEqual(-0.001);
        expect(Math.abs(Math.hypot(kx-hx,ky-hy)-frame.segmentLength)).toBeLessThanOrEqual(1.1);
        expect(Math.abs(Math.hypot(kx-ax,ky-ay)-frame.segmentLength)).toBeLessThanOrEqual(1.1);
      }
    }
  }
});
test('sealed variants keep all skin except face covered and expose editable seals and visor parts',()=>{
  for(const outfit of ['field','service','retro']){
    const result=generateCharacterRecipe(recipe({outfits:[outfit],directions:['down','right','up','left']}));
    for(const frame of result.report.frames){
      const names=result.operations.filter(o=>o.cell===frame.cell&&o.command==='draw').map(o=>o.name);
      for(const part of ['helmet_shell','neck_seal','left_glove','right_glove','life_support_pack'])expect(names).toContain(part);
      expect(names).not.toContain('left_hand');expect(names).not.toContain('right_hand');
      expect(frame.sealed).toBe(true);
    }
  }
});
test('all suit and body extrema remain inside cells',()=>{
  for(const body of ['adult-sturdy','adult-slim','child','older-child']){
    const result=generateCharacterRecipe(recipe({people:[{id:'person',body,hair:'puffs'}],outfits:['casual','field','service','retro'],directions:['down','right','up','left']}));
    for(const f of result.report.frames){expect(f.bounds.left).toBeGreaterThanOrEqual(0);expect(f.bounds.top).toBeGreaterThanOrEqual(0);expect(f.bounds.right).toBeLessThan(40);expect(f.bounds.bottom).toBeLessThan(56);}
  }
});
test.each([
  {name:null},{mode:null},{fps:null},{outfits:null},{directions:null},{people:[{id:'a',body:null}]},{people:[{id:'a',hair:null}]},{people:[{id:'a',skin:null}]},
  {people:[]},{people:[{id:'a'},{id:'a'}]},{people:[{id:'../escape'}]},
  {people:[{id:'a',body:'infant'}]},{people:[{id:'a',skin:'unknown'}]},
  {people:[{id:'a',colors:{skin:'red'}}]},{people:[{id:'a',colors:{typo:'#ffffff'}}]},
  {people:[{id:'a',hairstyle:'bun'}]},{mode:'unknown'},{directions:[]},{outfits:['field','field']},
  {mode:'walk',people:[{id:'a'},{id:'b'},{id:'c'},{id:'d'}],directions:['down','right','up','left']},
  {mode:'expressions',directions:['right']},{fps:NaN},{fps:0},{unexpected:1}
])('rejects unsafe or ambiguous recipe %j',extra=>expect(()=>generateCharacterRecipe(recipe(extra))).toThrow());
