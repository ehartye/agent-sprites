/** Runtime publication is lazy; small handler test states retain their old API. */
export function publishProject(state, change = {}) {
  if (state.broadcastProject) state.broadcastProject(change);
  else state.broadcast?.({ type: 'project', data: state.project.toJSON(), sessionId: state.sessionId, ...change });
}

/** Delay publication-only geometry until a recipient needs the legacy payload. */
export function publishPayload(state, message, createPayload) {
  if (state.broadcast?.supportsLazyPayloads) state.broadcast(message, createPayload);
  else state.broadcast?.({ ...message, ...createPayload() });
}
