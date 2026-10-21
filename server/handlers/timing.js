import { resolveFrameTiming, validateFrameDurations } from '../web/public/js/shared/timing.js';

export function handleDurationRead(state, { cell, group } = {}) {
  const project = state.project;
  if (!project) throw new Error('No active project');
  if (group !== undefined && !project.groups.get(group)) throw new Error(`Unknown animation group: ${group}`);
  const canonicalCell = project.cells.resolveRef(cell);
  const timing = resolveFrameTiming(project, canonicalCell, { group });
  return { cell: canonicalCell, ...(group === undefined ? {} : { group }), overrideMs: Object.hasOwn(project.frameDurations, canonicalCell) ? project.frameDurations[canonicalCell] : null, effectiveMs: timing.ms, source: timing.source };
}
export function handleDuration(state, params = {}) {
  if (!state.project) throw new Error('No active project');
  if (Object.keys(params).some(key => !['cell', 'ms', 'group'].includes(key)) || !Object.hasOwn(params, 'ms')) throw new Error('Duration requires cell and ms; use null to clear an override');
  const { cell } = handleDurationRead(state, params);
  const next = { ...state.project.frameDurations };
  if (params.ms === null) delete next[cell]; else next[cell] = params.ms;
  state.project.frameDurations = validateFrameDurations(next, state.project);
  state.broadcast?.({ type: 'animation_timing' });
  return handleDurationRead(state, params);
}
