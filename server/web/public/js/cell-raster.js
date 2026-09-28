import { paintShapes } from './erase-layer.js';
import { snapParams, rasterShape, floodFill } from './shared/raster.js';

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
function rgbaOf(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  return [...ctx.getImageData(0, 0, 1, 1).data];
}

/**
 * Render a cell's shapes (already sorted by z) at native size on a transparent
 * offscreen canvas, exactly as the export does: shared shape rules, erase
 * layers and real flood fills.
 */
export function renderCellNative(shapes, width, height, resolveColor) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paintShapes(canvas.getContext('2d'), shapes, (ctx, shape) => {
    const color = resolveColor(shape.color);
    const p = snapParams(shape.params);
    if (shape.type === 'fill') {
      const image = ctx.getImageData(0, 0, width, height);
      if (floodFill(image, p.x, p.y, rgbaOf(color))) ctx.putImageData(image, 0, 0);
      return;
    }
    ctx.fillStyle = color;
    rasterShape(shape.type, p, pen(ctx, 0, 0, 1, p.color2 != null ? resolveColor(p.color2) : null));
  });
  return canvas;
}
