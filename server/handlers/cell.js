import fs from 'fs';

export function handleShiftCell(state, params) {
  if (!state.project) throw new Error('No project open');
  state.project.cells.shiftCell(params.cell, params.dx, params.dy);
  state.broadcast?.({ type: 'cell_shifted', cell: params.cell, dx: params.dx, dy: params.dy });
}

export function handleMirrorCell(state, params) {
  if (!state.project) throw new Error('No project open');
  state.project.cells.mirrorCell(params.cell, params.axis);
  state.broadcast?.({ type: 'cell_mirrored', cell: params.cell, axis: params.axis });
}

/** Attach (or clear, with path: null) a per-cell reference image for tracing. */
export function handleSetReference(state, params) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  if (params.path == null) {
    cell.reference = null;
  } else {
    if (!fs.existsSync(params.path)) throw new Error(`Reference image not found: ${params.path}`);
    cell.reference = { path: params.path, opacity: params.opacity ?? 0.35 };
  }
  state.broadcast?.({ type: 'cell_reference', cell: params.cell, reference: cell.reference });
  return cell.reference ? `Reference set on ${params.cell} (opacity ${cell.reference.opacity})` : `Reference cleared on ${params.cell}`;
}

export function handleRotateCell(state, params) {
  if (!state.project) throw new Error('No project open');
  state.project.cells.rotateCell(params.cell, params.deg);
  state.broadcast?.({ type: 'cell_rotated', cell: params.cell, deg: params.deg });
}

/**
 * Shape groups are stored per cell in SQLite, not on the cell object, so a
 * copied cell would otherwise arrive without them and a later recolor-group
 * on the copy would quietly touch nothing.
 */
function copyShapeGroups(state, from, to) {
  if (state.sessionId == null || typeof state.db?.getShapeGroups !== 'function' || typeof state.db?.setShapeGroup !== 'function') return;
  const groups = state.db.getShapeGroups(state.sessionId, from);
  for (const [name, shapes] of Object.entries(groups)) state.db.setShapeGroup(state.sessionId, to, name, shapes);
}

export function handleCopyCell(state, params) {
  if (!state.project) throw new Error('No project open');
  state.project.cells.copyCell(params.from, params.to);
  copyShapeGroups(state, params.from, params.to);
  state.broadcast?.({ type: 'cell_copied', from: params.from, to: params.to });
}

export function handleCloneFanout(state, params) {
  if (!state.project) throw new Error('No project open');
  const { from, to } = params;
  if (!Array.isArray(to) || to.length === 0) {
    throw new Error('clone-fanout requires non-empty "to" array');
  }
  if (!from) throw new Error('clone-fanout requires "from"');
  // Pre-validate everything before mutating: source exists, each destination
  // exists and differs from source. getCell throws on invalid refs, so this
  // aborts atomically before any copyCell runs.
  state.project.cells.getCell(from);
  for (const dest of to) {
    if (dest === from) throw new Error(`clone-fanout: source "${from}" is the same as a destination`);
    state.project.cells.getCell(dest);
  }
  for (const dest of to) {
    state.project.cells.copyCell(from, dest);
    copyShapeGroups(state, from, dest);
  }
  state.broadcast?.({ type: 'cell_cloned_fanout', from, to });
  return { cloned: [...to] };
}

export function handleClearCell(state, params) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  cell.clear();
  state.broadcast?.({ type: 'cell_cleared', cell: params.cell });
}

export function handleNameCell(state, params) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  cell.name = params.name;
  state.broadcast?.({ type: 'cell_named', cell: params.cell, name: params.name });
}

export function handleListCells(state, _params) {
  if (!state.project) throw new Error('No project open');
  return state.project.cells.listCells();
}
