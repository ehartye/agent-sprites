// Retained surface metadata. This module has no canvas, Node, or browser dependencies.
export const SURFACE_LIMITS = Object.freeze({
  maxPixels: 4_194_304, maxLamps: 64, maxWork: 64_000_000,
  maxGridPixels: 65_536, maxCoordinate: 1_048_576,
});

const HEX = /^#(?:[\da-f]{3}|[\da-f]{6})$/i;
const GRID = /^[789456123qweasdzxc0. ]+$/;
const HARD = ['789', '456', '123'], SOFT = ['qwe', 'asd', 'zxc'];

function object(value, keys, label) {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`Unknown ${label} field "${key}"`);
}

function number(value, low, high, label, integer = false) {
  if (!Number.isFinite(value) || value < low || value > high || (integer && !Number.isSafeInteger(value))) throw new Error(`${label} must be ${integer ? 'an integer' : 'finite'} from ${low} to ${high}`);
  return value;
}
const coordinate = (v, label) => number(v, -SURFACE_LIMITS.maxCoordinate, SURFACE_LIMITS.maxCoordinate, label, true);
const color = (v, label) => { if (typeof v !== 'string' || !HEX.test(v)) throw new Error(`${label} must be an opaque exact hex color`); return v.toLowerCase(); };
const flag = (v, label) => { if (typeof v !== 'boolean') throw new Error(`${label} must be boolean`); return v; };
const option = (obj, key, fallback) => Object.hasOwn(obj, key) ? obj[key] : fallback;

function normalModel(value) {
  object(value, ['mode', 'vector', 'width', 'depth', 'x', 'y', 'rows'], 'surface normal');
  const mode = value.mode;
  if (mode === 'flat') {
    object(value, ['mode', 'vector'], 'flat normal');
    const v = option(value, 'vector', [0, 0, 1]);
    if (!Array.isArray(v) || v.length !== 3 || ![v[0], v[1], v[2]].every(Number.isFinite) || v[2] < 0 || !v.some(n => n !== 0)) throw new Error('Normal vector must contain three finite values, be nonzero, and have z >= 0');
    // Scale first: Math.hypot can overflow for a valid vector near Number.MAX_VALUE.
    const scale = Math.max(...v.map(Math.abs)), scaled = v.map(n => n / scale), length = Math.hypot(...scaled);
    return { mode, vector: scaled.map(n => n / length || 0) };
  }
  if (['bevel', 'dome', 'luma'].includes(mode)) {
    object(value, mode === 'bevel' ? ['mode', 'width', 'depth'] : ['mode', 'depth'], `${mode} normal`);
    const result = { mode };
    if (mode === 'bevel') result.width = number(option(value, 'width', 2), 1, 2048, 'Bevel width');
    result.depth = number(option(value, 'depth', 1), 0, 32, 'Normal depth');
    return result;
  }
  if (mode === 'grid') {
    object(value, ['mode', 'x', 'y', 'rows'], 'grid normal');
    const x = coordinate(value.x, 'Grid x'), y = coordinate(value.y, 'Grid y'), rows = value.rows;
    if (!Array.isArray(rows) || !rows.length || rows.length > SURFACE_LIMITS.maxGridPixels || typeof rows[0] !== 'string' || !rows[0].length || rows[0].length * rows.length > SURFACE_LIMITS.maxGridPixels) throw new Error('Normal grid must contain 1 to 65536 pixels');
    const width = rows[0].length;
    for (const row of rows) if (typeof row !== 'string' || row.length !== width || !GRID.test(row)) throw new Error('Normal grid rows must have equal width and valid direction symbols');
    coordinate(x + width - 1, 'Grid right'); coordinate(y + rows.length - 1, 'Grid bottom');
    return { mode, x, y, rows: rows.slice() };
  }
  throw new Error('Normal mode must be flat, bevel, dome, luma, or grid');
}

