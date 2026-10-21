import { patternTest } from './patterns.js';
import { snapParams } from '../web/public/js/shared/raster.js';
import { validateLayers, translateParams, buildLayerTree } from '../web/public/js/shared/shape-layers.js';

const MAX_SHAPES = 4096;
const MAX_WORK = 16_777_216;
const MAX_COORD = 1_048_576;
const FILLABLE = ['rect', 'circle', 'ellipse', 'polygon'];
const GEOMETRY = {
  point: ['x', 'y'], fill: ['x', 'y'], line: ['x1', 'y1', 'x2', 'y2'],
  rect: ['x', 'y', 'w', 'h'], circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'],
  polygon: ['points'], polyline: ['points'],
};

function object(value, allowed, label) {
  if (value == null || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unknown ${label} field "${key}"`);
}

function identifier(value, label) {
  if (typeof value !== 'string' || !/^[\w-]{1,80}$/.test(value)) throw new Error(`${label} must contain 1–80 letters, digits, underscores or hyphens`);
  return value;
}

function localName(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 160 || /[\p{Cc}\p{Cs}]/u.test(value)) throw new Error('Shape names must contain 1–160 Unicode characters without controls or unpaired surrogates');
  return value;
}

function integer(value, label, min = -MAX_COORD, max = MAX_COORD) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer from ${min} to ${max}`);
  return value;
}

function color(palette, value) {
  if (typeof value !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(palette.resolve(value))) throw new Error(`Invalid composition color "${value}"; use hex or a defined palette color`);
}

function descriptor(palette, shape, source, sourceZ) {
  object(shape, ['name', 'type', 'params', 'color', 'visible'], 'shape');
  localName(shape.name);
  const fields = Object.hasOwn(GEOMETRY, shape.type) ? GEOMETRY[shape.type] : null;
  if (!fields) throw new Error(`Unsupported composition shape type "${shape.type}"`);
  const params = structuredClone(shape.params);
  // Copies acquire their own ownership; source metadata is never a live link.
  if (source && params) { delete params.composition; delete params.asciiPatch; }
  object(params, [...fields, 'layers', ...(FILLABLE.includes(shape.type) ? ['filled', 'pattern', 'color2'] : []), ...(shape.type === 'fill' ? [] : ['erase'])], 'shape parameter');
  if (Object.hasOwn(params, 'layers')) validateLayers(params.layers);
  for (const key of fields) {
    if (key === 'points') {
      if (!Array.isArray(params.points) || params.points.length < (shape.type === 'polygon' ? 3 : 2) || params.points.length > 256) throw new Error('Polygon/polyline points must contain 3/2 through 256 vertices');
      for (const point of params.points) {
        object(point, ['x', 'y'], 'vertex');
        for (const axis of ['x', 'y']) if (!Number.isFinite(point[axis]) || Math.abs(point[axis]) > MAX_COORD) throw new Error('Vertex coordinates must be finite and bounded');
      }
    } else if (!Number.isFinite(params[key]) || Math.abs(params[key]) > MAX_COORD) throw new Error(`Shape ${key} must be finite and bounded`);
  }
  for (const key of ['w', 'h', 'r', 'rx', 'ry']) if (key in params && params[key] < (key === 'w' || key === 'h' ? 1 : 0)) throw new Error(`Shape ${key} is outside its supported range`);
  for (const key of ['filled', 'erase']) if (key in params && typeof params[key] !== 'boolean') throw new Error(`Shape ${key} must be boolean`);
  if ('visible' in shape && typeof shape.visible !== 'boolean') throw new Error('Shape visible must be boolean');
  if (FILLABLE.includes(shape.type) && !('filled' in params)) params.filled = !source;
  // The renderer ignores fill-pattern fields on an outline. Capture its actual
  // geometry as a supported plain outline rather than replaying ignored fields.
  if (source && params.filled === false) { delete params.pattern; delete params.color2; }
  color(palette, shape.color);
  if ('color2' in params) color(palette, params.color2);
  if ('pattern' in params) {
    patternTest(params.pattern);
    if (!('color2' in params)) throw new Error('Pattern fills require color2');
    if (params.filled === false || params.erase) throw new Error('Pattern fills require a filled non-erasing shape');
  } else if ('color2' in params) throw new Error('color2 requires a pattern');
  return { name: shape.name, type: shape.type, params: snapParams(params), color: shape.color, visible: shape.visible ?? true, ...(source ? { source, zIndex: sourceZ } : {}) };
}

