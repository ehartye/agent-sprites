import {dressTemplate} from './dress-template.mjs';
import {sourceMannequin} from './native-mannequin.mjs';
import {broadenMannequin} from './large-mannequin.mjs';
import {handBoxes} from './joints.mjs';

const ROLES=['outline','shadow','base','highlight'];
const COLOR=/^#[\da-f]{6}$/i;

// A costume stays declarative: material ramps and small pixel motifs attached
// to anatomy landmarks. Left reflects the complete authored right costume.
export function costumeTemplate(profile) {
  if(!profile?.id || !/^[a-z][a-z0-9-]*$/.test(profile.id))throw Error('Costume needs a stable id.');
  for(const color of Object.values(profile.colors??{}))if(!COLOR.test(color))throw Error('Costume colors must be six-digit hex values.');
  for(const motif of profile.motifs??[]){
    if(!motif.name||!Number.isInteger(motif.x)||!Number.isInteger(motif.y??0))throw Error('Costume motifs need a name and integer coordinates.');
    if(motif.directions?.some(dir=>!['front','right','back'].includes(dir)))throw Error('Author front/right/back motifs; left reflects right.');
    if(motif.frames&&(!Array.isArray(motif.frames)||motif.frames.length!==4||motif.frames.some(rows=>!Array.isArray(rows))))throw Error('Animated motifs need four pixel-row frames.');
  }
  const kind=profile.kind??'adult';
  // The large build is a bare body: motifs supply any clothing. It never has a wig or garments.
  if(kind==='large'&&(profile.outfit??'none')!=='none'||kind!=='large'&&profile.outfit==='none')throw Error(kind==='large'?'The large body is bare: use outfit none.':'Only the large body supports outfit none.');
  const ops=kind==='large'?broadenMannequin(sourceMannequin('adult',profile.tone??'peach'),profile.tone??'peach',{bulk:2}):dressTemplate(kind,profile.outfit??'jacket',profile.tone??'peach',profile.wig??'none',{finish:false});
  ops[0].name=profile.projectName??`cast-${profile.id}`;
  const behindOps=[],removed=new Set();
  for(const [material,ramp] of Object.entries(profile.materials??{})){
    if(ROLES.some(role=>!COLOR.test(ramp[role]??'')))throw Error(`${material}: provide four hex color roles.`);
    if(!ops.some(o=>o.command==='shape-group'&&o.name===`${material}-base`))throw Error(`Unknown costume material: ${material}`);
    for(const group of ops.filter(o=>o.command==='shape-group'&&ROLES.some(role=>o.name===`${material}-${role}`))){
      const role=group.name.slice(material.length+1),members=new Set(group.shapes);
      for(const point of ops.filter(o=>o.command==='draw'&&o.cell===group.cell&&members.has(o.name)))point.color=ramp[role];
    }
  }
  for(const frame of ops.filter(o=>o.command==='name')){
    const facing=frame.as.split('_')[0],direction=facing==='left'?'right':facing;
    const phase=frame.as.includes('_walk_')?Number(frame.as.split('_').at(-1)):0;
    const points=ops.filter(o=>o.command==='draw'&&o.cell===frame.cell);
    const headNames=new Set(ops.find(o=>o.command==='shape-group'&&o.cell===frame.cell&&o.name==='head').shapes);
    const head=Math.min(...points.filter(p=>headNames.has(p.name)).map(p=>p.y));
    if(profile.replaceHead)for(const name of headNames)removed.add(`${frame.cell}/${name}`);
    const bob=head-(kind==='child'?8:2);
    const anchors={head,shoulder:(kind==='child'?20:15)+bob,waist:(kind==='child'?24:21)+bob,ground:29,cell:0};
    const skin=new Set(ops.filter(o=>o.command==='shape-group'&&o.cell===frame.cell&&o.name.startsWith('skin-')).flatMap(o=>o.shapes));
    // A bare large body is skin everywhere, so only the (widened) hand boxes stay exposed.
    const exposedHands=kind==='large'?largeHands(facing,phase,bob):new Set([...new Map(points.map(p=>[`${p.x},${p.y}`,p])).entries()].filter(([,p])=>skin.has(p.name)&&!headNames.has(p.name)&&p.y>=anchors.shoulder).map(([key])=>key));
    for(const [index,motif] of (profile.motifs??[]).entries()){
      if(motif.directions&&!motif.directions.includes(direction))continue;
      if(motif.layer&&!['behind','front'].includes(motif.layer))throw Error(`Unknown costume layer: ${motif.layer}`);
      if(!(motif.anchor in anchors))throw Error(`Unknown costume anchor: ${motif.anchor}`);
      const rows=motif.frames?.[phase]??motif.rows;
      if(!Array.isArray(rows))throw Error('Costume motif needs pixel rows.');
      const shapes=[],target=motif.layer==='behind'?behindOps:ops;
      rows.forEach((row,j)=>[...row].forEach((symbol,i)=>{
        if(symbol==='.')return;
        const color=motif.colors?.[symbol]??profile.colors?.[symbol];
        if(!COLOR.test(color??''))throw Error(`Missing motif color: ${symbol}`);
        const authoredX=motif.x+i,x=facing==='left'?15-authoredX:authoredX,y=anchors[motif.anchor]+(motif.y??0)+j;
        if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||x>15||y<0||y>29)throw Error(`${profile.id}/${frame.as}/${motif.name}: motif outside grounded 16x32 cell.`);
        if(motif.layer!=='behind'&&!motif.coverHands&&exposedHands.has(`${x},${y}`))return;
        const name=`costume-${index}-${motif.name}-${x}-${y}`;
        target.push({command:'draw',type:'point',cell:frame.cell,name,x,y,color});shapes.push(name);
      }));
      target.push({command:'shape-group',sub:'create',cell:frame.cell,name:`costume-${index}-${motif.name}`,shapes});
      if(motif.part==='head')target.push({command:'shape-group',sub:'create',cell:frame.cell,name:'head',shapes});
    }
  }
  ops.splice(1,0,...behindOps);
  for(let i=ops.length-1;i>=0;i--){
    const op=ops[i];
    if(op.command==='draw'&&removed.has(`${op.cell}/${op.name}`))ops.splice(i,1);
    else if(op.command==='shape-group'){
      op.shapes=op.shapes.filter(name=>!removed.has(`${op.cell}/${name}`));
      if(!op.shapes.length)ops.splice(i,1);
    }
  }
  // Outline only exposed costume pixels after assembling rear/body/front layers.
  // A motif can meet the body without a seam, but cannot leave a bright cut edge.
  for(const frame of ops.filter(o=>o.command==='name')){
    const visible=new Map(ops.filter(o=>o.command==='draw'&&o.cell===frame.cell).map(o=>[`${o.x},${o.y}`,o]));
    for(const point of visible.values())if(point.name.startsWith('costume-')&&[[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dy])=>!visible.has(`${point.x+dx},${point.y+dy}`)))point.color=profile.colors?.o??'#26333f';
  }
  // Robot casing is a material, not skin: skin-tone edits must not repaint it.
  if(profile.bodyMaterial)for(const group of ops.filter(o=>o.command==='shape-group'&&o.name.startsWith('skin-')))group.name=group.name.replace(/^skin-/,`${profile.bodyMaterial}-`);
  return ops;
}

// Adult hand boxes widened like the large body: left of centre shifts left, right shifts right.
function largeHands(facing,phase,bob){
  const out=new Set(),dir=facing==='left'?'right':facing;
  for(const [l,t,r,b] of handBoxes('adult',dir,phase))for(let y=t+bob;y<=b+bob;y++)for(let x=l;x<=r;x++){
    const xs=x<7?[x-1,...(x===6?[6]:[])]:x>8?[x+1,...(x===9?[9]:[])]:[x];
    for(const nx of xs)out.add((facing==='left'?15-nx:nx)+','+y);
  }
  return out;
}
