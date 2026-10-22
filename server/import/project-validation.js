import { Project } from '../engine/project.js';
import { Shape } from '../engine/shape.js';
import { projectName } from '../session-activation.js';
import { buildLayerTree, translateParams } from '../web/public/js/shared/shape-layers.js';
import { patternTest } from '../engine/patterns.js';
import { surfacePrimitiveWork } from '../web/public/js/shared/surface-raster.js';
import { SURFACE_LIMITS } from '../web/public/js/shared/surface-model.js';
import { snapParams } from '../web/public/js/shared/raster.js';

function map(value) { return value && typeof value === 'object' && !Array.isArray(value); }
const geometry = { point: ['x', 'y'], fill: ['x', 'y'], line: ['x1', 'y1', 'x2', 'y2'], rect: ['x', 'y', 'w', 'h'], circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'], polygon: ['points'], polyline: ['points'] };
const finiteGeometry = value => Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
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
    // The loop estimate and coordinate checks use exactly the translated params
    // handed to native drawing by both paintLayerTree and renderSurfaceCell.
    const local = { ...shape, params };
    const cheapRect = shape.type === 'rect' && !(params.filled && params.pattern && params.color2 != null);
    rasterWork += cheapRect ? 4 : surfacePrimitiveWork(local, w, h);
    if (!Number.isSafeInteger(rasterWork) || rasterWork > SURFACE_LIMITS.maxWork) throw new Error(`Shape raster work exceeds ${SURFACE_LIMITS.maxWork}`);
  };
  if (shapes.some(shape => Object.hasOwn(shape.params, 'layers'))) {
    const visit = node => {
      for (const unit of node.children) {
        if (unit.kind === 'layer') visit(unit);
        else validate(unit.shape, translateParams(unit.shape.params, -node.x, -node.y), node.w, node.h);
      }
    };
    visit(buildLayerTree(shapes, width, height));
  } else for (const shape of shapes) validate(shape, shape.params, width, height);
}
function validateShapes(shapes, width, height) {
  const ids = new Set(), names = new Set();
  for (const shape of shapes) {
    if (!map(shape) || !Object.hasOwn(geometry, shape.type) || !map(shape.params)) throw new Error('Invalid shape type or geometry');
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
    const params = shape.params;
    validateGeometry(shape.type, params, finiteGeometry, 'geometry');
    for (const key of ['w', 'h', 'r', 'rx', 'ry']) if (key in params && params[key] < 0) throw new Error('Invalid negative shape geometry');
    for (const key of ['erase', 'filled']) if (key in params && typeof params[key] !== 'boolean') throw new Error(`Invalid shape ${key}`);
    if (params.pattern !== undefined) patternTest(params.pattern);
    if (params.color2 !== undefined && (typeof params.color2 !== 'string' || !params.color2.length)) throw new Error('Invalid shape secondary color');
  }
  validateRasterShapes(shapes, width, height);
}
export function validateImportedProject(data, { maxCells, maxShapes }, name) {
  const rows = data?.grid?.rows, cols = data?.grid?.cols;
  if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(cols) || rows <= 0 || cols <= 0 || rows * cols > maxCells) throw new Error(`Project exceeds ${maxCells} declared cells or has invalid dimensions`);
  if (!Array.isArray(data.palette) || !map(data.cells)) throw new Error('Invalid project palette or cells');
  const validRef = ref => { const m = /^(\d+),(\d+)$/.exec(ref); return m && +m[1] < rows && +m[2] < cols; };
  let shapes = 0;
  for (const [ref, cell] of Object.entries(data.cells)) {
    if (!validRef(ref) || !map(cell) || !Array.isArray(cell.shapes)) throw new Error('Invalid project cell');
    shapes += cell.shapes.length;
    if (shapes > maxShapes) throw new Error(`Project exceeds ${maxShapes} expanded shapes`);
    const width = data.cellWidth ?? data.cellSize, height = data.cellHeight ?? data.cellSize ?? width;
    validateShapes(cell.shapes, width, height);
  }
  if (data.shapeGroups !== undefined) {
    if (!map(data.shapeGroups)) throw new Error('Shape groups must map cell references to groups');
    for (const [ref, groups] of Object.entries(data.shapeGroups)) {
      if (!validRef(ref) || !map(groups)) throw new Error('Invalid shape group cell or group map');
      for (const members of Object.values(groups)) if (!Array.isArray(members) || members.some(v => typeof v !== 'string')) throw new Error('Shape group members must be string arrays');
    }
  }
  const project = Project.fromJSON(data);
  Shape.assertIdAllocationAvailable();
  project.name = projectName(name ?? project.name);
  return { project, summary: { name: project.name, rows, cols, cells: rows * cols, shapes } };
}
