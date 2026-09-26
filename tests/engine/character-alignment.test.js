import {test,expect} from 'vitest';
import {generateCharacterRecipe} from '../../server/authoring/character.js';
import {BODY_PROFILES,humanoidPose,validatePose} from '../../server/authoring/humanoid-poses.js';
import {OUTFIT_NAMES} from '../../server/authoring/character-wardrobe.js';
import {createHash} from 'node:crypto';

const shapesFor=(built,frame)=>built.operations.filter(op=>op.command==='draw'&&op.cell===frame.cell);
const bounds=shape=>shape.type==='rect'
  ? {left:shape.x,right:shape.x+shape.w-1,top:shape.y,bottom:shape.y+shape.h-1}
  : {left:Math.min(...shape.points.map(p=>p.x)),right:Math.max(...shape.points.map(p=>p.x)),top:Math.min(...shape.points.map(p=>p.y)),bottom:Math.max(...shape.points.map(p=>p.y))};

test('profile waist meets the actual hip instead of masking the forward thigh root',()=>{
  const built=generateCharacterRecipe({people:[{id:'farmer'}],directions:['right','left'],mode:'walk'});
  for(const frame of built.report.frames){
    const shapes=shapesFor(built,frame),hipY=frame.legs[0].hip[1];
    const hem=bounds(shapes.find(op=>op.name==='torso_outline')).bottom;
    expect(hem-hipY,`${frame.alias}: hidden thigh root`).toBeLessThanOrEqual(1);
    const belt=shapes.find(op=>op.name==='belt');
    expect(belt.y+Math.floor(belt.h/2)).toBe(hipY);
    expect(frame.torso.pelvis).toEqual([20,hipY]);
    expect(frame.torso.hemY).toBe(hem);
  }
});

test('shoulder highlights descend from a narrow neck instead of drawing a horizontal bar',()=>{
  const built=generateCharacterRecipe({people:[{id:'farmer'}],directions:['down','right','up','left']});
  for(const frame of built.report.frames){
    const shapes=shapesFor(built,frame),yoke=shapes.find(op=>op.name==='shoulder_yoke');
    expect(yoke.type).toBe('polygon');
    const top=Math.min(...yoke.points.map(p=>p.y)),topPoints=yoke.points.filter(p=>p.y===top);
    expect(Math.max(...topPoints.map(p=>p.x))-Math.min(...topPoints.map(p=>p.x))).toBeLessThanOrEqual(4);
    expect(bounds(yoke).bottom-top).toBeGreaterThanOrEqual(2);
    const torso=bounds(shapes.find(op=>op.name==='torso'));
    expect(Math.abs((torso.left+torso.right)/2-frame.torso.midlineX)).toBeLessThanOrEqual(.5);
  }
});

test('the established eight-pose profile leg cycle is unchanged',()=>{
  const knees=[[[17,45],[25,44]],[[21,46],[26,44]],[[26,43],[24,44]],[[27,41],[20,44]],[[25,44],[17,45]],[[26,44],[21,46]],[[24,44],[26,43]],[[20,44],[27,41]]];
  for(let frame=0;frame<8;frame++)expect(humanoidPose('adult','right',frame).legs.map(leg=>leg.knee)).toEqual(knees[frame]);
});

test('all supported bodies and outfits retain aligned bounded torsos and articulated limbs',()=>{
  for(const body of Object.keys(BODY_PROFILES))for(const arms of [2,4])for(const outfit of OUTFIT_NAMES){
    const built=generateCharacterRecipe({people:[{id:'person',body,arms}],outfits:[outfit],directions:['down','right','up','left'],mode:'walk'});
    for(const frame of built.report.frames){
      expect(frame.checks).toEqual([]);expect(frame.arms).toHaveLength(arms);
      expect(frame.bounds.left).toBeGreaterThanOrEqual(0);expect(frame.bounds.right).toBeLessThan(40);
      expect(frame.bounds.top).toBeGreaterThanOrEqual(0);expect(frame.bounds.bottom).toBeLessThan(56);
      const shapes=shapesFor(built,frame),torso=bounds(shapes.find(op=>op.name==='torso'));
      expect(Math.abs((torso.left+torso.right)/2-frame.torso.midlineX)).toBeLessThanOrEqual(.5);
      expect(frame.torso.neck[0]).toBe(frame.torso.midlineX);
      expect(frame.torso.pelvis[0]).toBe(20);
      expect(frame.torso.midlineX).toBe(frame.torso.pelvis[0]);
      expect(frame.legs.some(leg=>leg.support&&leg.ankle[1]===52)).toBe(true);
    }
  }
});

