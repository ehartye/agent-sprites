import {BODY_PROFILES,humanoidPose,validatePose} from './humanoid-poses.js';
import {drawHumanoid} from './humanoid-draw.js';
import {OUTFIT_NAMES,isSealed} from './character-wardrobe.js';
import {EXPRESSION_NAMES} from './humanoid-face.js';

const BASE={outline:'#263145',skin:'#d99c76',skinLight:'#edba91',skinShade:'#a96851',hair:'#493644',hairLight:'#795263',iris:'#527b82',jacket:'#477e85',jacketLight:'#84b7bd',jacketShade:'#355963',pants:'#506080',pantsLight:'#7d8aa4',pantsShade:'#354253',suit:'#e1ddc5',suitLight:'#fff0d4',suitShade:'#aaa98f',boots:'#384552',accent:'#629b99',metal:'#a4b9bb',signal:'#eabe6c',visor:'#344f64',glass:'#c5eee5'};
const SKINS={peach:['#d99c76','#edba91','#a96851'],tan:['#bb805e','#d99c76','#875641'],umber:['#895740','#b57855','#603b32']};
const OUTFITS=OUTFIT_NAMES,DIRECTIONS=['down','right','up','left'],HAIR=['short','bun','bob','waves','puffs','tousled'];
function object(value,label,keys){if(!value||typeof value!=='object'||Array.isArray(value))throw Error(`${label} must be an object`);for(const key of Object.keys(value))if(!keys.includes(key))throw Error(`Unknown ${label} field: ${key}`);}
function identifier(value,label){if(typeof value!=='string'||! /^[a-z][a-z0-9_-]{0,47}$/.test(value))throw Error(`Invalid ${label}`);return value;}
const fallback=(value,defaultValue)=>value===undefined?defaultValue:value;
function choice(value,allowed,label){if(!allowed.includes(value))throw Error(`Unsupported ${label}: ${value}`);return value;}
function choices(value,allowed,label){if(!Array.isArray(value)||!value.length||new Set(value).size!==value.length)throw Error(`${label} must be a nonempty unique array`);return value.map(v=>choice(v,allowed,label));}