function offset(params, x, y) {
  const p = translateParams(params, x, y, { layers: true });
  for (const value of Object.values(p)) if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > MAX_COORD)) throw new Error('Expanded geometry exceeds coordinate bounds');
  if (p.points?.some(point => Math.abs(point.x) > MAX_COORD || Math.abs(point.y) > MAX_COORD)) throw new Error('Expanded vertices exceed coordinate bounds');
  return p;
}

/** Conservative upper bound on canonical raster work, including clipped geometry. */
function rasterWork(type, params, cell) {
  const p = snapParams(params);
  if (type === 'fill') {
    const surface = p.layers?.at(-1);
    return surface ? surface.w * surface.h : cell.width * cell.height;
  }
  if (type === 'point') return 1;
  if (type === 'line') return Math.max(Math.abs(p.x2 - p.x1), Math.abs(p.y2 - p.y1)) + 1;
  if (type === 'rect') return p.w * p.h + 2 * (p.w + p.h);
  if (type === 'circle') return (2 * p.r + 1) ** 2 + 8 * (p.r + 1);
  if (type === 'ellipse') return (2 * p.rx + 1) * (2 * p.ry + 1) + 8 * (p.rx + p.ry + 1);
  const xs = p.points.map(point => point.x), ys = p.points.map(point => point.y);
  const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
  return w * h + (w + h) * p.points.length;
}

