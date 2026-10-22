import { buildLayerTree, translateGeometryParams, validateLayers } from '../web/public/js/shared/shape-layers.js';
import { patternTest } from './patterns.js';
import { surfacePrimitiveWork, validateSurfaceScene } from '../web/public/js/shared/surface-raster.js';
import { SURFACE_LIMITS, validateSurface } from '../web/public/js/shared/surface-model.js';
import { snapParams } from '../web/public/js/shared/raster.js';

export const PROJECT_LIMITS = Object.freeze({ maxCells: 10000, maxShapes: 200000, maxGeometry: 200000, maxDepth: 64 });
// Root project -> geometry dictionary -> entry -> params.
export const SHARED_PARAMS_DEPTH = 3;
const map = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const geometry = { point: ['x', 'y'], fill: ['x', 'y'], line: ['x1', 'y1', 'x2', 'y2'], rect: ['x', 'y', 'w', 'h'], circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'], polygon: ['points'], polyline: ['points'] };
const finiteGeometry = value => Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;

/** Reject unsupported values and cycles before cloning, canonicalizing or allocating a model. */
export function validateProjectJSON(value, maxDepth = PROJECT_LIMITS.maxDepth, initialDepth = 0) {
  const ancestors = new Set();
  const visit = (entry, depth, path) => {
    if (depth > maxDepth) throw new Error(`Project JSON depth exceeds ${maxDepth}`);
    if (entry === null || ['string', 'boolean'].includes(typeof entry)) return;
    if (typeof entry === 'number' && Number.isFinite(entry)) return;
    if (!Array.isArray(entry) && !map(entry)) throw new Error(`Unsupported Project JSON value at ${path}`);
    if (ancestors.has(entry)) throw new Error('Project JSON must not contain cycles');
    ancestors.add(entry);
    for (const key of Reflect.ownKeys(entry)) {
      if (Array.isArray(entry) && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(entry, key);
      if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('Project contains an unsupported JSON property');
      visit(descriptor.value, depth + 1, `${path}[${JSON.stringify(key)}]`);
    }
    if (Array.isArray(entry)) {
      const keys = Object.keys(entry);
      if (keys.length !== entry.length || keys.some((key, index) => key !== String(index))) throw new Error('Project JSON arrays must be dense and contain only indexed values');
    }
    ancestors.delete(entry);
  };
  visit(value, initialDepth, '$');
}

function validateGeometry(type, params, valid, label) {
  for (const key of geometry[type]) {
    if (key === 'points') {
      if (!Array.isArray(params.points) || params.points.length < (type === 'polygon' ? 3 : 2) || params.points.some(point => !map(point) || ![point.x, point.y].every(valid))) throw new Error(`Invalid shape ${label}: points`);
    } else if (!valid(params[key])) throw new Error(`Invalid shape ${label}: ${key}`);
  }
}

function validateRasterShapes(shapes, width, height) {
  let rasterWork = 0;
  const validate = (shape, params, w, h) => {
    const snapped = snapParams(params);
    validateGeometry(shape.type, snapped, Number.isSafeInteger, 'raster coordinates');
    const bounds = shape.type === 'rect' ? [snapped.x + snapped.w, snapped.y + snapped.h]
      : shape.type === 'circle' ? [snapped.cx - snapped.r, snapped.cx + snapped.r, snapped.cy - snapped.r, snapped.cy + snapped.r]
        : shape.type === 'ellipse' ? [snapped.cx - snapped.rx, snapped.cx + snapped.rx, snapped.cy - snapped.ry, snapped.cy + snapped.ry] : [];
    if (!bounds.every(Number.isSafeInteger)) throw new Error('Invalid shape raster stepping bounds');
    // Match the translated parameters used by native painting, including retained clips.
    const local = { ...shape, params };
    const cheapRect = shape.type === 'rect' && !(params.filled && params.pattern && params.color2 != null);
    rasterWork += cheapRect ? 4 : surfacePrimitiveWork(local, w, h);
    if (!Number.isSafeInteger(rasterWork) || rasterWork > SURFACE_LIMITS.maxWork) throw new Error(`Shape raster work exceeds ${SURFACE_LIMITS.maxWork}`);
  };
  if (shapes.some(shape => Object.hasOwn(shape.params, 'layers'))) {
    const visit = node => {
      for (const unit of node.children) {
        if (unit.kind === 'layer') visit(unit);
        else validate(unit.shape, translateGeometryParams(unit.shape.params, -node.x, -node.y), node.w, node.h);
      }
    };
    visit(buildLayerTree(shapes, width, height));
  } else for (const shape of shapes) validate(shape, shape.params, width, height);
}

function validateShapeGeometry(type, params) {
  if (typeof type !== 'string' || !Object.hasOwn(geometry, type) || !map(params)) throw new Error('Invalid shape type or geometry');
  validateGeometry(type, params, finiteGeometry, 'geometry');
  for (const key of ['w', 'h', 'r', 'rx', 'ry']) if (key in params && params[key] < 0) throw new Error('Invalid negative shape geometry');
  for (const key of ['erase', 'filled']) if (key in params && typeof params[key] !== 'boolean') throw new Error(`Invalid shape ${key}`);
  if (params.pattern !== undefined) patternTest(params.pattern);
  if (params.color2 !== undefined && (typeof params.color2 !== 'string' || !params.color2.length)) throw new Error('Invalid shape secondary color');
  if (Object.hasOwn(params, 'surface')) validateSurface(params.surface);
  if (Object.hasOwn(params, 'layers')) validateLayers(params.layers);
}

function validateShapes(shapes, width, height, shared) {
  const ids = new Set(), names = new Set();
  for (const shape of shapes) {
    if (!map(shape)) throw new Error('Invalid shape record');
    if (typeof shape.id !== 'string' || !shape.id.length || shape.id.length > 1024 || /[\p{Cc}\p{Cs}]/u.test(shape.id) || ids.has(shape.id)) throw new Error('Shape IDs must be unique nonempty strings');
    const numericId = /^s(\d+)$/.exec(shape.id);
    if (numericId) {
      const reserved = Number(numericId[1]) + 1;
      if (!Number.isSafeInteger(reserved) || reserved >= Number.MAX_SAFE_INTEGER) throw new Error('Imported shape ID exhausts the supported ID space');
    }
    ids.add(shape.id);
    if (!finiteGeometry(shape.zIndex ?? 0)) throw new Error('Shape z must be finite and within the safe numeric range');
    if (typeof shape.color !== 'string' || !shape.color.length || (shape.visible !== undefined && typeof shape.visible !== 'boolean') || (shape.name != null && typeof shape.name !== 'string')) throw new Error('Invalid shape color, visibility or name');
    if (shape.name) { if (names.has(shape.name)) throw new Error('Duplicate shape name'); names.add(shape.name); }
    if (!shared) validateShapeGeometry(shape.type, shape.params);
  }
  validateRasterShapes(shapes, width, height);
}

/** Per-cell validation views reference dictionary parameters; they never expand parameter trees. */
function resolvedShapes(data, cell) {
  return cell.shapes.map(instance => {
    const fields = ['id', 'name', 'color', 'zIndex', 'visible', 'geometryRef'];
    if (!map(instance) || Object.keys(instance).length !== fields.length || fields.some(key => !Object.hasOwn(instance, key))) throw new Error('Invalid shared instance field');
    if ((instance.name !== null && typeof instance.name !== 'string') || !finiteGeometry(instance.zIndex) || typeof instance.visible !== 'boolean') throw new Error('Invalid shared instance state');
    const ref = instance.geometryRef;
    if (typeof ref !== 'string' || !Object.hasOwn(data.geometry, ref)) throw new Error(`Invalid geometry reference "${ref}"`);
    const entry = data.geometry[ref];
    return { ...instance, type: entry.type, params: entry.params };
  });
}

/** Pure raw-data checks shared by direct shared loading and the import worker. */
export function validateProjectData(data, options = {}) {
  const limits = {};
  for (const [key, fallback] of Object.entries(PROJECT_LIMITS)) {
    const value = options[key] === undefined ? fallback : options[key];
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${key} must be a nonnegative safe integer`);
    limits[key] = value;
  }
  const { maxCells, maxShapes, maxGeometry, maxDepth } = limits;
  const version = data?.version === undefined ? 1 : data.version;
  if (![1, 2].includes(version)) throw new Error(`Unsupported project version "${version}"`);
  validateProjectJSON(data, maxDepth);
  const rows = data?.grid?.rows, cols = data?.grid?.cols;
  const width = data?.cellWidth ?? data?.cellSize, height = data?.cellHeight ?? data?.cellSize ?? width;
  if (![rows, cols].every(n => Number.isSafeInteger(n) && n > 0) || !Number.isSafeInteger(rows * cols) || rows * cols > maxCells) throw new Error(`Project exceeds ${maxCells} declared cells or has invalid dimensions`);
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0) || ![width * cols, height * rows, width * cols * height * rows].every(Number.isSafeInteger)) throw new Error('Grid dimensions and pixel count must be exactly representable as safe integers');
  if (!Array.isArray(data.palette) || !map(data.cells)) throw new Error('Invalid project palette or cells');
  if (version === 2) {
    if (!map(data.geometry) || Object.keys(data.geometry).length > maxGeometry) throw new Error(`Project exceeds ${maxGeometry} geometry entries or has an invalid geometry dictionary`);
    for (const [key, entry] of Object.entries(data.geometry)) {
      if (!/^g(?:0|[1-9]\d*)$/.test(key)) throw new Error('Invalid geometry dictionary key');
      if (!map(entry) || Object.keys(entry).length !== 2 || !Object.hasOwn(entry, 'type') || !Object.hasOwn(entry, 'params')) throw new Error('Invalid geometry dictionary field');
      validateShapeGeometry(entry.type, entry.params);
    }
  }
  const validRef = ref => { const m = /^(0|[1-9]\d*),(0|[1-9]\d*)$/.exec(ref); return m && +m[1] < rows && +m[2] < cols; };
  let shapes = 0;
  // Charge all declared instances before inspecting geometry or allocating cells.
  for (const [ref, cell] of Object.entries(data.cells)) {
    if (!validRef(ref) || !map(cell) || !Array.isArray(cell.shapes)) throw new Error('Invalid project cell');
    shapes += cell.shapes.length;
    if (shapes > maxShapes) throw new Error(`Project exceeds ${maxShapes} expanded shapes`);
  }
  for (const cell of Object.values(data.cells)) {
    const views = version === 2 ? resolvedShapes(data, cell) : cell.shapes;
    validateShapes(views, width, height, version === 2);
    if (cell.lighting !== undefined || views.some(shape => Object.hasOwn(shape.params, 'surface'))) validateSurfaceScene({ shapes: views, width, height, lighting: cell.lighting, background: data.background, palette: data.palette });
  }
  if (data.shapeGroups !== undefined) {
    if (!map(data.shapeGroups)) throw new Error('Shape groups must map cell references to groups');
    for (const groups of Object.values(data.shapeGroups)) {
      // Legacy aliases and orphan keys are metadata, not ownership migrations.
      if (!map(groups)) throw new Error('Invalid shape group map');
      for (const members of Object.values(groups)) if (!Array.isArray(members) || members.some(v => typeof v !== 'string')) throw new Error('Shape group members must be string arrays');
    }
  }
  return { version, rows, cols, cells: rows * cols, shapes };
}
