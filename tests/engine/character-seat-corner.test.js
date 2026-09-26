import {test,expect} from 'vitest';
import {generateCharacterRecipe} from '../../server/authoring/character.js';
import {BODY_PROFILES} from '../../server/authoring/humanoid-poses.js';
import {OUTFIT_NAMES} from '../../server/authoring/character-wardrobe.js';
import {CanvasRenderer} from '../../server/engine/canvas-renderer.js';
import {Cell} from '../../server/engine/cell.js';
import {Palette} from '../../server/engine/palette.js';
const renderer=new CanvasRenderer(new Palette([]));
const render=ops=>{const c=new Cell({w:40,h:56});for(const {type,color,...params} of ops)c.draw(type,params,color);return renderer.renderCellRaw(c);};
const pixel=(data,x,y)=>Array.from(data.slice((y*40+x)*4,(y*40+x)*4+4));
function expectBevel(data,frame){
 const {seatY,depth,rearFullness}=frame.pelvis,l=20-Math.ceil(depth/2)-rearFullness,mx=x=>frame.direction==='left'?40-x:x;
 expect(pixel(data,mx(l),seatY-2)[3],`${frame.alias}: upper square corner`).toBe(0);
 expect(pixel(data,mx(l),seatY)[3],`${frame.alias}: lower square corner`).toBe(0);
 for(const [x,y] of [[l+1,seatY-2],[l,seatY-1],[l+1,seatY]])expect(pixel(data,mx(x),y),`${frame.alias}: fill overwrites seat outline`).toEqual([38,49,69,255]);
}
test('the fully composited rest sprite has a diagonal outlined seat edge in both profiles',()=>{
 for(const body of Object.keys(BODY_PROFILES)){
  const built=generateCharacterRecipe({people:[{id:'person',body}],directions:['right','left'],mode:'idle'});
  for(const frame of built.report.frames)expectBevel(render(built.operations.filter(o=>o.command==='draw'&&o.cell===frame.cell)),frame);
 }
});
test('pelvis fill and shading preserve the bevel through every outfit and walk phase',()=>{
 for(const body of Object.keys(BODY_PROFILES))for(const mode of ['idle','walk']){
  const built=generateCharacterRecipe({people:[{id:'person',body}],outfits:OUTFIT_NAMES,directions:['right','left'],mode});
  for(const frame of built.report.frames)expectBevel(render(built.operations.filter(o=>o.command==='draw'&&o.cell===frame.cell&&/^pelvis/.test(o.name))),frame);
 }
});
