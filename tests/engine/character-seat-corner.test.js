import {test,expect} from 'vitest';
import {generateCharacterRecipe} from '../../server/authoring/character.js';
import {BODY_PROFILES} from '../../server/authoring/humanoid-poses.js';
import {CanvasRenderer} from '../../server/engine/canvas-renderer.js';
import {Cell} from '../../server/engine/cell.js';
import {Palette} from '../../server/engine/palette.js';

test('profile seat bevel removes only the rear corner pixel in both facings',()=>{
 const renderer=new CanvasRenderer(new Palette([]));
 const render=points=>{const c=new Cell({w:40,h:56});c.draw('polygon',{points,filled:true},'#ffffff');return renderer.renderCellRaw(c);};
 for(const body of Object.keys(BODY_PROFILES))for(const mode of ['idle','walk']){
  const built=generateCharacterRecipe({people:[{id:'person',body}],directions:['right','left'],mode});
  for(const frame of built.report.frames){
   const {top,crotchY,seatY,depth,rearFullness}=frame.pelvis,l=20-Math.ceil(depth/2)-rearFullness,r=20+Math.floor(depth/2),mx=x=>frame.direction==='left'?40-x:x;
   const old=[[l+1,top],[r-1,top],[r,seatY],[r-2,crotchY],[20,crotchY-1],[l+2,crotchY],[l,seatY]].map(([x,y])=>({x:mx(x),y}));
   const shape=built.operations.find(o=>o.cell===frame.cell&&o.name==='pelvis_outline');
   const before=render(old),after=render(shape.points),diff=[];
   for(let y=0;y<56;y++)for(let x=0;x<40;x++){const i=(y*40+x)*4+3;if(before[i]!==after[i])diff.push({x,y,alpha:after[i]});}
   expect(diff,frame.alias).toEqual([{x:mx(l),y:seatY,alpha:0}]);
  }
 }
});