// FNV-1a string hashing plus a fixed 32-bit generator makes seeds portable.
function random(seed) {
  if (!(typeof seed === 'string' && seed.length > 0 && seed.length <= 160) && !Number.isSafeInteger(seed)) throw new Error('Scatter seed must be a nonempty string (up to 160 characters) or a safe integer');
  let state = 2166136261;
  for (const char of `${typeof seed}:${seed}`) state = Math.imul(state ^ char.codePointAt(0), 16777619) >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function partsFor(project, definitions) {
  object(definitions, Object.keys(definitions ?? {}), 'parts');
  if (Object.keys(definitions).length > MAX_SHAPES) throw new Error(`Composition supports at most ${MAX_SHAPES} parts`);
  const parts = new Map();
  let total = 0;
  for (const [name, part] of Object.entries(definitions)) {
    identifier(name, 'Part name'); object(part, ['shapes', 'source'], 'part');
    if (Object.hasOwn(part, 'source') === Object.hasOwn(part, 'shapes')) throw new Error(`Part "${name}" needs exactly one of shapes or source`);
    let shapes;
    if (Object.hasOwn(part, 'source')) {
      object(part.source, ['cell', 'shapes'], 'source');
      if (typeof part.source.cell !== 'string') throw new Error('Source cell must be a cell coordinate or name');
      const ref = project.cells.resolveRef(part.source.cell), sourceCell = project.cells.getCell(ref);
      if (!Array.isArray(part.source.shapes) || !part.source.shapes.length || part.source.shapes.length > MAX_SHAPES) throw new Error('Source shapes must be a nonempty bounded array of names');
      const selected = new Set(part.source.shapes);
      if (selected.size !== part.source.shapes.length) throw new Error(`Part "${name}" has duplicate source shape names`);
      for (const name of selected) {
        localName(name);
        if (!sourceCell.shapes.getByName(name)) throw new Error(`Source shape "${name}" not found by name in cell ${ref}`);
      }
      shapes = sourceCell.shapes.listByZ().filter(shape => selected.has(shape.name)).map(shape => descriptor(project.palette, { name: shape.name, type: shape.type, params: shape.params, color: shape.color, visible: shape.visible }, { cell: ref, shape: shape.name }, shape.zIndex));
    } else {
      if (!Array.isArray(part.shapes) || !part.shapes.length || part.shapes.length > MAX_SHAPES) throw new Error('Part shapes must be a nonempty bounded array');
      shapes = part.shapes.map((shape, zIndex) => ({ ...descriptor(project.palette, shape), zIndex }));
    }
    if (new Set(shapes.map(shape => shape.name)).size !== shapes.length) throw new Error(`Part "${name}" has duplicate local shape names`);
    total += shapes.length;
    if (total > MAX_SHAPES) throw new Error(`Composition definitions are limited to ${MAX_SHAPES} shapes`);
    parts.set(name, shapes);
  }
  return parts;
}

/** Expand a declaration into copied canonical shapes and ordinary draw operations. */
export function compileComposition(project, spec) {
  object(spec, ['cell', 'prefix', 'parts', 'placements'], 'composition');
  if (typeof spec.cell !== 'string') throw new Error('Composition cell must be a cell coordinate or name');
  const ref = project.cells.resolveRef(spec.cell), cell = project.cells.getCell(ref);
  identifier(spec.prefix, 'Composition prefix');
  const parts = partsFor(project, spec.parts);
  if (!Array.isArray(spec.placements) || spec.placements.length > MAX_SHAPES) throw new Error(`Placements must be an array of at most ${MAX_SHAPES} declarations`);
  const shapes = [], instances = [], operations = [], names = new Set(), paintOrders = new Map();
  let work = 0;
  const emit = (placement, name, x, y) => {
    integer(x, 'Expanded x'); integer(y, 'Expanded y');
    const localShapes = parts.get(placement.part);
    if (shapes.length + localShapes.length > MAX_SHAPES) throw new Error(`Composition is limited to ${MAX_SHAPES} expanded shapes`);
    const instance = { name, part: placement.part, x, y, shapes: [] };
    const start = shapes.length;
    const units = localShapes.some(shape => shape.params.layers?.length) ? buildLayerTree(localShapes, cell.width, cell.height).children : null;
    const ranks = units ? new Map(units.map((unit, rank) => [unit.kind === 'layer' ? `layer:${unit.id}` : `shape:${unit.shape.name}`, start + rank])) : null;
    for (const local of localShapes) {
      if (ranks) {
        const rootLayer = local.params.layers?.[0];
        paintOrders.set(shapes.length, { rank: ranks.get(rootLayer ? `layer:${rootLayer.id}` : `shape:${local.name}`), layer: !!rootLayer });
      }
      const shapeName = `${spec.prefix}:${name}:${encodeURIComponent(local.name)}`, params = offset(local.params, x, y);
      for (const layer of params.layers ?? []) layer.id = `${spec.prefix}:${name}:layer:${encodeURIComponent(layer.id)}`;
      params.composition = { prefix: spec.prefix, part: placement.part, instance: name, localName: local.name, ...(local.source ? { source: structuredClone(local.source) } : {}) };
      work += rasterWork(local.type, params, cell);
      if (!Number.isSafeInteger(work) || work > MAX_WORK) throw new Error(`Composition exceeds its ${MAX_WORK}-pixel raster work budget`);
      const shape = { name: shapeName, type: local.type, params, color: local.color, visible: local.visible };
      shapes.push(shape); instance.shapes.push(shapeName);
      operations.push({ command: 'draw', cell: ref, name: shapeName, type: shape.type, color: shape.color, ...structuredClone(params), visible: shape.visible });
    }
    instances.push(instance);
  };
  for (const placement of spec.placements) {
    const fields = placement?.kind === 'stamp' ? [] : placement?.kind === 'tile' ? ['cols', 'rows', 'stepX', 'stepY'] : placement?.kind === 'scatter' ? ['w', 'h', 'count', 'seed'] : null;
    if (!fields) throw new Error('Placement kind must be stamp, tile or scatter');
    object(placement, ['kind', 'part', 'name', 'x', 'y', ...fields], 'placement');
    identifier(placement.name, 'Placement name'); identifier(placement.part, 'Placement part');
    if (!parts.has(placement.part)) throw new Error(`Unknown composition part "${placement.part}"`);
    if (names.has(placement.name)) throw new Error(`Duplicate placement name "${placement.name}"`);
    names.add(placement.name); integer(placement.x, 'Placement x'); integer(placement.y, 'Placement y');
    if (placement.kind === 'stamp') emit(placement, placement.name, placement.x, placement.y);
    if (placement.kind === 'tile') {
      integer(placement.cols, 'Tile cols', 1, MAX_SHAPES); integer(placement.rows, 'Tile rows', 1, MAX_SHAPES);
      integer(placement.stepX, 'Tile stepX'); integer(placement.stepY, 'Tile stepY');
      if (placement.cols * placement.rows * parts.get(placement.part).length + shapes.length > MAX_SHAPES) throw new Error(`Composition is limited to ${MAX_SHAPES} expanded shapes`);
      for (let r = 0; r < placement.rows; r++) for (let c = 0; c < placement.cols; c++) emit(placement, `${placement.name}/r${r}c${c}`, placement.x + c * placement.stepX, placement.y + r * placement.stepY);
    }
    if (placement.kind === 'scatter') {
      integer(placement.w, 'Scatter w', 1); integer(placement.h, 'Scatter h', 1); integer(placement.count, 'Scatter count', 0, MAX_SHAPES);
      const next = random(placement.seed);
      if (placement.count * parts.get(placement.part).length + shapes.length > MAX_SHAPES) throw new Error(`Composition is limited to ${MAX_SHAPES} expanded shapes`);
      for (let i = 0; i < placement.count; i++) emit(placement, `${placement.name}/${i}`, placement.x + Math.floor(next() * placement.w), placement.y + Math.floor(next() * placement.h));
    }
  }
  const existing = cell.shapes.listByZ();
  let nextZ = existing.reduce((z, shape) => Math.max(z, Math.floor(shape.zIndex) + 1), Math.ceil(cell._nextZ));
  if (existing.some(shape => shape.params.layers?.length)) for (const unit of buildLayerTree(existing, cell.width, cell.height).children) nextZ = Math.max(nextZ, Math.floor(unit.z) + 1);
  if (shapes.length && (!Number.isSafeInteger(nextZ) || !Number.isSafeInteger(nextZ + shapes.length))) throw new Error('Composition would exceed the exact z-order range');
  for (let i = 0; i < shapes.length; i++) {
    const order = paintOrders.get(i);
    shapes[i].zIndex = nextZ + (order && !order.layer ? order.rank : i);
    if (order?.layer) shapes[i].params.layers[0].z = nextZ + order.rank;
    operations[i].z = shapes[i].zIndex;
    if (shapes[i].params.layers) operations[i].layers = structuredClone(shapes[i].params.layers);
  }
  if (shapes.length) work += buildLayerTree(shapes, cell.width, cell.height).rasterWork;
  if (!Number.isSafeInteger(work) || work > MAX_WORK) throw new Error(`Composition exceeds its ${MAX_WORK}-pixel raster work budget`);
  return { shapes, instances, operations };
}

function owned(shape, prefix) {
  const owner = shape.params.composition;
  return owner?.prefix === prefix && typeof owner.instance === 'string' && typeof owner.localName === 'string' && shape.name === `${prefix}:${owner.instance}:${encodeURIComponent(owner.localName)}`;
}

/** Reconcile all output owned by one prefix as a single reversible cell edit. */
export function applyComposition(project, spec) {
  const compiled = compileComposition(project, spec), cell = project.cells.getCell(spec.cell);
  const previous = cell.shapes.listByZ(), desired = new Set(compiled.shapes.map(shape => shape.name));
  const obsolete = previous.filter(shape => owned(shape, spec.prefix) && !desired.has(shape.name));
  for (const shape of compiled.shapes) {
    const existing = cell.shapes.getByName(shape.name);
    if (existing && !owned(existing, spec.prefix)) throw new Error(`Shape "${shape.name}" collision: it is not owned by this composition`);
  }
  // Validate the reconciled destination, counting replacement surfaces once
  // and excluding obsolete output before any state or history can change.
  buildLayerTree([...previous.filter(shape => !owned(shape, spec.prefix)), ...compiled.shapes], cell.width, cell.height);
  const shapes = cell.transaction(() => {
    for (const shape of obsolete) cell.deleteShape(shape.name);
    if (compiled.shapes.length) cell._nextZ = Math.max(cell._nextZ, ...compiled.shapes.map(shape => shape.zIndex + 1));
    return compiled.shapes.map(shape => {
      const existing = cell.shapes.getByName(shape.name);
      if (existing) {
        cell.replaceShape(shape.name, shape);
        cell.setZ(shape.name, shape.zIndex);
        return existing.toJSON();
      }
      const created = cell.draw(shape.type, shape.params, shape.color, shape.name, { visible: shape.visible, zIndex: shape.zIndex });
      return created.toJSON();
    });
  });
  return { changed: shapes.length, removed: obsolete.length, shapes, instances: compiled.instances, operations: compiled.operations };
}
