import {test,expect} from 'vitest';
import {Project} from '../../server/engine/project.js';
import {translateParams} from '../../server/web/public/js/shared/shape-layers.js';
const surface=()=>({normal:{mode:'grid',x:1,y:1,rows:['68']},material:{solid:true},lamps:[{name:'key',x:1,y:1,radius:12,power:1,z:2,color:'#fff'}]});
function fixture(){const project=Project.create({name:'surface-state',cellSize:4,rows:1,cols:2}),cell=project.cells.getCell('0,0');cell.draw('rect',{x:1,y:1,w:2,h:1,filled:true,surface:surface()},'#fff','panel');return{project,cell};}
test('cell lighting and shape surface metadata persist independently and deep-copy with artwork',()=>{
  const {project,cell}=fixture();cell.setLighting({palettePolicy:'rgb',ambient:0.25});
  project.cells.copyCell('0,0','0,1');
  const restored=Project.fromJSON(project.toJSON()),copy=restored.cells.getCell('0,1');
  expect(copy.lighting.ambient).toBe(0.25);expect(copy.shapes.getByName('panel').params.surface.normal.rows).toEqual(['68']);
  copy.lighting.ambient=0.8;copy.shapes.getByName('panel').params.surface.normal.rows[0]='44';
  expect(restored.cells.getCell('0,0').lighting.ambient).toBe(0.25);
  expect(restored.cells.getCell('0,0').shapes.getByName('panel').params.surface.normal.rows).toEqual(['68']);
  cell.setLighting(undefined);expect(cell.lighting).toBeUndefined();cell.undo();expect(cell.lighting.ambient).toBe(0.25);
});
test('moving a shape moves global lamp and grid coordinates and undo restores their canonical state',()=>{
  const {cell}=fixture(),before=cell.toJSON();cell.moveShape('panel',1,2);
  expect(cell.shapes.getByName('panel').params.surface).toMatchObject({normal:{x:2,y:3},lamps:[{x:2,y:3}]});
  cell.undo();expect(cell.toJSON()).toEqual(before);cell.redo();expect(cell.shapes.getByName('panel').params.surface.lamps[0].y).toBe(3);
  expect(translateParams(before.shapes[0].params,2,1).surface).toMatchObject({normal:{x:3,y:2},lamps:[{x:3,y:2}]});
});
test('shape and whole-cell quarter turns move directions, grids, lamps and sky together',()=>{
  const {project,cell}=fixture();cell.setLighting({palettePolicy:'rgb',sky:1,skyDir:[1,-1]});
  cell.rotateShape('panel',90,{about:'cell'});
  expect(cell.shapes.getByName('panel').params.surface).toMatchObject({normal:{x:2,y:1,rows:['2','6']},lamps:[{x:2,y:1}]});
  cell.undo();project.cells.mirrorCell('0,0','horizontal');
  expect(cell.shapes.getByName('panel').params.surface).toMatchObject({normal:{x:1,y:1,rows:['84']},lamps:[{x:2,y:1}]});
  expect(cell.lighting.skyDir).toEqual([-1,-1]);cell.undo();expect(cell.lighting.skyDir).toEqual([1,-1]);
});
test('invalid surface updates and out-of-range metadata transforms fail without changing artwork or history',()=>{
  const {cell}=fixture(),before=cell.toJSON(),history=cell._undoStack.length;
  expect(()=>cell.updateShapeParams('panel',{surface:{normal:{mode:'unknown'}}})).toThrow();
  expect(()=>cell.moveShape('panel',1048576,0)).toThrow();
  expect(cell.toJSON()).toEqual(before);expect(cell._undoStack.length).toBe(history);
  expect(()=>cell.setLighting({ambient:1})).toThrow(/palettePolicy/);
});
test('lighting on an otherwise empty cell is retained in portable project data',()=>{
  const project=Project.create({name:'empty',cellSize:2,rows:1,cols:1,palette:'pico8'});project.cells.getCell('0,0').setLighting({palettePolicy:'nearest'});
  expect(Project.fromJSON(project.toJSON()).cells.getCell('0,0').lighting.palettePolicy).toBe('nearest');
});
test('portable active surface scenes validate palette and work bounds before opening',()=>{
  const {project}=fixture(),data=project.toJSON();data.cells['0,0'].lighting={palettePolicy:'nearest'};data.palette=[];
  expect(()=>Project.fromJSON(data)).toThrow(/opaque palette/);
  const oversized={...project.toJSON(),cellWidth:4096,cellHeight:4096};
  expect(()=>Project.fromJSON(oversized)).toThrow(/pixel count/);
});
