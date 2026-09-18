import { GroupManager } from './engine/group-manager.js';

// SQLite owns live editing metadata; portable project files must carry it too.
export function captureProjectMetadata(state) {
  if (!state.project || !state.sessionId) return;
  state.project.groups = GroupManager.fromJSON(state.db.getCellGroups(state.sessionId));
  state.project.animationFps = state.db.getCellGroupFps(state.sessionId);
  state.project.shapeGroups = state.db.getAllShapeGroups(state.sessionId);
}

export function restoreProjectMetadata(state) {
  for (const [name, cells] of Object.entries(state.project.groups.toJSON())) {
    state.db.setCellGroup(state.sessionId, name, cells);
    if (state.project.animationFps[name] != null) state.db.setCellGroupFps(state.sessionId, name, state.project.animationFps[name]);
  }
  for (const [cell, groups] of Object.entries(state.project.shapeGroups))
    for (const [name, shapes] of Object.entries(groups)) state.db.setShapeGroup(state.sessionId, cell, name, shapes);
}
