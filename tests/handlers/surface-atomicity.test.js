import {test,expect,vi} from 'vitest';
import {Project} from '../../server/engine/project.js';
import {handleDraw} from '../../server/handlers/draw.js';
import {handleDuplicateShape,handleCloneShape,handleResizeShape,handleTweenShape} from '../../server/handlers/shape.js';
import {patchAsciiRegion} from '../../server/engine/ascii-region.js';

function fixture(size=8){const project=Project.create({name:'bounded-surfaces',cellSize:size,rows:1,cols:2});return {project,broadcast:vi.fn()};}
const lamps=(count,x=0)=>Array.from({length:count},(_,i)=>({name:`lamp-${i}`,x,y:0}));
function snapshot(state){return {project:state.project.toJSON(),history:state.project.cells.listCells().map(({coord})=>{const cell=state.project.cells.getCell(coord);return [cell._undoStack.length,cell._redoStack.length,cell._nextZ];})};}

test('duplicate, clone and resize reject invalid complete surface scenes without edits or messages',()=>{
  const state=fixture(),cell=state.project.cells.getCell('0,0');
  handleDraw(state,'point',{cell:'0,0',x:0,y:0,color:'#fff',shape_name:'carrier',surface:{lamps:lamps(33)}});
  handleDraw(state,'point',{cell:'0,1',x:0,y:0,color:'#fff',shape_name:'other',surface:{lamps:lamps(33)}});
  const before=snapshot(state);state.broadcast.mockClear();
  expect(()=>handleDuplicateShape(state,{cell:'0,0',shape:'carrier'})).toThrow(/lamp count/);
  expect(()=>handleCloneShape(state,{from_cell:'0,0',to_cell:'0,1',shape:'carrier'})).toThrow(/lamp count/);
  expect(snapshot(state)).toEqual(before);expect(state.broadcast).not.toHaveBeenCalled();
  cell.clear();handleDraw(state,'rect',{cell:'0,0',x:0,y:0,w:2,h:2,filled:true,color:'#fff',shape_name:'panel',surface:{normal:{mode:'bevel'}}});
  const resized=snapshot(state);state.broadcast.mockClear();
  expect(()=>handleResizeShape(state,{cell:'0,0',shape:'panel',updates:{w:10000,h:10000}})).toThrow(/raster work/);
  expect(snapshot(state)).toEqual(resized);expect(state.broadcast).not.toHaveBeenCalled();
});

test('oversized compound borders and ASCII patches roll back all shapes and history before publication',()=>{
  const state=fixture(256),cell=state.project.cells.getCell('0,0');
  handleDraw(state,'rect',{cell:'0,0',x:0,y:0,w:64,h:64,filled:true,color:'#fff',shape_name:'panel',surface:{normal:{mode:'flat'}}});
  const before=snapshot(state);state.broadcast.mockClear();
  expect(()=>handleDraw(state,'border',{cell:'0,0',shapes:'panel',color:'#000'})).toThrow(/raster work/);
  expect(snapshot(state)).toEqual(before);expect(state.broadcast).not.toHaveBeenCalled();
  expect(()=>patchAsciiRegion(cell,state.project.palette,{x:0,y:0,rows:Array(16).fill('A'.repeat(16)),colors:{A:'#ffffff'}})).toThrow(/raster work/);
  expect(snapshot(state)).toEqual(before);
});

test('a later tween frame failure restores every cell, history and outgoing messages',()=>{
  const state=fixture();state.sessionId='isolated';state.db={getCellGroups:()=>({walk:['0,0','0,1']})};
  for(const [index,x] of [0,1048576].entries())handleDraw(state,'point',{cell:`0,${index}`,x:0,y:0,color:'#fff',shape_name:'carrier',surface:{lamps:lamps(1,x)}});
  const before=snapshot(state);state.broadcast.mockClear();
  expect(()=>handleTweenShape(state,{group:'walk',shape:'carrier',from:{x:1,y:0},to:{x:1,y:0}})).toThrow(/Lamp x/);
  expect(snapshot(state)).toEqual(before);expect(state.broadcast).not.toHaveBeenCalled();
});

test('canonical edits and copied cells validate current palette context before mutation',()=>{
  const state=fixture(),cell=state.project.cells.getCell('0,0');
  const before=snapshot(state);
  expect(()=>cell.setLighting({palettePolicy:'nearest'})).toThrow(/opaque palette/);
  expect(snapshot(state)).toEqual(before);
  state.project.palette.add('white','#ffffff');cell.setLighting({palettePolicy:'nearest'});
  state.project.cells.copyCell('0,0','0,1');
  const copy=state.project.cells.getCell('0,1');
  copy.draw('point',{x:0,y:0,surface:{lamps:lamps(33)}},'#fff','carrier');
  const copied=snapshot(state);
  expect(()=>copy.draw('point',{x:1,y:0,surface:{lamps:lamps(33)}},'#fff','other')).toThrow(/lamp count/);
  expect(snapshot(state)).toEqual(copied);
});

test('active surface draws reject oversized preparatory paths before expanding them',()=>{
  const state=fixture();handleDraw(state,'rect',{cell:'0,0',x:0,y:0,w:2,h:2,filled:true,color:'#ffffff',shape_name:'panel',surface:{normal:{mode:'flat'}}});
  const before=snapshot(state);state.broadcast.mockClear();
  const push=Array.prototype.push;
  let points=0;
  Array.prototype.push=function(...items){
    if(items[0]&&Object.keys(items[0]).join(',')==='x,y'&&++points>=1024)throw new Error('Unbounded path expansion reached');
    return Reflect.apply(push,this,items);
  };
  try {
    for(const [type,params] of [
      ['line',{x1:0,y1:0,x2:70000000,y2:0,width:2}],
      ['arc',{cx:0,cy:0,r:70000000,from_deg:0,to_deg:360}],
      ['ellipse',{cx:0,cy:0,rx:70000000,ry:2,filled:false,clip_to:'panel'}],
      ['highlight',{shape:'panel',count:70000000}],
    ])expect(()=>handleDraw(state,type,{cell:'0,0',color:'#ffffff',...params})).toThrow(/Surface.*raster work/);
  } finally { Array.prototype.push=push; }
  expect(points).toBeLessThan(1024);expect(snapshot(state)).toEqual(before);expect(state.broadcast).not.toHaveBeenCalled();
});
