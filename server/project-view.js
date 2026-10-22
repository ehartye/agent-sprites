import { randomUUID } from 'node:crypto';

const views = new WeakMap();
export const FRAME_LIMITS = Object.freeze({ maxQueryBytes: 2048, maxRefs: 8, maxResponseBytes: 8 * 1024 * 1024 });
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const renderContext = project => JSON.stringify([project.palette.toJSON(), project.background]);

// Identity belongs to the live object and session, never the portable file.
export function projectView(state) {
  let view = views.get(state);
  if (!view) { view = { revision: 0, project: null, sessionId: null }; views.set(state, view); }
  if (view.project !== state.project || view.sessionId !== state.sessionId) {
    view.project = state.project; view.sessionId = state.sessionId;
    view.projectId = randomUUID(); view.revision++; view.cellVersions = {};
    view.renderContext = state.project ? renderContext(state.project) : null;
    if (state.project) for (let r = 0; r < state.project.cells.rows; r++) for (let c = 0; c < state.project.cells.cols; c++) view.cellVersions[`${r},${c}`] = view.revision;
  }
  return view;
}

/** Broadcasts already describe the mutation boundary; only geometry targets expire. */
export function invalidateProject(state, message) {
  const view = projectView(state);
  if (!view.project) return;
  view.revision++;
  const context = renderContext(view.project), contextChanged = context !== view.renderContext;
  view.renderContext = context;
  if (contextChanged) {
    for (const ref of Object.keys(view.cellVersions)) view.cellVersions[ref] = view.revision;
    return;
  }
  if (message.metadataOnly || ['animation_timing', 'group_cells_added'].includes(message.type) ||
      (message.type === 'group_created' && message.groupKind === 'cell')) return;
  // Copy/fanout sources are read-only. Other multi-cell edits may name cells.
  const targets = message.to ?? message.cells ?? message.cell ?? message.from;
  if (targets !== undefined) {
    try {
      for (const target of Array.isArray(targets) ? targets : [targets]) {
        view.cellVersions[view.project.cells.resolveRef(target)] = view.revision;
      }
      return;
    } catch { /* Unknown targets invalidate conservatively. */ }
  }
  for (const ref of Object.keys(view.cellVersions)) view.cellVersions[ref] = view.revision;
}

function requireProject(state) {
  if (!state.project || !state.sessionId) throw fail('No active project');
  return projectView(state);
}

function shapeGroupIndex(state, project) {
  const rows = state.db ? state.db.getShapeGroupIndex(state.sessionId) : Object.entries(project.shapeGroups).flatMap(([cell, groups]) => Object.keys(groups).map(name => ({ cell, name })));
  return rows.flatMap(({ cell, name }) => {
    try { return [{ cell: project.cells.resolveRef(cell), storedCell: cell, name }]; }
    // Older databases can contain unbound aliases or orphan rows. Keep them in
    // storage; they have no frame membership in the current project.
    catch { return []; }
  });
}

export function projectSummary(state) {
  const view = requireProject(state), project = view.project;
  const cells = {};
  for (const ref of Object.keys(view.cellVersions)) {
    const cell = project.cells.getCell(ref);
    cells[ref] = { name: cell.name, reference: cell.reference, shapeCount: cell.shapes._byId.size,
      version: view.cellVersions[ref], ...(cell.lighting === undefined ? {} : { lighting: cell.lighting }) };
  }
  const live = state.db && state.sessionId;
  const groupNames = new Map();
  for (const { cell, name } of shapeGroupIndex(state, project)) {
    if (!groupNames.has(cell)) groupNames.set(cell, new Set());
    groupNames.get(cell).add(name);
  }
  const shapeGroups = Object.fromEntries([...groupNames].map(([cell, names]) => [cell, [...names]]));
  return { sessionId: view.sessionId, projectId: view.projectId, revision: view.revision,
    version: 1, storageVersion: project.storageVersion ?? 1, name: project.name, cellWidth: project.cellWidth, cellHeight: project.cellHeight,
    grid: { rows: project.cells.rows, cols: project.cells.cols }, palette: project.palette.toJSON(),
    background: project.background, pivot: project.pivot,
    groups: live ? state.db.getCellGroups(state.sessionId) : project.groups.toJSON(),
    animationFps: live ? state.db.getCellGroupFps(state.sessionId) : project.animationFps,
    animationDirections: live ? state.db.getCellGroupDirections(state.sessionId) : project.animationDirections,
    frameDurations: project.frameDurations, animationLoops: project.animationLoops,
    review: project.review, constructionReplayAvailable: Boolean(project.constructionReplay),
    cells, cellVersions: { ...view.cellVersions }, shapeGroups };
}

