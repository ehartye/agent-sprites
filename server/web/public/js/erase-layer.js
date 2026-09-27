// Erase shapes punch transparency through the shapes below them, never through
// the editor's checkerboard, clip, dimming or tracing reference. Cells without
// an erase shape paint directly, exactly as before.
export function paintShapes(ctx, shapes, paint) {
  if (!shapes.some(shape => shape.params?.erase)) {
    for (const shape of shapes) paint(ctx, shape);
    return;
  }
  const layer = document.createElement('canvas');
  layer.width = ctx.canvas.width;
  layer.height = ctx.canvas.height;
  const lctx = layer.getContext('2d');
  lctx.setTransform(ctx.getTransform());
  lctx.imageSmoothingEnabled = false;
  for (const shape of shapes) {
    lctx.globalCompositeOperation = shape.params?.erase ? 'destination-out' : 'source-over';
    paint(lctx, shape);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}
