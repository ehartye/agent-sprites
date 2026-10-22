import { paintShapes } from './erase-layer.js';
import { snapParams, rasterShape, floodFill } from './shared/raster.js';
import { buildLayerTree, paintLayerTree } from './shared/shape-layers.js';
import { hasSurfaceData, renderSurfaceCell, surfaceChannel } from './shared/surface-raster.js';

/**
 * A pen that paints logical pixels onto `ctx` at offset (ox, oy) and size z.
 * `second` pixels use color2 when one is given; pass null to paint one colour
 * (the onion-skin tint).
 */
export function pen(ctx, ox, oy, z, color2) {
  return {
    px(x, y, second) {
      if (second && color2) {
        const base = ctx.fillStyle;
        ctx.fillStyle = color2;
        ctx.fillRect(ox + x * z, oy + y * z, z, z);
        ctx.fillStyle = base;
      } else {
        ctx.fillRect(ox + x * z, oy + y * z, z, z);
      }
    },
    rect(x, y, w, h) { ctx.fillRect(ox + x * z, oy + y * z, w * z, h * z); },
  };
}

/** Parse any CSS colour to [r, g, b, a] through a 1×1 canvas. */
function rgbaOf(color, createCanvas) {
  const c = createCanvas(1, 1);
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  return [...ctx.getImageData(0, 0, 1, 1).data];
}

const createNativeCanvas = (w, h) => {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  // Native masks repeatedly read pixels; this policy must be set on the first context request.
  canvas.getContext('2d', { willReadFrequently: true }); return canvas;
};

const nativeShapePainter = (resolveColor, createCanvas) => (ctx, shape) => {
  if (shape.visible === false) return;
  const color = resolveColor(shape.color);
  const p = snapParams(shape.params);
  if (shape.type === 'fill') {
    const image = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (floodFill(image, p.x, p.y, rgbaOf(color, createCanvas))) ctx.putImageData(image, 0, 0);
    return;
  }
  ctx.fillStyle = color;
  rasterShape(shape.type, p, pen(ctx, 0, 0, 1, p.color2 != null ? resolveColor(p.color2) : null));
};

/** Raw channels remain exact even when a display canvas quantizes partial alpha. */
export function renderCellNativeChannels(shapes, width, height, resolveColor, opts = {}) {
  surfaceChannel(opts.channel);
  const createCanvas = opts.createCanvas ?? createNativeCanvas;
  return renderSurfaceCell({ shapes, width, height, resolveColor, ...opts, createCanvas, drawShape: nativeShapePainter(resolveColor, createCanvas) });
}

/**
 * Render a cell's shapes (already sorted by z) at native size on a transparent
 * offscreen canvas, exactly as the export does: shared shape rules, erase
 * layers and real flood fills.
 */
export function renderCellNative(shapes, width, height, resolveColor, opts = {}) {
  const channel = surfaceChannel(opts.channel);
  const tree = shapes.some(shape => Object.hasOwn(shape.params ?? {}, 'layers')) ? buildLayerTree(shapes, width, height) : null;
  const createCanvas = opts.createCanvas ?? createNativeCanvas, drawShape = nativeShapePainter(resolveColor, createCanvas);
  if (channel !== 'color' || hasSurfaceData(shapes, opts.lighting)) {
    const channels = renderCellNativeChannels(shapes, width, height, resolveColor, opts);
    const canvas = createCanvas(width, height), ctx = canvas.getContext('2d'), image = ctx.createImageData(width, height);
    image.data.set(channels[channel]); ctx.putImageData(image, 0, 0); return canvas;
  }
  const canvas = createCanvas(width, height);
  if (opts.background?.mode === 'chroma') { const ctx = canvas.getContext('2d'); ctx.fillStyle = opts.background.color; ctx.fillRect(0, 0, width, height); }
  if (tree) paintLayerTree(canvas.getContext('2d'), tree, { createCanvas, drawShape });
  else paintShapes(canvas.getContext('2d'), shapes, drawShape, createCanvas);
  return canvas;
}
