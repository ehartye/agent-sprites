import {test,expect} from 'vitest';
import {generateCharacterRecipe} from '../../server/authoring/character.js';
const person={id:'vey',head:'insectoid',arms:4,body:'rangy',equipment:'survey-rig'};
const recipe=(extra={})=>({people:[person],outfits:['wayfarer','phase-suit'],directions:['down','right','up','left'],mode:'walk',...extra});
test('nonhuman body, four arms, equipment and clothing share the ordinary build contract',()=>{
 const result=generateCharacterRecipe(recipe());expect(result.report.frames).toHaveLength(64);
 for(const frame of result.report.frames){
  expect(frame.headKind).toBe('insectoid');expect(frame.armCount).toBe(4);expect(frame.arms).toHaveLength(4);expect(frame.checks).toEqual([]);
  expect(new Set(frame.arms.map(a=>a.name)).size).toBe(4);
  expect(frame.sealed).toBe(frame.outfit==='phase-suit');
  const shapes=result.operations.filter(o=>o.cell===frame.cell&&o.command==='draw'),names=shapes.map(s=>s.name);
  for(const side of ['left','right'])expect(names).toContain(`${side}_lower_${frame.sealed?'glove':'hand'}`);
  expect(names.some(n=>n.startsWith('equipment_'))).toBe(true);
  expect(names).not.toContain('nose');expect(names.some(n=>n.startsWith('hair_'))).toBe(false);
  if(frame.sealed)expect(names).toContain('helmet_shell');else expect(names).toContain('mantle_left_panel');
 }
});
test('new human options are opt-in and safe combinations remain bounded',()=>{
 const old=generateCharacterRecipe({people:[{id:'a'}]});const explicit=generateCharacterRecipe({people:[{id:'a',head:'human',arms:2,equipment:'none'}]});
 expect(old).toEqual(explicit);
 for(const body of ['adult','adult-sturdy','adult-slim','child','older-child','rangy']){
  const result=generateCharacterRecipe(recipe({people:[{...person,body}],mode:'walk'}));
  for(const f of result.report.frames){expect(f.bounds.left).toBeGreaterThanOrEqual(0);expect(f.bounds.right).toBeLessThan(40);expect(f.bounds.top).toBeGreaterThanOrEqual(0);expect(f.bounds.bottom).toBeLessThan(56);}
 }
});
test.each([{head:'unknown'},{arms:3},{arms:null},{equipment:'unknown'},{head:'insectoid',hair:'bun'}])('invalid anatomy fails instead of being silently ignored: %j',extra=>{
 expect(()=>generateCharacterRecipe({people:[{id:'a',...extra}]})).toThrow();
});
