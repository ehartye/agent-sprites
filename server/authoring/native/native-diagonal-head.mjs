import {nativeEyePixels} from './native-eyes.mjs';
import {SKIN_TONES} from '../../engine/skin-tones.js';

// A native ten-pixel skull, authored in three-quarter view. Eyes overlay the
// skin without changing the opaque head envelope or introducing a mouth.
const FRONT_RIGHT=['..oooooo..','.ohhhhSSo.','ohhhhhSSso','ohhhhSSSso','ohhhSSSSso','ohhSSSShso','ohhssShSso','ohhssSSSso','ohSSSShhso','.osSSShso.','..oooooo..'];
const BACK_RIGHT=['..oooooo..','.ohhhhSSo.','ohhhhhSSso','ohhhhSSSso','ohhhhSSSso','ohhhSSSSso','ohhhSSSSso','ohhSSSSSso','ohSSSSSSso','.osSSSSso.','..oooooo..'];

/** Head-only points at native mannequin coordinates; not a diagonal body pose. */
export function nativeDiagonalHead(kind='adult',direction='front-right',tone='peach',{bob=0}={}){
  if(!['adult','child','large'].includes(kind))throw Error('Choose adult, child or large.');
  if(!['front-right','front-left','back-right','back-left'].includes(direction))throw Error('Choose a native diagonal head.');
  if(bob!==0&&bob!==1)throw Error('Native head bob must be 0 or 1.');
  const ramp=SKIN_TONES.find(t=>t.id===tone)?.colors;if(!ramp)throw Error('Choose a supported skin tone.');
  const roles={o:'outline',s:'shadow',S:'base',h:'highlight'},top=(kind==='child'?8:2)+bob,pixels=new Map();
  (direction.startsWith('back')?BACK_RIGHT:FRONT_RIGHT).forEach((row,y)=>[...row].forEach((symbol,x)=>{
    if(symbol==='.')return;const role=roles[symbol];pixels.set(`${x+3},${y+top}`,{x:x+3,y:y+top,color:ramp[role],material:'skin',role});
  }));
  for(const eye of (direction.startsWith('front')?nativeEyePixels('front-right',{x:8,y:top+5,kind}):[])){
    const key=`${eye.x},${eye.y}`;if(!pixels.has(key))throw Error('Eye exceeds native head envelope.');pixels.set(key,{...eye,material:'eyes'});
  }
  return [...pixels.values()].map(p=>({...p,x:direction.endsWith('left')?15-p.x:p.x}));
}
