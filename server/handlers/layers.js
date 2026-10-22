import { editLayer } from '../engine/shape-layers.js';
import { buildLayerTree } from '../web/public/js/shared/shape-layers.js';
import { publishPayload } from '../project-publication.js';

function selectedCell(state, ref) {
  if (!state.project) throw new Error('No active project');
  const canonical=state.project.cells.resolveRef(ref);
  return {cell:state.project.cells.getCell(canonical),ref:canonical};
}

export function handleLayerList(state, {cell:selection} = {}) {
  const {cell,ref}=selectedCell(state,selection), shapes=cell.shapes.listByZ();
  buildLayerTree(shapes,cell.width,cell.height);
  const layers=new Map();
  for(const shape of shapes) for(const [index,layer] of (shape.params.layers??[]).entries()) {
    if(!layers.has(layer.id)) layers.set(layer.id,{...structuredClone(layer),parent:shape.params.layers[index-1]?.id??null,members:[]});
    layers.get(layer.id).members.push(shape.name??shape.id);
  }
  return {cell:ref,layers:[...layers.values()]};
}

export function handleLayerEdit(state, {cell:selection,...options} = {}) {
  const {cell,ref}=selectedCell(state,selection),result=editLayer(cell,options);
  if(result.changed) publishPayload(state,{type:'cell_update',cell:ref},()=>({cellData:cell.toJSON()}));
  return result;
}
