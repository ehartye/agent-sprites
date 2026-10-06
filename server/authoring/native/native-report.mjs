import {jointsFor,STRIDE,PROFILE_STEPS} from './joints.mjs';
import {bodySideRole} from '../humanoid-poses.js';

const RUNTIME={front:'down',back:'up',right:'right',left:'left'};
const VECTOR={front:[0,1],back:[0,-1],right:[1,0],left:[-1,0]};

// Profile walks travel the measured per-frame steps, so the support foot stays
// planted. Front and back walks use one uniform stride and claim no planting.
const locomotion=(kind,direction,frame)=>{
  if(direction==='front'||direction==='back')return {cycleDistance:4*STRIDE[kind],frameDistance:STRIDE[kind],phaseDistance:frame*STRIDE[kind],frameCount:4,fps:8,direction:VECTOR[direction],contactCalibration:'none',rootCompensation:'none',contacts:[]};
  const steps=PROFILE_STEPS[kind],cycle=steps.reduce((a,b)=>a+b,0);
  return {cycleDistance:cycle,frameDistance:cycle/4,frameDistances:steps,phaseDistance:steps.slice(0,frame).reduce((a,b)=>a+b,0),frameCount:4,fps:8,direction:VECTOR[direction],contactCalibration:'profile',rootCompensation:'subtract-phase-remainder',contacts:[]};
};

/** Recipe-compatible character report for a native 16×32 sheet. */
export function nativeReport(ops, kind, {gear=[],actions={}}={}) {
  const frames=ops.filter(o=>o.command==='name').map(({cell,as:alias})=>{
    const [direction,word,phase]=alias.split('_'),act=word!==undefined&&word!=='walk'?actions[alias]:undefined,frame=phase===undefined?(act?act.frame:null):Number(phase);
    const pts=ops.filter(o=>o.command==='draw'&&o.cell===cell),xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
    const j=jointsFor(kind,direction,act?null:frame);
    // An action frame reports where its acting hand actually is, for attaching held items.
    if(act?.wrist)j[act.side].wrist=act.wrist;
    const sides=Object.fromEntries(['left','right'].map(side=>[side,{role:bodySideRole(side,RUNTIME[direction]),...j[side]}]));
    return {alias,cell,direction,frame,...(act?{action:act.action,actingSide:act.side}:{}),sides,...(frame===null||act?{}:{locomotion:locomotion(kind,direction,frame)}),
      gear:gear.map(g=>({...g,role:sides[g.side].role})),
      bounds:{left:Math.min(...xs),top:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys)}};
  });
  return {version:1,ok:true,kind:'character',system:'native',cellSize:{width:16,height:32},ground:29,
    aliases:{idle:'{direction}',walk:'{direction}_walk_{frame}',...actionAliases(actions)},
    directions:{down:'front',up:'back',right:'right',left:'left'},frames};
}

// Published alias patterns for each action present, e.g. swing: '{direction}_swing_{frame}'.
function actionAliases(actions){
  const out={};
  for(const info of Object.values(actions))out[info.action]=['swing','water'].includes(info.action)?'{direction}_'+info.action+'_{frame}':'{direction}_'+info.action;
  return out;
}
