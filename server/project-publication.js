/** Runtime publication is lazy; small handler test states retain their old API. */
export function publishProject(state, change = {}) {
  if (state.broadcastProject) state.broadcastProject(change);
  else state.broadcast?.({ type: 'project', data: state.project.toJSON(), sessionId: state.sessionId, ...change });
}