export function assertProjectPins(state, pins) {
  if (typeof pins.sessionId !== 'string' || !pins.sessionId || typeof pins.projectId !== 'string' || !pins.projectId ||
      !((typeof pins.revision === 'number' && Number.isSafeInteger(pins.revision) && pins.revision >= 0) ||
        (typeof pins.revision === 'string' && /^(0|[1-9]\d*)$/.test(pins.revision) && Number.isSafeInteger(Number(pins.revision))))) {
    throw fail('sessionId, projectId and revision pins are required');
  }
  const view = projectView(state);
  if (!state.project || pins.sessionId !== view.sessionId || pins.projectId !== view.projectId || Number(pins.revision) !== view.revision) {
    throw fail('The active project changed. Refresh the design before editing or fetching frames.', 409);
  }
  return view;
}

export function assertOptionalProjectPins(state, pins) {
  if (pins.projectId !== undefined || pins.revision !== undefined) return assertProjectPins(state, pins);
}

export function frameLimits(options = {}) {
  return Object.fromEntries(Object.entries(FRAME_LIMITS).map(([key, value]) => {
    const limit = options[key] ?? value;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > value) throw new Error(`Invalid trusted frame limit: ${key}`);
    return [key, limit];
  }));
}

const oversizedFrames = () => fail('Selected frame response exceeds the byte limit; request fewer or smaller frames', 413);

// Preflight canonical JSON values without cloning geometry or allocating an
// unbounded encoded string. Escaping and UTF-8 counts match JSON.stringify.
function jsonBytes(value, limit, ancestors = new Set()) {
  const check = bytes => { if (bytes > limit) throw oversizedFrames(); return bytes; };
  if (typeof value === 'string') {
    let bytes = 2;
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code === 34 || code === 92 || (code >= 8 && code <= 13 && code !== 11)) bytes += 2;
      else if (code < 32) bytes += 6;
      else if (code >= 0xd800 && code <= 0xdbff && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
      else if (code >= 0xd800 && code <= 0xdfff) bytes += 6;
      else bytes += code < 128 ? 1 : code < 2048 ? 2 : 3;
      check(bytes);
    }
    return check(bytes);
  }
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? undefined : check(Buffer.byteLength(encoded));
  }
  if (typeof value.toJSON === 'function') return jsonBytes(value.toJSON(), limit, ancestors);
  if (ancestors.has(value)) throw new TypeError('Cannot serialize cyclic frame metadata');
  ancestors.add(value);
  let bytes = 2, count = 0;
  check(bytes);
  try {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (count++) bytes++;
        bytes += jsonBytes(item, limit - bytes, ancestors) ?? 4;
        check(bytes);
      }
    } else {
      for (const key of Object.keys(value)) {
        const item = value[key];
        if (item === undefined || typeof item === 'function' || typeof item === 'symbol') continue;
        if (count++) bytes++;
        bytes += jsonBytes(key, limit - bytes, ancestors) + 1;
        check(bytes);
        bytes += jsonBytes(item, limit - bytes, ancestors);
        check(bytes);
      }
    }
    return bytes;
  } finally { ancestors.delete(value); }
}

