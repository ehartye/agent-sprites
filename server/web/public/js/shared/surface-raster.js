import { buildLayerTree, translateParams } from './shape-layers.js';
import { SURFACE_LIMITS, validateSurface, validateLighting, validateSurfaceWork, translateSurface } from './surface-model.js';
import { generateNormalPlane, encodeNormalPlane } from './surface-normals.js';
import { applySurfaceLighting } from './surface-lighting.js';
import { snapParams } from './raster.js';

export const hasSurfaceData = (shapes, lighting) => lighting !== undefined || shapes.some(shape => Object.hasOwn(shape.params ?? {}, 'surface'));

/** Palette JSON entries, CSS-color arrays, and browser name-to-color maps share this filter. */
export function opaquePaletteColors(entries) {
  if (entries?.toJSON) entries = entries.toJSON();
  if (entries && !Array.isArray(entries) && typeof entries === 'object') entries = Object.values(entries);
  if (!Array.isArray(entries)) return [];
  return entries.flatMap(entry => {
    const color = typeof entry === 'string' ? entry : entry?.color;
    if (typeof color !== 'string') return [];
    if (/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color)) return [color];
    if (/^#[\da-f]{3}f$/i.test(color)) return [color.slice(0, 4)];
    if (/^#[\da-f]{6}ff$/i.test(color)) return [color.slice(0, 7)];
    return [];
  });
}

export function surfaceChannel(channel = 'color') {
  if (!['color', 'normal', 'light'].includes(channel)) throw new Error(`Unknown surface channel "${channel}"; expected color, normal, or light`);
  return channel;
}

function validateBackground(background) {
  if (background === undefined) return { mode: 'transparent' };
  if (!background || !['transparent', 'chroma'].includes(background.mode) || (background.mode === 'chroma' && !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(background.color))) throw new Error('Surface background must be transparent or a chroma hex color');
  return background;
}

// Bounds the canonical loops even when geometry falls entirely outside its clip.
export function surfacePrimitiveWork(shape, width, height) {
  const p = snapParams(shape.params);
  let work;
  switch (shape.type) {
    case 'point': return 1;
    case 'fill': return width * height;
    case 'line': work = Math.max(Math.abs(p.x2 - p.x1), Math.abs(p.y2 - p.y1)) + 1; break;
    case 'rect': work = Math.abs(p.w * p.h) + 2 * (Math.abs(p.w) + Math.abs(p.h)); break;
    case 'circle': work = (2 * Math.abs(p.r) + 1) ** 2 + 8 * (Math.abs(p.r) + 1); break;
    case 'ellipse': work = 2 * (2 * Math.abs(p.rx) + 1) * (2 * Math.abs(p.ry) + 1) + 8 * (Math.abs(p.rx) + Math.abs(p.ry) + 1); break;
    case 'polygon': case 'polyline': {
      if (!Array.isArray(p.points) || p.points.length < 2) return 1;
      let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
      for (const point of p.points) { left = Math.min(left, point.x); right = Math.max(right, point.x); top = Math.min(top, point.y); bottom = Math.max(bottom, point.y); }
      const w = right - left + 1, h = bottom - top + 1;
      work = w * h + (w + h) * p.points.length; break;
    }
    default: return 1;
  }
  if (!Number.isSafeInteger(work) || work < 0) throw new Error('Surface primitive raster work must be finite safe integer geometry');
  return work;
}

/** No raster allocations: authoring and replay can reject the entire proposed scene first. */
export function validateSurfaceScene({ shapes, width, height, lighting, background, palette }) {
  validateSurfaceWork(width, height);
  const light = validateLighting(lighting), bg = validateBackground(background), tree = buildLayerTree(shapes, width, height);
  const colors = opaquePaletteColors(palette), surfaces = new Map(), lamps = [];
  let totalLamps = 0, rasterWork = 0;
  const charge = work => {
    rasterWork += work;
    if (!Number.isSafeInteger(rasterWork) || rasterWork > SURFACE_LIMITS.maxWork) throw new Error(`Surface aggregate raster work exceeds ${SURFACE_LIMITS.maxWork}-pixel budget`);
  };
  for (const [index, shape] of shapes.entries()) {
    const surface = validateSurface(shape.params?.surface); surfaces.set(shape, surface);
    totalLamps += surface?.lamps?.length ?? 0;
    if (totalLamps > SURFACE_LIMITS.maxLamps) throw new Error(`Surface total lamp count exceeds ${SURFACE_LIMITS.maxLamps}`);
    if (shape.visible !== false) for (const [lampIndex, lamp] of (surface?.lamps ?? []).entries()) lamps.push({ ...lamp, name: `${index}:${lampIndex}` });
  }
  const visit = node => {
    const pixels = validateSurfaceWork(node.w, node.h);
    // Color, encoded normal and material coverage, plus isolated eraser content.
    charge(pixels * 3 * (node.erase ? 2 : 1));
    for (const unit of node.children) {
      if (unit.kind === 'layer') visit(unit);
      else {
        // Validate translations now, including global normal grids and lamps.
        if (Object.hasOwn(unit.shape.params, 'surface')) translateSurface(unit.shape.params.surface, -node.x, -node.y);
        if (unit.shape.visible !== false) {
          charge(pixels * 7); // mask, normals, encode, material and three composites
          charge(surfacePrimitiveWork(unit.shape, node.w, node.h) * 2);
        }
      }
    }
  };
  visit(tree);
  validateSurfaceWork(width, height, light ? lamps.length : 0, light);
  charge(width * height * ((light ? lamps.length + (light.sky > 0 ? 1 : 0) : 0) + 1));
  if (light?.palettePolicy === 'nearest') {
    if (!colors.length) throw new Error('Nearest lighting requires a nonempty opaque palette');
    charge(width * height * colors.length);
  }
  return { tree, surfaces, lighting: light, background: bg, palette: colors, lamps, rasterWork, active: hasSurfaceData(shapes, lighting) };
}

// Region membership is read from current color, not from repaint differences.
function fillMask(ctx, shape, createCanvas, drawShape) {
  const { width, height } = ctx.canvas, image = ctx.getImageData(0, 0, width, height), source = image.data;
  const rgba = new Uint8ClampedArray(source.length), region = new Uint8Array(width * height);
  const x = Math.round(shape.params.x), y = Math.round(shape.params.y);
  if (x < 0 || y < 0 || x >= width || y >= height) return { rgba, region };
  const sample = createCanvas(1, 1), sampleCtx = sample.getContext('2d');
  drawShape(sampleCtx, { ...shape, type: 'point', params: { x: 0, y: 0 } });
  const color = sampleCtx.getImageData(0, 0, 1, 1).data;
  const start = y * width + x, seed = source.slice(start * 4, start * 4 + 4), queue = new Int32Array(width * height);
  let head = 0, tail = 1; queue[0] = start; region[start] = 1;
  const visit = i => {
    const p = i * 4;
    if (region[i] || source[p] !== seed[0] || source[p + 1] !== seed[1] || source[p + 2] !== seed[2] || source[p + 3] !== seed[3]) return;
    region[i] = 1; queue[tail++] = i;
  };
  while (head < tail) {
    const i = queue[head++], px = i % width, py = Math.floor(i / width);
    rgba.set(color, i * 4);
    if (px) visit(i - 1); if (px + 1 < width) visit(i + 1); if (py) visit(i - width); if (py + 1 < height) visit(i + width);
  }
  return { rgba, region };
}

/** Environment-neutral retained raster, using the caller's canonical primitive callback. */
export function renderSurfaceCell(args) {
  const { shapes, width, height, createCanvas, drawShape } = args;
  const scene = validateSurfaceScene(args);
  const make = (w, h, background) => {
    const canvas = createCanvas(w, h), ctx = canvas.getContext('2d');
    if (background?.mode === 'chroma') { ctx.fillStyle = background.color; ctx.fillRect(0, 0, w, h); }
    const rgba = ctx.getImageData(0, 0, w, h).data, normal = new Uint8ClampedArray(w * h * 4), material = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) if (rgba[i * 4 + 3]) { normal.set([128, 128, 255, rgba[i * 4 + 3]], i * 4); material[i * 4 + 3] = rgba[i * 4 + 3]; }
    return { canvas, ctx, normal, material };
  };
  // Auxiliary RGB is straight alpha. Keeping it in bytes avoids canvas premultiply
  // loss (a half-alpha flat normal must still export exactly 128,128,255).
  const composite = (target, source, dx, dy, erase = false, region, paintColor) => {
    const tw = target.canvas.width, th = target.canvas.height, sw = source.canvas.width, sh = source.canvas.height;
    const src = source.rgba ?? source.ctx.getImageData(0, 0, sw, sh).data, before = target.ctx.getImageData(0, 0, tw, th);
    // The injected canonical painter owns all color behavior, including flood
    // no-ops and out-of-bounds seeds. Region membership only owns auxiliary data.
    target.ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    if (paintColor) paintColor(target.ctx); else target.ctx.drawImage(source.canvas, dx, dy);
    target.ctx.globalCompositeOperation = 'source-over';
    const after = target.ctx.getImageData(0, 0, tw, th).data;
    for (let y = Math.max(0, dy); y < Math.min(th, dy + sh); y++) for (let x = Math.max(0, dx); x < Math.min(tw, dx + sw); x++) {
      const t = (y * tw + x) * 4, s = ((y - dy) * sw + x - dx) * 4, sa = src[s + 3] / 255, da = before.data[t + 3] / 255;
      if (!sa && !(region?.[s / 4] && !erase)) continue;
      for (const key of ['normal', 'material']) {
        const out = target[key], input = source[key];
        if (region && !erase) out.set(input.subarray(s, s + 4), t);
        else if (erase) { if (!after[t + 3]) out.fill(0, t, t + 4); }
        else {
          const alpha = sa + da * (1 - sa);
          for (let c = 0; c < 3; c++) out[t + c] = Math.round((input[s + c] * sa + out[t + c] * da * (1 - sa)) / alpha);
        }
        out[t + 3] = after[t + 3];
      }
    }
  };
  const paint = (node, background) => {
    const target = make(node.w, node.h, background), content = node.erase ? make(node.w, node.h) : target;
    for (const unit of node.children) {
      if (unit.kind === 'layer') { composite(content, paint(unit, unit.background), unit.x - node.x, unit.y - node.y); continue; }
      const shape = unit.shape;
      if (shape.visible === false) continue;
      const local = { ...shape, params: translateParams(shape.params, -node.x, -node.y) }, mask = make(node.w, node.h);
      let region;
      if (shape.type === 'fill') { const fill = fillMask(content.ctx, local, createCanvas, drawShape); region = fill.region; mask.rgba = fill.rgba; }
      else drawShape(mask.ctx, local);
      const rgba = mask.rgba ?? new Uint8ClampedArray(mask.ctx.getImageData(0, 0, node.w, node.h).data), surface = local.params.surface;
      mask.normal = encodeNormalPlane({ rgba, width: node.w, height: node.h, normals: generateNormalPlane({ rgba, width: node.w, height: node.h, normal: surface?.normal }) });
      const material = ['solid', 'wall', 'unlit'].map(key => surface?.material?.[key] ? 255 : 0);
      for (let i = 0; i < node.w * node.h; i++) if (rgba[i * 4 + 3]) {
        mask.material.set(material, i * 4); mask.material[i * 4 + 3] = rgba[i * 4 + 3];
      }
      // Canonical flood paint replaces ImageData, including legacy fills that
      // carry erase:true; destination-out only applies to ordinary primitives.
      composite(content, mask, 0, 0, shape.type !== 'fill' && !!shape.params.erase, region, ctx => drawShape(ctx, local));
    }
    if (content !== target) composite(target, content, 0, 0);
    return target;
  };
  const raster = paint(scene.tree, scene.background), rgba = new Uint8ClampedArray(raster.ctx.getImageData(0, 0, width, height).data);
  const pixels = width * height, normals = new Float32Array(pixels * 3), materials = new Uint8Array(pixels * 3);
  const decode = value => value === 128 ? 0 : value / 127.5 - 1;
  for (let i = 0; i < pixels; i++) {
    const p = i * 4, k = i * 3;
    if (!rgba[p + 3]) continue;
    const x = decode(raster.normal[p]), y = -decode(raster.normal[p + 1]), z = Math.max(0, decode(raster.normal[p + 2])), length = Math.hypot(x, y, z);
    normals[k] = length ? x / length : 0; normals[k + 1] = length ? y / length : 0; normals[k + 2] = length ? z / length : 1;
    materials.set(raster.material.subarray(p, p + 3), k);
  }
  const normal = encodeNormalPlane({ rgba, normals, width, height });
  return { ...applySurfaceLighting({ rgba, normals, materials, width, height, lamps: scene.lamps, lighting: scene.lighting, palette: scene.palette }), normal, materials, lamps: scene.lamps };
}
