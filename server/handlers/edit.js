import { Cell } from '../engine/cell.js';

/** Publish synchronous edit messages only after every cell validates and commits. */
export function editCells(state, cells, edit) {
  const messages = [];
  const scoped = { ...state, broadcast: message => messages.push(message) };
  const result = Cell.editAll(cells, () => edit(scoped));
  for (const message of messages) state.broadcast?.(message);
  return result;
}
