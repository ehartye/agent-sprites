import { applyComposition, compileComposition } from '../engine/composition.js';
import { publishProject } from '../project-publication.js';

export function handleCompositionPlan(state, params) {
  if (!state.project) throw new Error('No project open');
  return compileComposition(state.project, params);
}

export function handleComposition(state, params) {
  if (!state.project) throw new Error('No project open');
  const result = applyComposition(state.project, params);
  publishProject(state, { cell: params.cell });
  return result;
}
