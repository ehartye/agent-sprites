import {validateSurface,validateLighting} from '../web/public/js/shared/surface-model.js';
import {validateSurfaceScene} from '../web/public/js/shared/surface-raster.js';
import {CanvasRenderer} from '../engine/canvas-renderer.js';
import {publishPayload} from '../project-publication.js';

function fields(value,allowed){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Surface request must be an object');
  for(const key of Object.keys(value))if(!allowed.includes(key))throw new Error(`Unknown surface request field "${key}"`);
}
function selected(state,ref){
  if(!state.project)throw new Error('No active project');
  if(typeof ref!=='string'||!ref.length)throw new Error('Surface authoring requires a cell');
  const canonical=state.project.cells.resolveRef(ref);
  return {cell:state.project.cells.getCell(canonical),ref:canonical};
}
function shapeFor(cell,params){
  if(Object.hasOwn(params,'shape')===Object.hasOwn(params,'shapeId'))throw new Error('Choose exactly one shape name or shapeId');
  const value=params.shape??params.shapeId;
  if(typeof value!=='string'||!value.length)throw new Error('Choose a nonempty shape name or shapeId');
  const shape=Object.hasOwn(params,'shape')?cell.shapes.getByName(value):cell.shapes.getById(value);
  if(!shape)throw new Error(`Surface shape "${value}" not found`);
  return shape;
}
function validate(state,cell,shapes=cell.shapes.listByZ(),lighting=cell.lighting){
  return validateSurfaceScene({shapes,width:cell.width,height:cell.height,lighting,background:state.project.background,palette:state.project.palette.toJSON()});
}
function broadcast(state,cell,ref){publishPayload(state,{type:'cell_update',cell:ref},()=>({cellData:cell.toJSON()}));}
export function handleSurfaceRead(state,params){
  fields(params,['cell','shape','shapeId']);
  const {cell,ref}=selected(state,params.cell),shape=shapeFor(cell,params);
  return {cell:ref,shape:{id:shape.id,name:shape.name},surface:structuredClone(shape.params.surface??null)};
}
export function handleSurfaceWrite(state,params){
  fields(params,['cell','shape','shapeId','surface']);
  if(!Object.hasOwn(params,'surface'))throw new Error('surface is required; null clears it');
  const {cell,ref}=selected(state,params.cell),shape=shapeFor(cell,params);
  const surface=params.surface===null?undefined:validateSurface(params.surface),proposed=structuredClone(shape.params);
  if(surface===undefined)delete proposed.surface;else proposed.surface=surface;
  validate(state,cell,cell.shapes.listByZ().map(item=>item===shape?{...shape,params:proposed}:item));
  if(cell.setShapeSurface(shape,surface))broadcast(state,cell,ref);
  return handleSurfaceRead(state,{cell:ref,shapeId:shape.id});
}
export function handleLightingRead(state,params){
  fields(params,['cell']);const {cell,ref}=selected(state,params.cell);
  return {cell:ref,lighting:structuredClone(cell.lighting??null)};
}
export function handleLightingWrite(state,params){
  fields(params,['cell','lighting']);
  if(!Object.hasOwn(params,'lighting'))throw new Error('lighting is required; null clears it');
  const {cell,ref}=selected(state,params.cell),lighting=params.lighting===null?undefined:validateLighting(params.lighting);
  // Avoid the default argument restoring the old value when explicitly clearing.
  validateSurfaceScene({shapes:cell.shapes.listByZ(),width:cell.width,height:cell.height,lighting,background:state.project.background,palette:state.project.palette.toJSON()});
  if(cell.setLighting(lighting))broadcast(state,cell,ref);
  return handleLightingRead(state,{cell:ref});
}
export function handleSurfacePreview(state,params){
  fields(params,['cell','channel']);const {cell,ref}=selected(state,params.cell),channel=params.channel??'color';
  if(!['color','normal','light'].includes(channel))throw new Error('Surface channel must be color, normal or light');
  const renderer=new CanvasRenderer(state.project.palette,{background:state.project.background});
  return {cell:ref,channel,width:cell.width,height:cell.height,image:`data:image/png;base64,${renderer.renderCell(cell,{channel}).toString('base64')}`};
}
