import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {deriveBackStudy} from '../reference-grid/derive-back.mjs';

export function dressTemplate(kind='adult', style='jacket', tone='peach') {
  if (!['adult','child'].includes(kind) || !['jacket','dress'].includes(style)) throw new Error('Choose adult/child and jacket/dress.');
  const project=JSON.parse(readFileSync(new URL(`./templates/${kind}.project.json`,import.meta.url),'utf8'));
  const ops=deriveBackStudy(project,{kind,tone});
  ops[0].name=`${kind}-${style}`;
  const headTop=kind==='adult'?2:8, shoulder=kind==='adult'?15:20, waist=kind==='adult'?21:24;
  const palettes={
    hair:style==='jacket'?{o:'#302238',S:'#523048',B:'#824556',H:'#b96c72'}:{o:'#382537',S:'#743c48',B:'#b76455',H:'#e5a371'},
    cloth:style==='jacket'?{o:'#243449',S:'#32576a',B:'#467f8a',H:'#7db4ab'}:{o:'#283c40',S:'#356557',B:'#579775',H:'#99c18a'},
    trim:{o:'#443345',S:'#977453',B:'#d2ad71',H:'#f2d3a2'},
    trousers:{o:'#283140',S:'#394755',B:'#526673',H:'#7d9098'},
    shoes:{o:'#302637',S:'#513d49',B:'#775453',H:'#aa7a69'}
  };
  for(let index=0;index<3;index++) {
    const cell=`0,${index}`, dir=['front','right','back'][index];
    const base=ops.filter(op=>op.command==='draw'&&op.cell===cell);
    const skinOutline=new Set(ops.filter(op=>op.command==='shape-group'&&op.cell===cell&&op.name==='skin-outline').flatMap(op=>op.shapes));
    const occupied=new Set(base.map(p=>`${p.x},${p.y}`));
    const overlay=new Map();
    function pixel(x,y,part,role='B'){if(x<0||x>=16||y<0||y>=32)throw new Error('Clipped clothing');overlay.set(`${x},${y}`,{x,y,part,role});}
    // Fit garment to the body, leaving the face and distal hands visible.
    for(const p of base){
      const {x,y}=p;
      const sleeve=y>=shoulder&&y<=shoulder+(kind==='adult'?4:2);
      const torso=x>=5&&x<=10;
      if(y>=shoulder-1&&y<=waist+2&&(torso||sleeve)) {
        let role=x>=9?'S':x<=6?'H':'B';
        if(skinOutline.has(p.name))role='o';
        pixel(x,y,'cloth',role);
        if(style==='jacket'&&dir==='front'&&x>=7&&x<=8)pixel(x,y,'trim', y===waist?'o':'B');
        if(y===waist&&x>=5&&x<=10)pixel(x,y,'trim','S');
        if(dir==='right'&&x===6&&y>=shoulder+1)pixel(x,y,'cloth','o');
      }
      if(style==='jacket'&&y>waist+1&&y<27)pixel(x,y,'trousers',skinOutline.has(p.name)?'o':x<=6?'H':'B');
      if(y>=27)pixel(x,y,'shoes',y===29?'o':x<=6?'H':'B');
    }
    // A collar frames the neck without moving it or covering facial pixels.
    if(dir!=='right')for(const x of [6,9])pixel(x,shoulder-1,'trim','H');
    if(style==='dress') {
      // The skirt is a new silhouette, not a stretched adult garment.
      for(let y=waist;y<=26;y++){
        const left=dir==='right'?5:(y>=25?3:4),right=dir==='right'?11:(y>=25?12:11);
        for(let x=left;x<=right;x++)pixel(x,y,'cloth',y===26?'o':(x===left||x===right)?'o':x<=6?'H':x>=10?'S':'B');
      }
      for(let x=dir==='right'?6:5;x<=(dir==='right'?10:10);x++)pixel(x,waist,'trim','B');
    }
    // Twelve-pixel hair envelope wraps a ten-pixel bare head. Front fringe stops above eyes.
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
    if(style==='dress'){
      // A tied knot changes silhouette, visibly behind the head in profile.
      if(dir==='right') ['.oo.','oHBo','oBSo','.oo.'].forEach((r,j)=>[...r].forEach((c,i)=>{if(c!=='.')pixel(i+1,headTop+6+j,'hair',c);}));
      if(dir==='back') ['.oo.','oHBo','oBSo','.oo.'].forEach((r,j)=>[...r].forEach((c,i)=>{if(c!=='.')pixel(i+6,headTop+7+j,'hair',c);}));
      if(dir==='front')for(const [x,y] of [[3,headTop+6],[12,headTop+6]])pixel(x,y,'hair','o');
    }
    // Every newly exposed material boundary gets an opaque outline in place.
    for(const key of overlay.keys())occupied.add(key);
    for(const p of overlay.values())if([[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dy])=>!occupied.has(`${p.x+dx},${p.y+dy}`)))p.role='o';
    const groups={};
    for(const p of overlay.values()){
      const name=`${dir}-${p.part}-${p.x}-${p.y}`;
      ops.push({command:'draw',type:'point',cell,name,x:p.x,y:p.y,color:palettes[p.part][p.role]});
      for(const group of [p.part,`${p.part}-${{o:'outline',S:'shadow',B:'base',H:'highlight'}[p.role]}`])(groups[group]??=[]).push(name);
    }
    for(const [name,shapes]of Object.entries(groups))ops.push({command:'shape-group',sub:'create',cell,name,shapes});
  }
  return ops;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.stdout.write(JSON.stringify(dressTemplate(...process.argv.slice(2))));
