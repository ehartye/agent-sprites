import { applyComposition, compileComposition } from '../engine/composition.js';

export function handleCompositionPlan(state, params) {
  if (!state.project) throw new Error('No project open');
  return compileComposition(state.project, params);
}

export function handleComposition(state, params) {
  if (!state.project) throw new Error('No project open');
  const result = applyComposition(state.project, params);
  state.broadcast?.({ type: 'project', data: state.project.toJSON(), sessionId: state.sessionId });
  return result;
}
