import {broadenMannequin,cutOutlineCorners} from './large-mannequin.mjs';
import {SKIN_TONES} from '../../server/engine/skin-tones.js';
import {readFileSync} from 'node:fs';
import {deriveBackStudy} from '../reference-grid/derive-back.mjs';

export const DIRECTIONS=['front','right','back','left'];

// Source poses stay editable and unchanged. Left is a reflected profile; rear
// uses the authored rear treatment on each front pose's moving silhouette.
export function nativeMannequin(kind='adult',tone='peach'){
  // Large: broad shoulders, neck and jaw (bulk 2), then outside outline corners cut to diagonals.
  if(kind==='large')return cutOutlineCorners(broadenMannequin(nativeMannequin('adult',tone),tone,{bulk:2}),SKIN_TONES.find(t=>t.id===tone).colors.outline).ops;
  if(!['adult','child'].includes(kind))throw Error('Choose adult or child.');
  const source=JSON.parse(readFileSync(new URL(`./templates/${kind}.project.json`,import.meta.url)));
  const poses=Array.from({length:4},(_,phase)=>deriveBackStudy({...source,
    cells:{'0,0':source.cells[`0,${phase}`],'1,0':source.cells[`1,${phase}`]},
    shapeGroups:{'0,0':source.shapeGroups[`0,${phase}`],'1,0':source.shapeGroups[`1,${phase}`]},
  },{kind,tone}));
  const ops=[{command:'new',name:`native-${kind}`,size:'16x32',rows:4,cols:5}];
  for(const [row,dir] of DIRECTIONS.entries()){
    const sourceCell=dir==='front'?'0,0':dir==='back'?'0,2':'0,1';
    for(let col=0;col<5;col++){
      const phase=col===0?0:col-1,cell=`${row},${col}`;
      ops.push({command:'name',cell,as:col===0?dir:`${dir}_walk_${phase}`});
      for(const op of poses[phase].filter(o=>o.cell===sourceCell&&['draw','shape-group'].includes(o.command))){
        ops.push({...op,cell,...(dir==='left'&&op.command==='draw'?{x:15-op.x}:{})});
      }
    }
    ops.push({command:'group',sub:'create',name:`walk_${dir}`,cells:[1,2,3,4].map(col=>`${row},${col}`),fps:8});
  }
  ops.push({command:'pivot',anchor:'bottom-center'});
  return ops;
}
