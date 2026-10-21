import { normalDirection, validateSurface, validateSurfaceWork } from './surface-model.js';

export function validateRgbaPlane(rgba, pixels) {
  if (!(rgba instanceof Uint8Array || rgba instanceof Uint8ClampedArray) || rgba.length !== pixels * 4) throw new Error('Surface rgba must be a byte array with four channels per pixel');
}

export function validateNormalPlane(normals, rgba, pixels) {
  if (!(normals instanceof Float32Array || normals instanceof Float64Array) || normals.length !== pixels * 3) throw new Error('Surface normals must contain three floating point channels per pixel');
  for (let i = 0; i < pixels; i++) {
    const k = i * 3, x = normals[k], y = normals[k + 1], z = normals[k + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(Math.hypot(x, y, z)) || z < 0 || (rgba[i * 4 + 3] && x === 0 && y === 0 && z === 0)) throw new Error('Surface normal directions must be finite, nonzero for painted pixels, and have z >= 0');
  }
}

// Eight-neighbor distance from the actual alpha boundary, including the image edge.
function maskDistance(rgba, width, height, pixels) {
  const distance = new Float32Array(pixels), diagonal = Math.SQRT2;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (rgba[i * 4 + 3]) distance[i] = x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 1 : Infinity;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!distance[i]) continue;
    if (x) distance[i] = Math.min(distance[i], distance[i - 1] + 1);
    if (y) {
      distance[i] = Math.min(distance[i], distance[i - width] + 1);
      if (x) distance[i] = Math.min(distance[i], distance[i - width - 1] + diagonal);
      if (x + 1 < width) distance[i] = Math.min(distance[i], distance[i - width + 1] + diagonal);
    }
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x;
    if (!distance[i]) continue;
    if (x + 1 < width) distance[i] = Math.min(distance[i], distance[i + 1] + 1);
    if (y + 1 < height) {
      distance[i] = Math.min(distance[i], distance[i + width] + 1);
      if (x) distance[i] = Math.min(distance[i], distance[i + width - 1] + diagonal);
      if (x + 1 < width) distance[i] = Math.min(distance[i], distance[i + width + 1] + diagonal);
    }
  }
  return distance;
}

function domeHeights(distance, width, height, depth) {
  const pixels = distance.length, heights = new Float32Array(pixels), visited = new Uint8Array(pixels), queue = new Int32Array(pixels);
  // Each four-connected painted island gets its own radius and summit.
  for (let start = 0; start < pixels; start++) {
    if (!distance[start] || visited[start]) continue;
    let head = 0, end = 1, radius = 0; queue[0] = start; visited[start] = 1;
    while (head < end) {
      const i = queue[head++], x = i % width, y = Math.floor(i / width);
      radius = Math.max(radius, distance[i]);
      const visit = next => { if (distance[next] && !visited[next]) { visited[next] = 1; queue[end++] = next; } };
      if (x) visit(i - 1); if (x + 1 < width) visit(i + 1); if (y) visit(i - width); if (y + 1 < height) visit(i + width);
    }
    for (let n = 0; n < end; n++) { const i = queue[n], edge = 1 - distance[i] / radius; heights[i] = depth * Math.sqrt(Math.max(0, 1 - edge * edge)); }
  }
  return heights;
}

/** Generate unit normals from this shape's current paint, never from its bounding rectangle. */
export function generateNormalPlane(args) {
  const { width, height } = args, pixels = validateSurfaceWork(width, height), rgba = args.rgba;
  validateRgbaPlane(rgba, pixels);
  const normal = validateSurface(args.normal === undefined ? {} : { normal: args.normal }).normal ?? { mode: 'flat', vector: [0, 0, 1] };
  const result = new Float32Array(pixels * 3);
  if (normal.mode === 'flat' || normal.mode === 'grid') {
    const directions = normal.mode === 'grid' ? new Map([...new Set(normal.rows.join(''))].map(c => [c, normalDirection(c)])) : null;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!rgba[i * 4 + 3]) continue;
      let direction = normal.vector ?? [0, 0, 1];
      if (directions) { const symbol = normal.rows[y - normal.y]?.[x - normal.x]; direction = directions.get(symbol) ?? [0, 0, 1]; }
      result.set(direction, i * 3);
    }
    return result;
  }
  let heights;
  if (normal.mode === 'luma') {
    heights = new Float32Array(pixels);
    for (let i = 0; i < pixels; i++) if (rgba[i * 4 + 3]) heights[i] = normal.depth * (rgba[i * 4] * 0.2126 + rgba[i * 4 + 1] * 0.7152 + rgba[i * 4 + 2] * 0.0722) / 255;
  } else {
    const distance = maskDistance(rgba, width, height, pixels);
    if (normal.mode === 'dome') heights = domeHeights(distance, width, height, normal.depth);
    else { heights = distance; for (let i = 0; i < pixels; i++) heights[i] = normal.depth * Math.min(distance[i] / normal.width, 1); }
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!rgba[i * 4 + 3]) continue;
    const dx = ((x ? heights[i - 1] : 0) - (x + 1 < width ? heights[i + 1] : 0)) / 2;
    const dy = ((y ? heights[i - width] : 0) - (y + 1 < height ? heights[i + width] : 0)) / 2;
    const length = Math.hypot(dx, dy, 1);
    result[i * 3] = dx / length; result[i * 3 + 1] = dy / length; result[i * 3 + 2] = 1 / length;
  }
  return result;
}

/** Export +Y upward in RGB while retaining the exact source alpha. */
export function encodeNormalPlane(args) {
  const { width, height } = args, pixels = validateSurfaceWork(width, height), rgba = args.rgba, normals = args.normals;
  validateRgbaPlane(rgba, pixels); validateNormalPlane(normals, rgba, pixels);
  const result = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < pixels; i++) {
    const alpha = rgba[i * 4 + 3];
    if (!alpha) continue;
    const k = i * 3, length = Math.hypot(normals[k], normals[k + 1], normals[k + 2]);
    result[i * 4] = Math.round((normals[k] / length + 1) * 127.5);
    result[i * 4 + 1] = Math.round((1 - normals[k + 1] / length) * 127.5);
    result[i * 4 + 2] = Math.round((normals[k + 2] / length + 1) * 127.5);
    result[i * 4 + 3] = alpha;
  }
  return result;
}
