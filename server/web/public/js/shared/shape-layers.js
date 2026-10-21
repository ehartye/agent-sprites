import { translateSurface } from './surface-model.js';
// Pure retained layer planning shared by the server and every native browser raster.
export const LAYER_LIMITS = Object.freeze({ depth: 8, count: 8192, dimension: 2048, rasterWork: 64_000_000 });

function object(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!fields.includes(key)) throw new Error(`Unknown ${label} field "${key}"`);
}

/** Validate metadata without changing the canonical primitive or allocating a canvas. */
export function validateLayers(layers) {
  if (!Array.isArray(layers) || layers.length > LAYER_LIMITS.depth) throw new Error(`Shape layers must be an array of at most ${LAYER_LIMITS.depth} layers`);
  const ids = new Set();
  for (const layer of layers) {
    object(layer, ['id', 'x', 'y', 'w', 'h', 'z', 'background'], 'layer');
    if (typeof layer.id !== 'string' || !layer.id.length || layer.id.length > 1024 || /[\p{Cc}\p{Cs}]/u.test(layer.id) || ids.has(layer.id)) throw new Error('Layer IDs must be unique nonempty strings up to 1024 characters');
    ids.add(layer.id);
    if (![layer.x, layer.y, layer.z, layer.x + layer.w, layer.y + layer.h].every(Number.isSafeInteger)) throw new Error('Layer origin, bounds and z must be safe integers');
    if (![layer.w, layer.h].every(n => Number.isSafeInteger(n) && n >= 1 && n <= LAYER_LIMITS.dimension)) throw new Error(`Layer dimensions must be integers from 1 to ${LAYER_LIMITS.dimension}`);
    object(layer.background, layer.background?.mode === 'chroma' ? ['mode', 'color'] : ['mode'], 'layer background');
    if (layer.background.mode !== 'transparent' && layer.background.mode !== 'chroma') throw new Error('Layer background mode must be transparent or chroma');
    if (layer.background.mode === 'chroma' && !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(layer.background.color)) throw new Error('Layer chroma background must be a hex color');
  }
  return layers;
}

/** Copy global primitive geometry to a new origin. Layer origins move only explicitly. */
export function translateParams(params, dx, dy, { layers = false } = {}) {
  const p = structuredClone(params);
  if (Object.hasOwn(p, 'surface')) p.surface = translateSurface(p.surface, dx, dy);
  for (const key of ['x', 'x1', 'x2', 'cx']) if (key in p) p[key] += dx;
  for (const key of ['y', 'y1', 'y2', 'cy']) if (key in p) p[key] += dy;
  if (p.points) for (const point of p.points) { point.x += dx; point.y += dy; }
  if (layers && p.layers) for (const layer of p.layers) { layer.x += dx; layer.y += dy; }
  return p;
}

const signature = layer => JSON.stringify([layer.id, layer.x, layer.y, layer.w, layer.h, layer.z, layer.background.mode, layer.background.color]);

/** Group all members by their entire layer path, then sort paint units within each surface. */
export function buildLayerTree(shapes, width, height) {
  if (![width, height, width * height].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Layer root dimensions must be positive safe integers');
  const root = { kind: 'root', x: 0, y: 0, w: width, h: height, children: [] }, ids = new Map();
  for (const [index, shape] of shapes.entries()) {
    let parent = root;
    const layers = Object.hasOwn(shape.params ?? {}, 'layers') ? validateLayers(shape.params.layers) : [];
    for (const descriptor of layers) {
      let node = ids.get(descriptor.id);
      if (node) {
        if (node.parent !== parent || node.signature !== signature(descriptor)) throw new Error(`Inconsistent layer descriptor "${descriptor.id}"`);
      } else {
        if (ids.size >= LAYER_LIMITS.count) throw new Error(`Layer count exceeds ${LAYER_LIMITS.count}`);
        node = { kind: 'layer', ...structuredClone(descriptor), parent, signature: signature(descriptor), index, children: [] };
        ids.set(descriptor.id, node); parent.children.push(node);
      }
      parent = node;
    }
    parent.children.push({ kind: 'shape', shape, z: shape.zIndex ?? 0, index });
  }
  let rasterWork = 0;
  const visit = node => {
    node.erase = node.children.some(unit => unit.kind === 'shape' && unit.shape.params?.erase);
    rasterWork += node.w * node.h * (node.erase ? 2 : 1);
    if (!Number.isSafeInteger(rasterWork) || rasterWork > LAYER_LIMITS.rasterWork) throw new Error(`Layer raster work exceeds ${LAYER_LIMITS.rasterWork}-pixel budget`);
    node.children.sort((a, b) => a.z - b.z || a.index - b.index);
    for (const unit of node.children) if (unit.kind === 'layer') visit(unit);
  };
  visit(root);
  root.rasterWork = rasterWork; root.layerCount = ids.size;
  return root;
}

/** Draw with injected canonical primitive rules and canvas factory; no environment dependencies. */
export function paintLayerTree(ctx, tree, { createCanvas, drawShape }) {
  const paint = (target, node) => {
    if (node.background?.mode === 'chroma') {
      target.fillStyle = node.background.color;
      target.fillRect(0, 0, node.w, node.h);
    }
    const content = node.erase ? createCanvas(node.w, node.h) : null;
    const draw = content ? content.getContext('2d') : target;
    for (const unit of node.children) {
      draw.globalCompositeOperation = 'source-over';
      if (unit.kind === 'shape') {
        if (unit.shape.visible === false) continue;
        draw.globalCompositeOperation = unit.shape.params?.erase ? 'destination-out' : 'source-over';
        drawShape(draw, { ...unit.shape, params: translateParams(unit.shape.params, -node.x, -node.y) });
      } else {
        const child = createCanvas(unit.w, unit.h);
        paint(child.getContext('2d'), unit);
        draw.drawImage(child, unit.x - node.x, unit.y - node.y);
      }
    }
    if (content) { target.globalCompositeOperation = 'source-over'; target.drawImage(content, 0, 0); }
  };
  paint(ctx, tree);
}