/** Validate, normalize, and detach optional shape.params.surface metadata. */
export function validateSurface(value) {
  if (value === undefined) return undefined;
  object(value, ['normal', 'material', 'lamps'], 'surface');
  const result = {};
  if (Object.hasOwn(value, 'normal')) result.normal = normalModel(value.normal);
  if (Object.hasOwn(value, 'material')) {
    object(value.material, ['solid', 'wall', 'unlit'], 'surface material');
    result.material = {};
    for (const key of Object.keys(value.material)) result.material[key] = flag(value.material[key], `Material ${key}`);
  }
  if (Object.hasOwn(value, 'lamps')) {
    if (!Array.isArray(value.lamps) || value.lamps.length > SURFACE_LIMITS.maxLamps) throw new Error(`Surface lamps must be an array of at most ${SURFACE_LIMITS.maxLamps}`);
    const names = new Set();
    result.lamps = Array.from(value.lamps, lamp => {
      object(lamp, ['name', 'x', 'y', 'radius', 'power', 'z', 'color'], 'surface lamp');
      if (typeof lamp.name !== 'string' || !lamp.name.trim() || lamp.name.length > 1024 || /[\p{Cc}\p{Cs}]/u.test(lamp.name) || names.has(lamp.name)) throw new Error('Lamp names must be unique nonempty strings of at most 1024 characters');
      names.add(lamp.name);
      const radius = number(option(lamp, 'radius', 32), 0, 8192, 'Lamp radius');
      const power = number(option(lamp, 'power', 1), 0, 8, 'Lamp power');
      if (!radius || !power) throw new Error('Lamp radius and power must be positive');
      return { name: lamp.name, x: coordinate(lamp.x, 'Lamp x'), y: coordinate(lamp.y, 'Lamp y'), radius, power, z: number(option(lamp, 'z', 8), 0, 8192, 'Lamp z'), color: color(option(lamp, 'color', '#ffffff'), 'Lamp color') };
    });
  }
  return result;
}

/** Lighting never silently selects a palette conversion policy. */
export function validateLighting(value) {
  if (value === undefined) return undefined;
  object(value, ['cell', 'smooth', 'block', 'shape', 'ambient', 'ambientColor', 'sky', 'skyColor', 'skyReach', 'skyDir', 'relief', 'palettePolicy'], 'lighting');
  if (!['rgb', 'nearest'].includes(value.palettePolicy)) throw new Error('Lighting palettePolicy must explicitly be rgb or nearest');
  const shape = option(value, 'shape', 'round');
  if (!['round', 'diamond'].includes(shape)) throw new Error('Lighting shape must be round or diamond');
  const skyDir = option(value, 'skyDir', [0, -1]);
  if (!Array.isArray(skyDir) || skyDir.length !== 2 || ![skyDir[0], skyDir[1]].every(Number.isFinite) || !skyDir.some(n => n !== 0)) throw new Error('Lighting skyDir must contain two finite nonzero direction values');
  const skyReach = number(option(value, 'skyReach', 24), 0, 8192, 'Sky reach');
  if (!skyReach) throw new Error('Sky reach must be positive');
  return {
    cell: number(option(value, 'cell', 4), 1, 64, 'Lighting cell', true), smooth: flag(option(value, 'smooth', false), 'Lighting smooth'),
    block: number(option(value, 'block', 0.4), 0, 1, 'Lighting block'), shape,
    ambient: number(option(value, 'ambient', 0), 0, 8, 'Lighting ambient'), ambientColor: color(option(value, 'ambientColor', '#ffffff'), 'Ambient color'),
    sky: number(option(value, 'sky', 0), 0, 8, 'Lighting sky'), skyColor: color(option(value, 'skyColor', '#ffffff'), 'Sky color'), skyReach, skyDir: skyDir.slice(),
    relief: number(option(value, 'relief', 1), 0, 8, 'Lighting relief'), palettePolicy: value.palettePolicy,
  };
}

/** Call before reading or allocating raster storage. Sources are conservatively charged per pixel. */
export function validateSurfaceWork(width, height, lampCount = 0, lighting) {
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0) || !Number.isSafeInteger(width * height) || width * height > SURFACE_LIMITS.maxPixels) throw new Error(`Surface pixel count must be from 1 to ${SURFACE_LIMITS.maxPixels}`);
  number(lampCount, 0, SURFACE_LIMITS.maxLamps, 'Lamp count', true);
  const pixels = width * height, work = pixels * (lampCount + (lighting?.sky > 0 ? 1 : 0) + 1);
  if (work > SURFACE_LIMITS.maxWork) throw new Error(`Surface lighting work exceeds ${SURFACE_LIMITS.maxWork}`);
  return pixels;
}

/** +x right, +y down, +z viewer. Soft letters have z=2 versus hard digits' z=1:
 * they retain the compass heading with a shallower tilt toward the viewer. */
