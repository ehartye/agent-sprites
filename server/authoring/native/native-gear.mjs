import {jointsFor} from './joints.mjs';
import {bodySideRole} from '../humanoid-poses.js';

export const NATIVE_GEAR=['trowel'];
const RUNTIME={front:'down',back:'up',right:'right',left:'left'};
// Draft palette: the body's plum outline keeps the build's outline check valid.
export const TROWEL={outline:'#673649',handle:'#8a5a3c',metal:'#c9d3d6'};

/** "trowel:right" args or profile objects → validated gear list (one hand item per side). */
export function parseGear(input=[]){
  const list=input.map(g=>typeof g==='string'?(([item,side])=>({item,side}))(g.replace(/^gear=/,'').split(':')):{...g});
  const seen=new Set();
  for(const g of list){
    if(!NATIVE_GEAR.includes(g.item))throw new Error(`Unknown gear item: ${g.item}`);
    if(!['left','right'].includes(g.side))throw new Error(`Gear side must be left or right, not ${g.side}`);
    if(seen.has(g.side))throw new Error(`Only one hand item per side (${g.side})`);
    seen.add(g.side);
  }
  return list;
}

// Offsets from the wrist. Front/back: blade hangs down. Profile: blade points forward (f).
function trowelPixels(facing,[wx,wy]){
  if(facing==='front'||facing==='back')return [
    ['handle',wx,wy],['handle',wx,wy+1],
    ['outline',wx-1,wy+2],['outline',wx+1,wy+2],['outline',wx-1,wy+3],['outline',wx+1,wy+3],['outline',wx,wy+4],
    ['metal',wx,wy+2],['metal',wx,wy+3],
  ];
  const f=facing==='right'?1:-1;
  return [
    ['handle',wx,wy],['handle',wx+f,wy],
    ['outline',wx+2*f,wy-1],['outline',wx+3*f,wy],['outline',wx+2*f,wy+2],['outline',wx+3*f,wy+1],
    ['metal',wx+2*f,wy],['metal',wx+2*f,wy+1],
  ];
}

/**
 * Add held gear to a finished-but-uncut composite. Near, front and back items draw
 * on top; a far item draws only on empty pixels, so the body hides the rest and
 * whatever extends past the silhouette stays visible.
 */
export function drawNativeGear(ops,kind,gear){
  if(!gear.length)return ops;
  const out=[...ops];
  for(const {cell,as:alias} of ops.filter(o=>o.command==='name')){
    const [facing,,phase]=alias.split('_'),j=jointsFor(kind,facing,phase===undefined?null:Number(phase));
    const occupied=new Set(ops.filter(o=>o.command==='draw'&&o.cell===cell).map(o=>o.x+','+o.y));
    const names=[];
    for(const g of gear){
      const role=bodySideRole(g.side,RUNTIME[facing]);
      trowelPixels(facing,j[g.side].wrist).forEach(([part,x,y],i)=>{
        if(x<0||x>15||y<0||y>31)return;
        // Owner choice: show equipment where feasible, so a far item still shows past the body.
        if(role==='far'&&occupied.has(x+','+y))return;
        const name=`gear_${g.item}_${g.side}_${i}`;
        out.push({command:'draw',type:'point',cell,name,x,y,color:TROWEL[part]});names.push(name);
      });
    }
    // As clothing does: a gear pixel on the new silhouette edge becomes outline.
    const mine=out.filter(o=>o.command==='draw'&&o.cell===cell&&names.includes(o.name));
    const all=new Set([...occupied,...mine.map(o=>o.x+','+o.y)]);
    for(const p of mine)if([[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dy])=>!all.has((p.x+dx)+','+(p.y+dy))))p.color=TROWEL.outline;
    if(names.length)out.push({command:'shape-group',sub:'create',cell,name:'gear',shapes:names});
  }
  return out;
}
