import { readAsciiRegion, patchAsciiRegion } from '../engine/ascii-region.js';
import { publishProject } from '../project-publication.js';

export function handleAsciiRead(state, params) {
  if (!state.project) throw new Error('No project open');
  return readAsciiRegion(state.project.cells.getCell(params.cell), state.project.palette,
    { ...params, background: state.project.background });
}

export function handleAsciiPatch(state, params) {
  if (!state.project) throw new Error('No project open');
  const result = patchAsciiRegion(state.project.cells.getCell(params.cell), state.project.palette, params);
  if (result.changed) publishProject(state, { cell: params.cell });
  return result;
}
