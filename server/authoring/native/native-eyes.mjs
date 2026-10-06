// Native eyes keep their own palette: skin-outline colors are not eye colors.
export const NATIVE_EYE_COLORS=Object.freeze({
  brow:'#000000','white-shadow':'#d3c0b8','white-highlight':'#fffdfc',
  'iris-shadow':'#682b0f','iris-highlight':'#813f20',
});
export const NATIVE_CHILD_EYE_COLORS=Object.freeze({
  brow:'#010101','white-shadow':'#b2e5f9','white-highlight':'#edf4fa',
  'iris-shadow':'#3d4f78','iris-highlight':'#8f72c6',
});
const SYMBOLS={b:'brow',w:'white-shadow',l:'white-highlight',i:'iris-shadow',j:'iris-highlight'};
const PATTERNS={front:['.bb..bb.','bwi..iwb','.lj..jl.'],right:['.bb','bwi','.lj'],'front-right':['b.bb','i.wi','j.lj'],back:[]};

/** Small editable eye clusters; x/y locate the top-left of the three-row band. */
export function nativeEyePixels(direction='front-right',{x=0,y=0,kind='adult'}={}){
  const mirror=direction==='left'||direction==='front-left',facing=direction==='left'?'right':direction==='front-left'?'front-right':direction;
  if(!Object.hasOwn(PATTERNS,facing))throw Error('Choose front, right, left, back, front-right or front-left eyes.');
  if(!Number.isInteger(x)||!Number.isInteger(y))throw Error('Eye coordinates must be integers.');
  if(!['adult','child','large'].includes(kind))throw Error('Choose adult, child or large eyes.');
  const colors=kind==='child'?NATIVE_CHILD_EYE_COLORS:NATIVE_EYE_COLORS;
  const rows=PATTERNS[facing],width=rows[0]?.length??0,pixels=[];
  rows.forEach((row,dy)=>[...row].forEach((symbol,dx)=>{
    if(symbol==='.')return;const role=SYMBOLS[symbol];
    pixels.push({x:x+(mirror?width-1-dx:dx),y:y+dy,color:colors[role],role});
  }));
  return pixels;
}

// Tag the authored source before skin recoloring, clothing or body broadening.
// Coordinates and point names remain intact; profile whites share the front ramp.
export function prepareNativeEyes(project,kind){
  const colors=kind==='child'?NATIVE_CHILD_EYE_COLORS:NATIVE_EYE_COLORS;
  const byColor=new Map(Object.entries(colors).map(([role,color])=>[color,role]));
  byColor.set('#f5e2ff','white-highlight');
  if(kind==='child'){
    // The traced child frames contain one-channel variants of the same eye tones.
    for(const color of ['#000000','#020202'])byColor.set(color,'brow');
    for(const color of ['#3c4e77','#3d4f77'])byColor.set(color,'iris-shadow');
    for(const color of ['#8f71c6','#9072c6'])byColor.set(color,'iris-highlight');
  }
  for(const [cell,source]of Object.entries(project.cells)){
    const groups=project.shapeGroups[cell],head=new Set(groups.head),roles={};
    for(const shape of source.shapes){
      const role=head.has(shape.name)?byColor.get(shape.color):undefined;if(!role)continue;
      shape.color=colors[role];(roles[`eyes-${role}`]??=[]).push(shape.name);
    }
    const eyes=Object.values(roles).flat();if(!eyes.length)continue;
    groups.eyes=eyes;Object.assign(groups,roles);
    const eyeSet=new Set(eyes);
    for(const name of Object.keys(groups))if(name.startsWith('skin-'))groups[name]=groups[name].filter(n=>!eyeSet.has(n));
  }
  return project;
}