test('true profile idle stacks shoulders, pelvis and actual grounded heels within one pixel',()=>{
  for(const body of Object.keys(BODY_PROFILES))for(const arms of [2,4]){
    const built=generateCharacterRecipe({people:[{id:'person',body,arms}],outfits:OUTFIT_NAMES,directions:['right','left'],mode:'idle'});
    for(const frame of built.report.frames){
      expect(frame.torso.midlineX).toBe(20);
      expect(frame.torso.neck[0]).toBe(20);
      expect(frame.alignment).toMatchObject({preset:'upright',neutral:true});
      for(const record of frame.alignment.shoulders)expect(Math.abs(record.offsetX)).toBeLessThanOrEqual(1);
      for(const record of frame.alignment.feet)expect(Math.abs(record.offsetX)).toBeLessThanOrEqual(1);
      const shapes=shapesFor(built,frame);
      for(const leg of frame.legs){
        expect(leg.hip[0]).toBe(20);
        expect(leg.support).toBe(true);
        expect(leg.heel[1]).toBe(frame.ground);
        expect(leg.toe[1]).toBe(frame.ground);
        const boot=shapes.find(op=>op.name===`${leg.name}_boot_outline`);
        for(const point of [leg.heel,leg.toe])expect(boot.points).toContainEqual({x:point[0],y:point[1]});
        expect((leg.toe[0]-leg.heel[0])*(frame.direction==='right'?1:-1)).toBe(6);
      }
    }
  }
});

test('upright validation rejects displaced shoulders and neutral heels without trusting cached measurements',()=>{
  const shiftedShoulder=structuredClone(humanoidPose('adult','right',0,false));
  shiftedShoulder.arms[1].shoulder[0]+=4;
  expect(validatePose(shiftedShoulder,false)).toContain('shoulder-hip-stack');
  const shiftedHeel=structuredClone(humanoidPose('adult','right',0,false));
  shiftedHeel.legs[0].ankle[0]-=4;
  expect(validatePose(shiftedHeel,false)).toContain('neutral-heel-stack');
});

test('walking heels follow the stride rather than the neutral plumb-line constraint',()=>{
  for(const direction of ['right','left'])for(let frame=0;frame<8;frame++){
    const pose=humanoidPose('adult',direction,frame,true);
    expect(pose.alignment.neutral).toBe(false);
    expect(validatePose(pose,true)).toEqual([]);
  }
  expect(humanoidPose('adult','right',0,true).legs.some(leg=>Math.abs(leg.heel[0]-leg.hip[0])>1)).toBe(true);
});

test('front/back art and profile heads, helmets and lower limbs are unchanged from the pre-shift recipe',()=>{
  const built=generateCharacterRecipe({people:[{id:'person'}],outfits:['casual','field','service'],directions:['down','right','up','left'],mode:'walk'});
  const fixed=/^(head|hair|face|nose|mouth|helmet|visor|neck_seal|antenna|mandible|chitin)|^(left|right)_(eye|ear|thigh|shin|knee|boot|ankle)/;
  const ops=built.report.frames.flatMap(frame=>shapesFor(built,frame).filter(op=>['down','up'].includes(frame.direction)||fixed.test(op.name)));
  // Fingerprint captured before the torso translation; changing these layers
  // would violate this adjustment's explicit head/leg/front/back boundary.
  expect(createHash('sha256').update(JSON.stringify(ops)).digest('hex')).toBe('2127766035e0aeb1517f957296630876ae55a29ae5a4f6ce6ac7f6c079018a2d');
});