function frameResponseWriter(maxBytes) {
  const chunks = []; let bytes = 0, buffer = '';
  const raw = encoded => {
    bytes += Buffer.byteLength(encoded);
    if (bytes > maxBytes) throw oversizedFrames();
    buffer += encoded;
    if (buffer.length >= 65536) { chunks.push(buffer); buffer = ''; }
  };
  return { raw, remaining: () => maxBytes - bytes,
    value(value) { jsonBytes(value, maxBytes - bytes); raw(JSON.stringify(value)); },
    finish() { chunks.push(buffer); return chunks.join(''); } };
}

// Validation and serialization share one synchronous identity/revision snapshot.
export function projectFrames(state, query, rawQuery, limits = FRAME_LIMITS) {
  if (Buffer.byteLength(rawQuery) > limits.maxQueryBytes) throw fail('Frame query is too long');
  if (typeof query.refs !== 'string') throw fail('Provide 1–8 distinct canonical cell refs');
  const refs = query.refs.split('|');
  if (refs.length < 1 || refs.length > limits.maxRefs || new Set(refs).size !== refs.length || refs.some(ref => !/^(0|[1-9]\d*),(0|[1-9]\d*)$/.test(ref))) throw fail('Provide 1–8 distinct canonical cell refs');
  const view = assertProjectPins(state, query), project = view.project;
  for (const ref of refs) if (!Object.hasOwn(view.cellVersions, ref)) throw fail(`Cell ${ref} is outside the project grid`);
  const output = frameResponseWriter(limits.maxResponseBytes);
  output.raw('{"ok":true,"data":{"sessionId":'); output.value(view.sessionId);
  output.raw(',"projectId":'); output.value(view.projectId);
  output.raw(',"revision":'); output.value(view.revision);
  output.raw(',"cells":{');
  let count = 0;
  for (const ref of refs) {
    if (count++) output.raw(',');
    output.value(ref); output.raw(':{"name":');
    const cell = project.cells.getCell(ref);
    output.value(cell.name); output.raw(',"reference":'); output.value(cell.reference);
    output.raw(',"shapes":[');
    if (cell.shapes._byId.size * 3 - 1 > output.remaining()) throw oversizedFrames();
    let shapes = 0;
    for (const shape of cell.shapes.listByZ()) {
      if (shapes++) output.raw(',');
      // Cell/Shape.toJSON clone complete arrays/params. This synchronous view
      // carries the same portable fields and stops at the first known overflow.
      output.value({ id: shape.id, name: shape.name, type: shape.type, params: shape.params,
        color: shape.color, zIndex: shape.zIndex, visible: shape.visible });
    }
    output.raw(']');
    if (cell.lighting !== undefined) { output.raw(',"lighting":'); output.value(cell.lighting); }
    output.raw('}');
  }
  output.raw('},"cellVersions":'); output.value(Object.fromEntries(refs.map(ref => [ref, view.cellVersions[ref]])));
  output.raw(',"shapeGroups":{');
  const index = shapeGroupIndex(state, project); count = 0;
  for (const ref of refs) {
    if (count++) output.raw(',');
    output.value(ref); output.raw(':{');
    const matching = index.filter(row => row.cell === ref);
    const groups = new Map([...matching.filter(row => row.storedCell !== ref), ...matching.filter(row => row.storedCell === ref)].map(row => [row.name, row.storedCell]));
    let names = 0;
    for (const [name, storedCell] of groups) {
      if (names++) output.raw(',');
      output.value(name); output.raw(':');
      if (state.db) {
        const json = state.db.getShapeGroupJSON(view.sessionId, storedCell, name, output.remaining());
        if (json === null) throw oversizedFrames();
        if (json === undefined) throw fail('Shape group changed during frame read; refresh the design', 409);
        output.value(JSON.parse(json));
      } else output.value(project.shapeGroups[storedCell][name]);
    }
    output.raw('}');
  }
  output.raw('}}}');
  return output.finish();
}
