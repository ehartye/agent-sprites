import { Cell } from '../engine/cell.js';
import { publishPayload } from '../project-publication.js';

/** Publish synchronous edit messages only after every cell validates and commits. */
export function editCells(state, cells, edit) {
  const messages = [];
  const needsPayload = () => Boolean(state.broadcast) && (state.broadcast.needsPayload?.() ?? true);
  const broadcast = (message, createPayload) => {
    // Legacy deltas must follow the event-time geometry, even when a later
    // command mutates the same shape before this transaction commits.
    if (createPayload && needsPayload()) messages.push({ message: { ...message, ...createPayload() } });
    else messages.push({ message, createPayload });
  };
  broadcast.supportsLazyPayloads = true;
  broadcast.needsPayload = needsPayload;
  const scoped = { ...state, broadcast };
  const result = Cell.editAll(cells, () => edit(scoped));
  for (const { message, createPayload } of messages) {
    if (createPayload) publishPayload(state, message, createPayload);
    else state.broadcast?.(message);
  }
  return result;
}
