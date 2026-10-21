import { SURFACE_LIMITS, validateLighting, validateSurface, validateSurfaceWork } from './surface-model.js';
import { validateNormalPlane, validateRgbaPlane } from './surface-normals.js';

function rgb(hex) {
  const text = hex.slice(1), full = text.length === 3 ? [...text].map(c => c + c).join('') : text;
  return [0, 2, 4].map(offset => parseInt(full.slice(offset, offset + 2), 16));
}

function paletteColors(palette, pixels, policy) {
  if (palette === undefined && policy !== 'nearest') return [];
  if (!Array.isArray(palette) || (policy === 'nearest' && !palette.length)) throw new Error('Nearest lighting requires a nonempty opaque palette');
  if (palette.length > SURFACE_LIMITS.maxWork || (policy === 'nearest' && pixels * palette.length > SURFACE_LIMITS.maxWork)) throw new Error('Palette conversion work exceeds surface work budget');
  for (const entry of palette) if (typeof entry !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(entry)) throw new Error('Surface palette entries must be opaque exact hex colors');
  return palette.map(rgb);
}

// At most one heap entry per grid cell; finalized cells never re-enter the queue.
class MaxField {
  constructor(size) {
    this.values = new Float64Array(size); this.heap = new Int32Array(size); this.positions = new Int32Array(size); this.reset();
  }
  reset() { this.values.fill(0); this.positions.fill(-1); this.size = 0; }
  better(a, b) { return this.values[a] > this.values[b] || (this.values[a] === this.values[b] && a < b); }
  offer(index, value) {
    if (value <= this.values[index] || value <= 0 || this.positions[index] === -2) return;
    this.values[index] = value;
    let position = this.positions[index];
    if (position < 0) position = this.size++;
    while (position) {
      const parent = (position - 1) >> 1, other = this.heap[parent];
      if (!this.better(index, other)) break;
      this.heap[position] = other; this.positions[other] = position; position = parent;
    }
    this.heap[position] = index; this.positions[index] = position;
  }
  pop() {
    const index = this.heap[0], last = this.heap[--this.size]; this.positions[index] = -2;
    if (this.size) {
      let position = 0;
      while (position * 2 + 1 < this.size) {
        let next = position * 2 + 1;
        if (next + 1 < this.size && this.better(this.heap[next + 1], this.heap[next])) next++;
        if (!this.better(this.heap[next], last)) break;
        this.heap[position] = this.heap[next]; this.positions[this.heap[position]] = position; position = next;
      }
      this.heap[position] = last; this.positions[last] = position;
    }
    return index;
  }
}

function materialGrid(rgba, materials, width, height, cell) {
  const columns = Math.ceil(width / cell), rows = Math.ceil(height / cell), solid = new Uint8Array(columns * rows), wall = new Uint8Array(columns * rows);
  if (materials) for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < columns; gx++) {
    const right = Math.min(width, (gx + 1) * cell), bottom = Math.min(height, (gy + 1) * cell);
    let area = 0, solids = 0, walls = 0;
    for (let y = gy * cell; y < bottom; y++) for (let x = gx * cell; x < right; x++) {
      const i = y * width + x; area++;
      if (rgba[i * 4 + 3]) { if (materials[i * 3] >= 128) solids++; if (materials[i * 3 + 1] >= 128) walls++; }
    }
    solid[gy * columns + gx] = solids * 2 >= area ? 1 : 0; wall[gy * columns + gx] = walls * 2 >= area ? 1 : 0;
  }
  return { columns, rows, solid, wall };
}

const AXIAL = [[-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1]];
const ROUND = [...AXIAL, [-1, -1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, 1, Math.SQRT2]];

function diffuse(field, grid, lighting, power, radius) {
  const { columns, rows, solid } = grid, neighbors = lighting.shape === 'round' ? ROUND : AXIAL;
  while (field.size) {
    const i = field.pop();
    const x = i % columns, y = Math.floor(i / columns);
    for (const [dx, dy, length] of neighbors) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
      if (dx && dy && (solid[i + dx] || solid[i + dy * columns])) continue;
      const next = ny * columns + nx, distance = lighting.cell * length;
      // Integrate half of each endpoint's solid thickness. `block` is the
      // fraction lost per eight pixels, so transmission compounds with depth
      // and scales with source intensity. Solid can never transmit more than air.
      const thickness = distance * (solid[i] + solid[next]) / 2;
      const transmission = (1 - lighting.block) ** (thickness / 8);
      const ordinaryAir = field.values[i] - power * distance / radius;
      field.offer(next, Math.min(ordinaryAir, field.values[i] * transmission));
    }
  }
}

function sampler(values, columns, rows, cell, smooth) {
  if (!smooth) return (x, y) => values[Math.floor(y / cell) * columns + Math.floor(x / cell)];
  return (x, y) => {
    const gx = Math.max(0, Math.min(columns - 1, (x - (cell - 1) / 2) / cell));
    const gy = Math.max(0, Math.min(rows - 1, (y - (cell - 1) / 2) / cell));
    const x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(x0 + 1, columns - 1), y1 = Math.min(y0 + 1, rows - 1), fx = gx - x0, fy = gy - y0;
    return (values[y0 * columns + x0] * (1 - fx) + values[y0 * columns + x1] * fx) * (1 - fy) + (values[y1 * columns + x0] * (1 - fx) + values[y1 * columns + x1] * fx) * fy;
  };
}