export function normalDirection(symbol) {
  for (const [alphabet, z] of [[HARD, 1], [SOFT, 2]]) for (let y = 0; y < 3; y++) {
    const x = alphabet[y].indexOf(symbol);
    if (x >= 0) { const length = Math.hypot(x - 1, y - 1, z); return [(x - 1) / length, (y - 1) / length, z / length]; }
  }
  if (symbol === '0' || symbol === '.' || symbol === ' ') return [0, 0, 1];
  throw new Error('Invalid normal direction symbol');
}

function turnSymbol(symbol, transform) {
  for (const alphabet of [HARD, SOFT]) for (let y = 0; y < 3; y++) {
    const x = alphabet[y].indexOf(symbol);
    if (x >= 0) { const [nx, ny] = transform(x - 1, y - 1); return alphabet[ny + 1][nx + 1]; }
  }
  return symbol;
}

export function translateSurface(surface, dx, dy) {
  coordinate(dx, 'Surface translation x'); coordinate(dy, 'Surface translation y');
  const result = validateSurface(surface);
  if (!result) return result;
  if (result.normal?.mode === 'grid') { result.normal.x += dx; result.normal.y += dy; }
  for (const lamp of result.lamps ?? []) { lamp.x += dx; lamp.y += dy; }
  return validateSurface(result);
}

export function flipSurface(surface, axis, mirrorSum) {
  if (!['x', 'y'].includes(axis)) throw new Error('Surface flip axis must be x or y');
  number(mirrorSum, -SURFACE_LIMITS.maxCoordinate * 2, SURFACE_LIMITS.maxCoordinate * 2, 'Mirror sum', true);
  const result = validateSurface(surface);
  if (!result) return result;
  const direction = (x, y) => axis === 'x' ? [-x, y] : [x, -y], normal = result.normal;
  for (const lamp of result.lamps ?? []) lamp[axis] = mirrorSum - lamp[axis];
  if (normal?.mode === 'flat') normal.vector[axis === 'x' ? 0 : 1] *= -1;
  if (normal?.mode === 'grid') {
    normal[axis] = mirrorSum - normal[axis] - (axis === 'x' ? normal.rows[0].length : normal.rows.length) + 1;
    const rows = axis === 'y' ? normal.rows.slice().reverse() : normal.rows;
    normal.rows = rows.map(row => (axis === 'x' ? [...row].reverse() : [...row]).map(c => turnSymbol(c, direction)).join(''));
  }
  return validateSurface(result);
}

export function rotateSurface(surface, deg, px, py) {
  if (![90, 180, 270].includes(deg)) throw new Error('Surface rotation must be 90, 180, or 270 degrees clockwise');
  number(px, -SURFACE_LIMITS.maxCoordinate, SURFACE_LIMITS.maxCoordinate, 'Pivot x'); number(py, -SURFACE_LIMITS.maxCoordinate, SURFACE_LIMITS.maxCoordinate, 'Pivot y');
  const result = validateSurface(surface);
  if (!result) return result;
  const direction = (x, y) => deg === 90 ? [-y, x] : deg === 180 ? [-x, -y] : [y, -x];
  const point = (x, y) => { const p = direction(x - px, y - py); return [Math.round(p[0] + px) || 0, Math.round(p[1] + py) || 0]; };
  for (const lamp of result.lamps ?? []) [lamp.x, lamp.y] = point(lamp.x, lamp.y);
  const normal = result.normal;
  if (normal?.mode === 'flat') [normal.vector[0], normal.vector[1]] = direction(normal.vector[0], normal.vector[1]);
  if (normal?.mode === 'grid') {
    const width = normal.rows[0].length, height = normal.rows.length;
    const corners = [point(normal.x, normal.y), point(normal.x + width - 1, normal.y + height - 1)];
    const x = Math.min(...corners.map(p => p[0])), y = Math.min(...corners.map(p => p[1]));
    const nw = deg === 180 ? width : height, nh = deg === 180 ? height : width;
    const rows = Array.from({ length: nh }, () => Array(nw));
    for (let gy = 0; gy < height; gy++) for (let gx = 0; gx < width; gx++) {
      const [tx, ty] = point(normal.x + gx, normal.y + gy);
      if (!Number.isSafeInteger(tx) || !Number.isSafeInteger(ty)) throw new Error('Rotated grid coordinates must be integers');
      rows[ty - y][tx - x] = turnSymbol(normal.rows[gy][gx], direction);
    }
    normal.x = x; normal.y = y; normal.rows = rows.map(row => row.join(''));
  }
  return validateSurface(result);
}
