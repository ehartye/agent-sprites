import {test,expect} from 'vitest';
import {generateCharacterRecipe} from '../../server/authoring/character.js';
import {BODY_PROFILES} from '../../server/authoring/humanoid-poses.js';
import {OUTFIT_NAMES} from '../../server/authoring/character-wardrobe.js';
import {CanvasRenderer} from '../../server/engine/canvas-renderer.js';
import {Cell} from '../../server/engine/cell.js';
import {Palette} from '../../server/engine/palette.js';

test('front and rear garment shoulders descend continuously from neck to arm',()=>{
  const renderer=new CanvasRenderer(new Palette([]));
  for(const body of Object.keys(BODY_PROFILES))for(const arms of [2,4])for(const mode of ['idle','walk']){
    const built=generateCharacterRecipe({people:[{id:'person',body,arms}],outfits:OUTFIT_NAMES,directions:['down','up'],mode});
    for(const frame of built.report.frames){
      const cell=new Cell({w:40,h:56});
      for(const op of built.operations.filter(o=>o.cell===frame.cell&&/^(torso|left_sleeve|right_sleeve)$/.test(o.name))){
        const {type,color,...params}=op;cell.draw(type,params,color);
      }
      const pixels=renderer.renderCellRaw(cell);
      const topAt=x=>{for(let y=frame.torso.top;y<frame.torso.top+7;y++)if(pixels[(y*40+x)*4+3])return y;return Infinity;};
      for(const arm of frame.arms.filter(a=>!a.name.endsWith('_lower'))){
        const out=Math.sign(arm.shoulder[0]-20),start=out<0?18:21;
        let previous=topAt(start);
        for(let x=start+out;(x-arm.shoulder[0])*out<=0;x+=out){
          const y=topAt(x);expect(y,`${frame.alias}: notch at x=${x}`).toBeGreaterThanOrEqual(previous);
          expect(y-previous,`${frame.alias}: disconnected shoulder at x=${x}`).toBeLessThanOrEqual(1);previous=y;
        }
      }
    }
  }
});