function reliefAt(normals, i, dx, dy, z, relief) {
  if (!normals || !relief) return 1;
  const k = i * 3, length = Math.hypot(normals[k], normals[k + 1], normals[k + 2]), directionLength = Math.hypot(dx, dy, z);
  const ux = directionLength ? dx / directionLength : 0, uy = directionLength ? dy / directionLength : 0, uz = directionLength ? z / directionLength : 1;
  const dot = (normals[k] * ux + normals[k + 1] * uy + normals[k + 2] * uz) / length;
  // Division-free relative Lambert response: max(0, 1 + relief *
  // (max(0, normal dot unitLightDirection) - unitLightDirection.z)).
  // A flat normal is exactly unmapped, including z=0. At zero distance the
  // explicit light direction is (0,0,1); no artificial lamp elevation is used.
  return Math.max(0, 1 + relief * (Math.max(0, dot) - uz));
}

function mixSource(mix, field, grid, rgba, normals, width, height, lighting, sourceColor, direction) {
  const sample = sampler(field.values, grid.columns, grid.rows, lighting.cell, lighting.smooth);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!rgba[i * 4 + 3]) continue;
    const [dx, dy, z] = direction(x, y), strength = sample(x, y) * reliefAt(normals, i, dx, dy, z, lighting.relief);
    for (let c = 0; c < 3; c++) mix[i * 3 + c] = Math.max(mix[i * 3 + c], strength * sourceColor[c] / 255);
  }
}

/** Bounded offline 2D grid diffusion, shared verbatim by Node and browser renderers. */
export function applySurfaceLighting(args) {
  const { width, height } = args;
  validateSurfaceWork(width, height);
  const lighting = validateLighting(args.lighting), lamps = validateSurface({ lamps: args.lamps === undefined ? [] : args.lamps }).lamps;
  const pixels = validateSurfaceWork(width, height, lighting ? lamps.length : 0, lighting);
  // All dimensions, source work, and palette work are checked before raster allocations.
  const palette = paletteColors(args.palette, pixels, lighting?.palettePolicy), rgba = args.rgba, normals = args.normals, materials = args.materials;
  validateRgbaPlane(rgba, pixels);
  if (normals !== undefined) validateNormalPlane(normals, rgba, pixels);
  if (materials !== undefined && (!(materials instanceof Uint8Array || materials instanceof Uint8ClampedArray) || materials.length !== pixels * 3)) throw new Error('Surface materials must contain three byte channels per pixel');
  const color = new Uint8ClampedArray(rgba), light = new Uint8ClampedArray(pixels * 4);
  if (!lighting) {
    for (let i = 0; i < pixels; i++) if (rgba[i * 4 + 3]) { light.set([255, 255, 255], i * 4); light[i * 4 + 3] = rgba[i * 4 + 3]; }
    return { color, light };
  }
  const mix = new Float32Array(pixels * 3), ambient = rgb(lighting.ambientColor);
  for (let i = 0; i < pixels; i++) for (let c = 0; c < 3; c++) mix[i * 3 + c] = lighting.ambient * ambient[c] / 255;
  if (lamps.length || lighting.sky) {
    const grid = materialGrid(rgba, materials, width, height, lighting.cell), field = new MaxField(grid.columns * grid.rows);
    for (const lamp of lamps) {
      field.reset();
      const gx = Math.max(0, Math.min(grid.columns - 1, Math.floor(lamp.x / lighting.cell))), gy = Math.max(0, Math.min(grid.rows - 1, Math.floor(lamp.y / lighting.cell)));
      const cx = Math.min(width - 1, gx * lighting.cell + (lighting.cell - 1) / 2), cy = Math.min(height - 1, gy * lighting.cell + (lighting.cell - 1) / 2);
      field.offer(gy * grid.columns + gx, lamp.power * Math.max(0, 1 - Math.hypot(lamp.x - cx, lamp.y - cy) / lamp.radius));
      diffuse(field, grid, lighting, lamp.power, lamp.radius);
      mixSource(mix, field, grid, rgba, normals, width, height, lighting, rgb(lamp.color), (x, y) => [lamp.x - x, lamp.y - y, lamp.z]);
    }
    if (lighting.sky) {
      field.reset();
      for (let x = 0; x < grid.columns; x++) for (let y = 0; y < grid.rows; y++) {
        const i = y * grid.columns + x;
        // Wall only ends direct sky seeding. Propagation still passes through it.
        if (grid.solid[i] || grid.wall[i]) break;
        field.offer(i, lighting.sky);
      }
      diffuse(field, grid, lighting, lighting.sky, lighting.skyReach);
      const scale = Math.max(...lighting.skyDir.map(Math.abs)), sx = lighting.skyDir[0] / scale, sy = lighting.skyDir[1] / scale, length = Math.hypot(sx, sy);
      mixSource(mix, field, grid, rgba, normals, width, height, lighting, rgb(lighting.skyColor), () => [sx / length, sy / length, 1]);
    }
  }
  for (let i = 0; i < pixels; i++) {
    const p = i * 4, k = i * 3, alpha = rgba[p + 3]; light[p + 3] = alpha;
    if (!alpha) continue;
    if (materials?.[k + 2] >= 128) { light.set([255, 255, 255], p); continue; }
    for (let c = 0; c < 3; c++) { light[p + c] = Math.round(mix[k + c] * 255); color[p + c] = Math.round(rgba[p + c] * mix[k + c]); }
    if (lighting.palettePolicy === 'nearest') {
      let best = palette[0], distance = Infinity;
      for (const entry of palette) {
        const d = (color[p] - entry[0]) ** 2 + (color[p + 1] - entry[1]) ** 2 + (color[p + 2] - entry[2]) ** 2;
        if (d < distance) { best = entry; distance = d; }
      }
      color.set(best, p);
    }
  }
  return { color, light };
}
