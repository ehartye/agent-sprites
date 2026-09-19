export function handleNameShape(state, params) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  cell.shapes.nameShape(params.shape_id, params.name);
  state.broadcast?.({ type: 'shape_named', cell: params.cell, shapeId: params.shape_id, name: params.name });
}

export function handleMoveShape(state, params) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  cell.moveShape(params.name, params.dx, params.dy);
  state.broadcast?.({ type: 'shape_moved', cell: params.cell, name: params.name, dx: params.dx, dy: params.dy });
}

export function handleRecolorShape(state, params) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  cell.recolorShape(params.name, params.color, params.color2);
  state.broadcast?.({ type: 'shape_recolored', cell: params.cell, name: params.name, color: params.color, color2: params.color2 });
}

export function handleDeleteShape(state, params) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  cell.deleteShape(params.name);
  state.broadcast?.({ type: 'shape_deleted', cell: params.cell, name: params.name });
}

export function handleListShapes(state, params) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  return cell.shapes.listByZ().map((s) => s.toJSON());
}

export function handleSetZ(state, params) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  cell.setZ(params.name, params.z);
  state.broadcast?.({ type: 'shape_z', cell: params.cell, name: params.name, z: params.z });
}

/** Clone a shape from one cell to another, optionally giving it a new name. */
export function handleCloneShape(state, params) {
  if (!state.project) throw new Error('No project open');
  const srcCell = state.project.cells.getCell(params.from_cell);
  const dstCell = state.project.cells.getCell(params.to_cell);
  const shape = srcCell.shapes.get(params.shape);
  if (!shape) throw new Error(`Shape "${params.shape}" not found`);
  const newShape = dstCell.draw(shape.type, { ...shape.params }, shape.color, params.new_name ?? null);
  state.broadcast?.({ type: 'draw', cell: params.to_cell, shape: newShape.toJSON() });
  return { shapeId: newShape.id };
}

/** Update shape dimensions in-place (w/h for rect, r for circle, rx/ry for ellipse, etc.). */
export function handleResizeShape(state, params) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  cell.updateShapeParams(params.shape, params.updates);
  state.broadcast?.({ type: 'shape_resized', cell: params.cell });
}

/** Move a shape to an absolute pixel position. */
export function handleMoveShapeTo(state, params) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  const shape = cell.shapes.get(params.shape);
  if (!shape) throw new Error(`Shape "${params.shape}" not found`);
  const p = shape.params;
  let dx = 0, dy = 0;
  if ('cx' in p) { dx = params.x - p.cx; dy = params.y - p.cy; }
  else if ('x1' in p) { dx = params.x - p.x1; dy = params.y - p.y1; }
  else if ('points' in p) { dx = params.x - p.points[0].x; dy = params.y - p.points[0].y; }
  else if ('x' in p) { dx = params.x - p.x; dy = params.y - p.y; }
  cell.moveShape(params.shape, dx, dy);
  state.broadcast?.({ type: 'shape_moved', cell: params.cell });
}

/** Flip a shape about its own bbox center (default) or the cell. */
export function handleFlipShape(state, params) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  cell.flipShape(params.name, params.axis, { about: params.about });
  state.broadcast?.({ type: 'shape_flipped', cell: params.cell, name: params.name, axis: params.axis });
}

/** Rotate a shape 90/180/270 CW about its own bbox center (default) or the cell. */
export function handleRotateShape(state, params) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  cell.rotateShape(params.name, params.deg, { about: params.about });
  state.broadcast?.({ type: 'shape_rotated', cell: params.cell, name: params.name, deg: params.deg });
}

/** Duplicate a shape within its cell, optionally mirrored across the cell —
 *  the wing_l -> wing_r idiom as one op. */
export function handleDuplicateShape(state, params) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  const src = cell.shapes.get(params.shape);
  if (!src) throw new Error(`Shape "${params.shape}" not found`);
  const name = params.as ?? `${params.shape}_copy`;
  const copy = cell.draw(src.type, src.params, src.color, name);
  if (params.mirror) cell.flipShape(name, params.mirror, { about: 'cell' });
  state.broadcast?.({ type: 'draw', cell: params.cell, shape: copy.toJSON() });
  return { shapeId: copy.id, shapeName: name };
}

const TWEEN_EASE = {
  'linear': t => t,
  'in': t => t * t,
  'out': t => 1 - (1 - t) * (1 - t),
  'in-out': t => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
};

/**
 * Interpolate a shape's position and/or numeric params across every frame of
 * a cell group in one call. Start values default to the shape's state in the
 * group's first frame. Composes move-to/resize per frame, so each frame's
 * edit stays individually undoable.
 */
export function handleTweenShape(state, params) {
  if (!state.project) throw new Error('No project open');
  const { group, shape: shapeName, to, from, to_updates, from_updates } = params;
  const cells = state.db?.getCellGroups?.(state.sessionId)?.[group];
  if (!cells || cells.length < 2) throw new Error(`Group "${group}" not found or has fewer than 2 cells`);
  const ease = TWEEN_EASE[params.ease ?? 'linear'];
  if (!ease) throw new Error(`Unknown ease "${params.ease}" (use linear|in|out|in-out)`);
  if (!to && !to_updates) throw new Error('tween needs "to" and/or "to_updates"');

  const src = state.project.cells.getCell(cells[0]).shapes.get(shapeName);
  if (!src) throw new Error(`Shape "${shapeName}" not found in ${cells[0]}`);
  const p = src.params;
  const anchor = 'cx' in p ? { x: p.cx, y: p.cy }
    : 'x1' in p ? { x: p.x1, y: p.y1 }
    : 'points' in p ? { x: p.points[0].x, y: p.points[0].y }
    : { x: p.x, y: p.y };
  const start = from ?? anchor;

  let startUpdates = null;
  if (to_updates) {
    startUpdates = { ...(from_updates ?? {}) };
    for (const k of Object.keys(to_updates)) {
      if (!(k in startUpdates)) {
        if (typeof p[k] !== 'number') throw new Error(`Cannot tween "${k}": not a numeric param of "${shapeName}"`);
        startUpdates[k] = p[k];
      }
    }
  }

  const n = cells.length;
  for (let i = 0; i < n; i++) {
    const t = ease(i / (n - 1));
    const cell = cells[i];
    if (to) {
      handleMoveShapeTo(state, {
        cell,
        shape: shapeName,
        x: Math.round(start.x + (to.x - start.x) * t),
        y: Math.round(start.y + (to.y - start.y) * t),
      });
    }
    if (to_updates) {
      const updates = {};
      for (const k of Object.keys(to_updates)) {
        updates[k] = Math.round(startUpdates[k] + (to_updates[k] - startUpdates[k]) * t);
      }
      handleResizeShape(state, { cell, shape: shapeName, updates });
    }
  }
  return { frames: n };
}

/** Move a shape one step up or down in z-order by swapping with its neighbor. */
export function handleShapeZDirection(state, params) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  const shapes = cell.shapes.listByZ();
  const idx = shapes.findIndex(s => s.id === params.shape || s.name === params.shape);
  if (idx === -1) throw new Error(`Shape "${params.shape}" not found`);

  let swapIdx = -1;
  if (params.direction === 'up' && idx < shapes.length - 1) swapIdx = idx + 1;
  if (params.direction === 'down' && idx > 0) swapIdx = idx - 1;

  if (swapIdx !== -1) {
    const a = shapes[idx];
    const b = shapes[swapIdx];
    const tmp = a.zIndex;
    a.zIndex = b.zIndex;
    b.zIndex = tmp;
  }
  state.broadcast?.({ type: 'shape_z', cell: params.cell });
}
