import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sourceMannequin,finishNative} from './native-mannequin.mjs';
import {handBoxes} from './joints.mjs';
import {nativeReport} from './native-report.mjs';
import {drawNativeGear,parseGear} from './native-gear.mjs';

// finish:false leaves the composite uncut for costumes, which add layers and cut once at the end.
export function dressTemplate(kind='adult', style='jacket', tone='peach', wig=style==='dress'?'tied':'short', {finish=true,gear=[]}={}) {
  if (!['adult','child'].includes(kind) || !['jacket','dress'].includes(style)) throw new Error('Choose adult/child and jacket/dress.');
  if (!['short','tied','none'].includes(wig)) throw new Error('Choose short, tied or none for the wig.');
  // Start from the uncut body: the final pass cuts the whole composite once.
  const ops=sourceMannequin(kind,tone);
  ops[0].name=`${kind}-${style}${wig===(style==='dress'?'tied':'short')?'':'-'+wig}`;
  const palettes={
    hair:wig==='short'?{o:'#302238',S:'#523048',B:'#824556',H:'#b96c72'}:{o:'#382537',S:'#743c48',B:'#b76455',H:'#e5a371'},
    cloth:style==='jacket'?{o:'#243449',S:'#32576a',B:'#467f8a',H:'#7db4ab'}:{o:'#283c40',S:'#356557',B:'#579775',H:'#99c18a'},
    trim:{o:'#443345',S:'#977453',B:'#d2ad71',H:'#f2d3a2'},
    trousers:{o:'#283140',S:'#394755',B:'#526673',H:'#7d9098'},
    shoes:{o:'#302637',S:'#513d49',B:'#775453',H:'#aa7a69'}
  };
  for(const {cell,as:alias} of ops.filter(op=>op.command==='name')) {
    const facing=alias.split('_')[0],dir=facing==='left'?'right':facing;
    const phase=Number(alias.split('_').at(-1))||0;
    const base=ops.filter(op=>op.command==='draw'&&op.cell===cell).map(p=>({...p,x:facing==='left'?15-p.x:p.x}));
    const headNames=new Set(ops.find(op=>op.command==='shape-group'&&op.cell===cell&&op.name==='head').shapes);
    const headTop=Math.min(...base.filter(p=>headNames.has(p.name)).map(p=>p.y));
    const bob=headTop-(kind==='adult'?2:8),shoulder=(kind==='adult'?15:20)+bob,waist=(kind==='adult'?21:24)+bob;
    // Hand silhouettes follow the actual source stride, including the forward
    // and rear profile swings. Do not paint trousers over a low swinging hand.
    const neutral=phase%2===0;
    const hands=handBoxes(kind,dir,phase);
    const isHand=(x,y)=>hands.some(([l,t,r,b])=>x>=l&&x<=r&&y>=t&&y<=b);
    const skinOutline=new Set(ops.filter(op=>op.command==='shape-group'&&op.cell===cell&&op.name==='skin-outline').flatMap(op=>op.shapes));
    const occupied=new Set(base.map(p=>`${p.x},${p.y}`));
    const overlay=new Map();
    function pixel(x,y,part,role='B'){if(x<0||x>=16||y<0||y>=32)throw new Error('Clipped clothing');overlay.set(`${x},${y}`,{x,y,part,role});}
    // Fit garment to the body, leaving the face and distal hands visible.
    for(const p of base){
      const {x,y}=p;
      if(headNames.has(p.name)||isHand(x,y))continue;
      const hem=waist+(kind==='adult'?1:0);
      if(y>=shoulder-1&&y<=hem) {
        let role=x>=9?'S':x<=6?'H':'B';
        if(skinOutline.has(p.name))role='o';
        pixel(x,y,'cloth',role);
        if(style==='jacket'&&dir==='front'&&x>=7&&x<=8)pixel(x,y,'trim', y===waist?'o':'B');
        if(y===waist&&x>=5&&x<=10)pixel(x,y,'trim','S');
        if(dir==='right'&&x===6&&y>=shoulder+1)pixel(x,y,'cloth','o');
      }
      const shoeTop=kind==='adult'?(dir==='right'&&phase===3&&x>=8?26:27):28;
      if(style==='jacket'&&y>hem&&y<shoeTop)pixel(x,y,'trousers',skinOutline.has(p.name)?'o':x<=6?'H':'B');
      if(y>=shoeTop)pixel(x,y,'shoes',skinOutline.has(p.name)?'o':x<=6?'H':'B');
    }
    // A collar frames the neck without moving it or covering facial pixels.
    if(dir!=='right')for(const x of [6,9])pixel(x,shoulder-1,'trim','H');
    if(style==='dress') {
      // The skirt is a new silhouette, not a stretched adult garment.
      const hem=26+bob,sway=dir==='right'?0:phase===1?1:phase===3?-1:0;
      for(let y=waist;y<=hem;y++){
        const left=(dir==='right'?5:(y>=hem-1?3:4))+sway,right=(dir==='right'?11:(y>=hem-1?12:11))+sway;
        for(let x=left;x<=right;x++)pixel(x,y,'cloth',y===hem?'o':(x===left||x===right)?'o':x<=6?'H':x>=10?'S':'B');
      }
      for(let x=dir==='right'?6:5;x<=(dir==='right'?10:10);x++)pixel(x,waist,'trim','B');
    }
    for(const p of base)if(isHand(p.x,p.y)&&!headNames.has(p.name))overlay.delete(`${p.x},${p.y}`);
    // Twelve-pixel hair envelope wraps a ten-pixel bare head. Front fringe stops above eyes.
    if(wig!=='none') {
    const front=[
      '..oooooooo..', '.oSSHHHHSSo.', 'oSHHHBBBBBSo', 'oSHHBBBBBBSo',
      'oSBBBooBBBSo', '.oBBo..oBBo.', '..oo....oo..'
    ];
    const rear=[
      '..oooooooo..', '.oSSHHHHSSo.', 'oSHHHBBBBBSo', 'oSHHBBBBBBSo',
      'oSHBBBBBBBSo', 'oSBBBBBBBBSo', 'oSBBBBBBBSSo', 'oSBBBBBBBSSo',
      '.oSBBBBBSSo.', '..oSSSSSSo..', '...oooooo...'
    ];
    const rows=dir==='back'?rear:dir==='right'?front.slice(0,6):front;
    rows.forEach((row,j)=>[...row].forEach((c,i)=>{if(c!=='.')pixel(i+2,headTop-1+j,'hair',c);}));
    if(dir==='right')for(let y=headTop+4;y<=headTop+9;y++)for(let x=3;x<=6;x++)pixel(x,y,'hair',x===3?'o':x===4?'S':'B');
    if(wig==='tied'){
      // A tied knot changes silhouette, visibly behind the head in profile.
      if(dir==='right') ['.oo.','oHBo','oBSo','.oo.'].forEach((r,j)=>[...r].forEach((c,i)=>{if(c!=='.')pixel(i+1,headTop+6+j,'hair',c);}));
      if(dir==='back') ['.oo.','oHBo','oBSo','.oo.'].forEach((r,j)=>[...r].forEach((c,i)=>{if(c!=='.')pixel(i+6,headTop+7+j,'hair',c);}));
      if(dir==='front')for(const [x,y] of [[3,headTop+6],[12,headTop+6]])pixel(x,y,'hair','o');
    }
    }
    // Every newly exposed material boundary gets an opaque outline in place.
    for(const key of overlay.keys())occupied.add(key);
    for(const p of overlay.values())if([[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dy])=>!occupied.has(`${p.x+dx},${p.y+dy}`)))p.role='o';
    const groups={};
    for(const p of overlay.values()){
      const x=facing==='left'?15-p.x:p.x,name=`${facing}-${p.part}-${x}-${p.y}`;
      ops.push({command:'draw',type:'point',cell,name,x,y:p.y,color:palettes[p.part][p.role]});
      for(const group of [p.part,`${p.part}-${{o:'outline',S:'shadow',B:'base',H:'highlight'}[p.role]}`])(groups[group]??=[]).push(name);
    }
    for(const [name,shapes]of Object.entries(groups))ops.push({command:'shape-group',sub:'create',cell,name,shapes});
  }
  // Held gear joins the composite before its single corner pass.
  const held=drawNativeGear(ops,kind,gear);
  return finish?finishNative(held):held;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args=process.argv.slice(2),gear=parseGear(args.filter(a=>a.startsWith('gear='))),[kind='adult',style,tone,wig]=args.filter(a=>!a.startsWith('gear='));const operations=dressTemplate(kind,style,tone,wig,{gear});process.stdout.write(JSON.stringify({operations,report:nativeReport(operations,kind,{gear})}));}
