import { GroupManager } from './engine/group-manager.js';

function cellAlias(state, ref) {
  const name = state.project.cells.getCell(ref).name;
  try { return name && name !== ref && state.project.cells.resolveRef(name) === ref ? name : null; }
  catch { return null; } // Coordinate-like names do not always resolve as aliases.
}

/** Canonical metadata wins over a still-valid legacy alias on name collisions. */
export function getCellShapeGroups(state, ref) {
  if (state.sessionId == null || typeof state.db?.getShapeGroups !== 'function') return {};
  const alias = cellAlias(state, ref);
  return Object.fromEntries([
    ...Object.entries(alias ? state.db.getShapeGroups(state.sessionId, alias) : {}),
    ...Object.entries(state.db.getShapeGroups(state.sessionId, ref)),
  ]);
}

/** Migrate only the alias currently owned by this cell before an explicit edit. */
export function canonicalizeCellShapeGroups(state, ref) {
  if (state.sessionId == null || typeof state.db?.migrateShapeGroupAlias !== 'function') return;
  const alias = cellAlias(state, ref);
  if (alias) state.db.migrateShapeGroupAlias(state.sessionId, alias, ref);
}

// SQLite owns live editing metadata; portable project files must carry it too.
export function captureProjectMetadata(state) {
  if (!state.project || !state.sessionId) return;
  state.project.groups = GroupManager.fromJSON(state.db.getCellGroups(state.sessionId));
  state.project.animationFps = state.db.getCellGroupFps(state.sessionId);
  state.project.animationDirections = state.db.getCellGroupDirections(state.sessionId);
  state.project.shapeGroups = state.db.getAllShapeGroups(state.sessionId);
}

export function restoreProjectMetadata(state) {
  for (const [name, cells] of Object.entries(state.project.groups.toJSON())) {
    state.db.setCellGroup(state.sessionId, name, cells);
    if (Object.hasOwn(state.project.animationFps, name) && state.project.animationFps[name] != null) state.db.setCellGroupFps(state.sessionId, name, state.project.animationFps[name]);
    if (Object.hasOwn(state.project.animationDirections, name) && state.project.animationDirections[name] != null) state.db.setCellGroupDirection(state.sessionId, name, state.project.animationDirections[name]);
  }
  for (const [cell, groups] of Object.entries(state.project.shapeGroups))
    for (const [name, shapes] of Object.entries(groups)) state.db.setShapeGroup(state.sessionId, cell, name, shapes);
}