/** A deterministic recipe expands to ordinary editable batch operations. */
export function generateCharacterRecipe(config){
  object(config,'character',['name','people','outfits','directions','mode','fps']);
  const name=identifier(fallback(config.name,'characters'),'character name'),mode=choice(fallback(config.mode,'idle'),['idle','walk','expressions'],'mode');
  const outfits=choices(fallback(config.outfits,['casual']),OUTFITS,'outfits'),directions=choices(fallback(config.directions,['down']),DIRECTIONS,'directions'),fps=fallback(config.fps,10);
  if(!Number.isFinite(fps)||fps<1||fps>60)throw Error('Character fps must be between 1 and 60');
  if(mode==='expressions'&&(directions.length!==1||directions[0]!=='down'))throw Error('Expressions require only the down direction');
  if(!Array.isArray(config.people)||!config.people.length)throw Error('Character people must be a nonempty array');
  const people=config.people.map(p=>{
    object(p,'person',['id','body','hair','skin','colors','head','arms','equipment']);
    const id=identifier(p.id,'person id'),body=choice(fallback(p.body,'adult'),Object.keys(BODY_PROFILES),'body'),hair=choice(fallback(p.hair,'short'),HAIR,'hair'),skin=choice(fallback(p.skin,'peach'),Object.keys(SKINS),'skin');
    const colors={...BASE,...Object.fromEntries(['skin','skinLight','skinShade'].map((key,i)=>[key,SKINS[skin][i]]))};
    if(p.colors!==undefined){object(p.colors,'colors',Object.keys(BASE));for(const [key,value] of Object.entries(p.colors)){if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))throw Error(`Color ${key} must be #RRGGBB`);colors[key]=value;}}
    const head=choice(fallback(p.head,'human'),['human','insectoid'],'head'),arms=choice(fallback(p.arms,2),[2,4],'arms'),equipment=choice(fallback(p.equipment,'none'),['none','survey-rig'],'equipment');
    if(head!=='human'&&p.hair!==undefined)throw Error('Hair applies only to human heads');
    return {id,body,hair,colors,head,arms,equipment};
  });
  if(new Set(people.map(p=>p.id)).size!==people.length)throw Error('Person IDs must be unique');
  const count=people.length*outfits.length*directions.length*(mode==='idle'?1:8);
  if(count>100)throw Error('Character recipes support at most 100 frames; split casts into sheets');
  const cols=Math.min(count,count>80?10:8),rows=Math.ceil(count/cols);
  const operations=[{command:'new',name,size:'40x56',rows,cols,palette:'pico8'}],frames=[];
  for(const person of people)for(const outfit of outfits)for(const direction of directions){
    const cells=[];
    for(let index=0;index<(mode==='idle'?1:8);index++){
      const cell=`${Math.floor(frames.length/cols)},${frames.length%cols}`,expression=mode==='expressions'?EXPRESSION_NAMES[index]:'neutral';
      const alias=`${person.id}_${outfit}_${direction}_${mode==='walk'?`walk_${index}`:mode==='idle'?'idle':expression}`;
      operations.push({command:'name',cell,as:alias});cells.push(cell);
      const mirror=direction==='left',canonical=mirror?'right':direction,names=[],bounds={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};
      const add=(type,part,color,fields,points)=>{
        part=mirror?part.replace(/(^|_)(left|right)(?=_|$)/g,(_,prefix,side)=>prefix+(side==='left'?'right':'left')):part;
        if(names.includes(part))throw Error(`Duplicate character part: ${part}`);names.push(part);
        for(const [x,y] of points){if(!Number.isInteger(x)||!Number.isInteger(y))throw Error('Noninteger character geometry');bounds.left=Math.min(bounds.left,x);bounds.right=Math.max(bounds.right,x);bounds.top=Math.min(bounds.top,y);bounds.bottom=Math.max(bounds.bottom,y);}
        operations.push({command:'draw',type,cell,name:part,color,filled:true,...fields});
      };
      const mx=x=>mirror?40-x:x;
      const pen={
        rect(part,x,y,w,h,color){if(mirror)x=40-x-w+1;add('rect',part,color,{x,y,w,h},[[x,y],[x+w-1,y+h-1]]);},
        poly(part,points,color){points=points.map(([x,y])=>[mx(x),y]);add('polygon',part,color,{points:points.map(([x,y])=>({x,y}))},points);},
        line(part,x1,y1,x2,y2,color){x1=mx(x1);x2=mx(x2);add('line',part,color,{x1,y1,x2,y2},[[x1,y1],[x2,y2]]);},
        ellipse(part,cx,cy,rx,ry,color){cx=mx(cx);add('ellipse',part,color,{cx,cy,rx,ry},[[cx-rx,cy-ry],[cx+rx,cy+ry]]);},
      };
      drawHumanoid(pen,person,outfit,canonical,humanoidPose(person.body,canonical,index,mode==='walk',person.arms),expression);
      for(const [group,pattern] of Object.entries({face:/^(?:face|head|hair|nose|mouth|cheek|antenna|mandible|chitin)(?:_|$)|(?:^|_)(?:eye|brow|ear)(?:_|$)/,helmet:/helmet|visor|neck_seal/,equipment:/^equipment_|^phase_/,garment:/^mantle_/,left_lower_arm:/^left_lower_/,right_lower_arm:/^right_lower_/,left_arm:/^left_(upper_arm|forearm|sleeve|elbow|wrist|glove|hand)/,right_arm:/^right_(upper_arm|forearm|sleeve|elbow|wrist|glove|hand)/,left_leg:/^left_(thigh|shin|knee|boot|ankle)/,right_leg:/^right_(thigh|shin|knee|boot|ankle)/})){const shapes=names.filter(n=>pattern.test(n));if(shapes.length)operations.push({command:'shape-group',sub:'create',cell,name:group,shapes});}
      const pose=humanoidPose(person.body,direction,index,mode==='walk',person.arms),checks=validatePose(pose,mode==='walk');
      if(bounds.left<0||bounds.top<0||bounds.right>=40||bounds.bottom>=56)checks.push('out-of-cell');
      if(checks.length)throw Error(`Invalid character ${alias}: ${checks.join(', ')}`);
      frames.push({cell,alias,person:person.id,body:person.body,outfit,expression,...pose,headKind:person.head,armCount:person.arms,equipment:person.equipment,sealed:isSealed(outfit),bounds,checks});
    }
    if(mode!=='idle')operations.push({command:'group',sub:'create',name:`${person.id}_${outfit}_${direction}_${mode}`,cells,fps});
  }
  operations.push({command:'pivot',anchor:'bottom-center'});
  return {operations,report:{version:1,ok:true,cellSize:{width:40,height:56},ground:54,frames}};
}
