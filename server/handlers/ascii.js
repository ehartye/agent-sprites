import { readAsciiRegion, patchAsciiRegion } from '../engine/ascii-region.js';

export function handleAsciiRead(state, params) {
  if (!state.project) throw new Error('No project open');
  return readAsciiRegion(state.project.cells.getCell(params.cell), state.project.palette,
    { ...params, background: state.project.background });
}

export function handleAsciiPatch(state, params) {
  if (!state.project) throw new Error('No project open');
  const result = patchAsciiRegion(state.project.cells.getCell(params.cell), state.project.palette, params);
  if (result.changed) state.broadcast?.({ type: 'project', data: state.project.toJSON(), sessionId: state.sessionId });
  return result;
}
