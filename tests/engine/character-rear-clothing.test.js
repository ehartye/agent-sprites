import {test,expect} from 'vitest';
import {generateCharacterRecipe} from '../../server/authoring/character.js';
import {BODY_PROFILES} from '../../server/authoring/humanoid-poses.js';
import {OUTFIT_NAMES} from '../../server/authoring/character-wardrobe.js';
import {CanvasRenderer} from '../../server/engine/canvas-renderer.js';
import {Cell} from '../../server/engine/cell.js';
import {Palette} from '../../server/engine/palette.js';

test('rear clothing omits front openings, pockets, buckles and chest controls',()=>{
 for(const body of Object.keys(BODY_PROFILES))for(const mode of ['idle','walk']){
  const built=generateCharacterRecipe({people:[{id:'person',body}],outfits:OUTFIT_NAMES,directions:['up'],mode});
  for(const frame of built.report.frames){
   const names=built.operations.filter(o=>o.cell===frame.cell&&o.command==='draw').map(o=>o.name);
   for(const name of ['shirt','pocket','belt_latch','chest_panel','chest_indicator','pressure_collar'])expect(names,frame.alias).not.toContain(name);
   if(!frame.sealed)expect(names).toContain('back_collar');
   else expect(names).toContain('pack_back_panel');
  }
 }
});
test('the rendered casual jacket back is closed while the front opening stays visible',()=>{
 const renderer=new CanvasRenderer(new Palette([]));
 for(const body of Object.keys(BODY_PROFILES))for(const mode of ['idle','walk']){
  const built=generateCharacterRecipe({people:[{id:'person',body}],directions:['down','up'],mode});
  for(const frame of built.report.frames){
   const c=new Cell({w:40,h:56});for(const {type,color,...p} of built.operations.filter(o=>o.command==='draw'&&o.cell===frame.cell))c.draw(type,p,color);
   const pixels=renderer.renderCellRaw(c),i=((frame.torso.top+4)*40+20)*4;
   expect(Array.from(pixels.slice(i,i+4)),frame.alias).toEqual(frame.direction==='up'?[71,126,133,255]:[225,221,197,255]);
  }
 }
});
