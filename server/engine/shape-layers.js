import { buildLayerTree, translateParams } from '../web/public/js/shared/shape-layers.js';

function integer(value, label) {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
}

function apply(cell, changes) {
  const proposed = cell.shapes.listByZ().map(shape => ({ ...shape, params: changes.get(shape.id) ?? shape.params }));
  buildLayerTree(proposed, cell.width, cell.height);
  return cell.transaction(() => {
    const shapes = [];
    for (const shape of cell.shapes.listByZ()) if (changes.has(shape.id)) {
      cell.updateShapeParams(shape.id, changes.get(shape.id)); shapes.push(shape.toJSON());
    }
    return { changed: shapes.length, shapes };
  });
}

/** Move/order a retained layer and all descendant members as one reversible edit. */
export function editLayer(cell, options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Layer edit must be an object');
  for (const key of Object.keys(options)) if (!['id', 'dx', 'dy', 'z'].includes(key)) throw new Error(`Unknown layer edit field "${key}"`);
  const { id, dx = 0, dy = 0, z } = options;
  if (typeof id !== 'string' || !id.length) throw new Error('Layer id must be a nonempty string');
  integer(dx, 'Layer dx'); integer(dy, 'Layer dy'); if (z !== undefined) integer(z, 'Layer z');
  const shapes = cell.shapes.listByZ(), changes = new Map();
  buildLayerTree(shapes, cell.width, cell.height);
  let found = false;
  for (const shape of shapes) {
    const index = shape.params.layers?.findIndex(layer => layer.id === id) ?? -1;
    if (index < 0) continue;
    found = true;
    const params = translateParams(shape.params, dx, dy);
    for (const layer of params.layers.slice(index)) { layer.x += dx; layer.y += dy; }
    if (z !== undefined) params.layers[index].z = z;
    if (JSON.stringify(params) !== JSON.stringify(shape.params)) changes.set(shape.id, params);
  }
  if (!found) throw new Error(`Layer "${id}" not found`);
  return apply(cell, changes);
}

/** Move a selection; only fully selected layers move their own clipping origins. */
export function moveLayerSelection(cell, refs, dx, dy) {
  integer(dx, 'Move dx'); integer(dy, 'Move dy');
  const shapes = cell.shapes.listByZ(), selected = new Set(), members = new Map();
  buildLayerTree(shapes, cell.width, cell.height);
  for (const ref of refs) {
    const shape = cell.shapes.get(ref);
    if (!shape) throw new Error(`Shape "${ref}" not found`);
    selected.add(shape.id);
  }
  for (const shape of shapes) for (const layer of shape.params.layers ?? []) {
    if (!members.has(layer.id)) members.set(layer.id, []);
    members.get(layer.id).push(shape.id);
  }
  const complete = new Set([...members].filter(([, ids]) => ids.every(id => selected.has(id))).map(([id]) => id));
  const changes = new Map();
  for (const shape of shapes) if (selected.has(shape.id)) {
    const params = translateParams(shape.params, dx, dy);
    for (const layer of params.layers ?? []) if (complete.has(layer.id)) { layer.x += dx; layer.y += dy; }
    changes.set(shape.id, params);
  }
  return apply(cell, changes);
}

/** Transform every primitive and its global layer rectangles together, atomically. */
export function transformLayerCell(cell, transform) {
  const changes = new Map();
  for (const shape of cell.shapes.listByZ()) {
    const params = structuredClone(shape.params);
    transform(params);
    for (const layer of params.layers ?? []) transform(layer);
    changes.set(shape.id, params);
  }
  return apply(cell, changes);
}
