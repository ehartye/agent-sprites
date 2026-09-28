import {jointsFor,STRIDE} from './joints.mjs';
import {bodySideRole} from '../../server/authoring/humanoid-poses.js';

const RUNTIME={front:'down',back:'up',right:'right',left:'left'};
const VECTOR={front:[0,1],back:[0,-1],right:[1,0],left:[-1,0]};

// Uncalibrated walking: one measured stride per body, no foot locking claimed.
const locomotion=(kind,direction,frame)=>({cycleDistance:4*STRIDE[kind],frameDistance:STRIDE[kind],phaseDistance:frame*STRIDE[kind],frameCount:4,fps:8,direction:VECTOR[direction],contactCalibration:'none',rootCompensation:'none',contacts:[]});

/** Recipe-compatible character report for a native 16×32 sheet. */
export function nativeReport(ops, kind, {gear=[]}={}) {
  const frames=ops.filter(o=>o.command==='name').map(({cell,as:alias})=>{
    const [direction,,phase]=alias.split('_'),frame=phase===undefined?null:Number(phase);
    const pts=ops.filter(o=>o.command==='draw'&&o.cell===cell),xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
    const j=jointsFor(kind,direction,frame);
    const sides=Object.fromEntries(['left','right'].map(side=>[side,{role:bodySideRole(side,RUNTIME[direction]),...j[side]}]));
    return {alias,cell,direction,frame,sides,...(frame===null?{}:{locomotion:locomotion(kind,direction,frame)}),
      gear:gear.map(g=>({...g,role:sides[g.side].role})),
      bounds:{left:Math.min(...xs),top:Math.min(...ys),right:Math.max(...xs),bottom:Math.max(...ys)}};
  });
  return {version:1,ok:true,kind:'character',system:'native',cellSize:{width:16,height:32},ground:29,
    aliases:{idle:'{direction}',walk:'{direction}_walk_{frame}'},
    directions:{down:'front',up:'back',right:'right',left:'left'},frames};
}
