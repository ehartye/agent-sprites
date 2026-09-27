import { createCanvas } from 'canvas';

/** Opaque bounding box of RGBA data, or null when the cell is empty. */
function opaqueBounds(data, width, height) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!data[(y * width + x) * 4 + 3]) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Aseprite export with each cell packed as its opaque bounding box and real
 * spriteSourceSize offsets — the standard trimmed layout Phaser, Unity and
 * Godot importers honor. Frame names, tags, durations and the cell-relative
 * pivot slice are identical to the untrimmed export; only rectangles and the
 * sheet change. Empty cells share one transparent 1×1 pixel.
 */
export async function exportTrimmed(project, renderer, options) {
  if (project.background?.mode === 'chroma') throw new Error('Trimming needs a transparent background; a chroma background makes every pixel opaque.');
  const atlas = project.exportAseprite(options);
  const { cellWidth: cw, cellHeight: ch } = project, rows = project.cells.rows, cols = project.cells.cols;
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const data = renderer.renderCellRaw(project.cells.getCell(`${r},${c}`));
    cells.push({ key: `${c * cw},${r * ch}`, data, bounds: opaqueBounds(data, cw, ch) });
  }
  // Shelf packing in row-major order, never wider than the untrimmed sheet.
  const maxW = cols * cw;
  let x = 0, y = 0, shelf = 0;
  for (const cell of cells) {
    if (!cell.bounds) continue;
    if (x + cell.bounds.w > maxW) { x = 0; y += shelf; shelf = 0; }
    cell.packed = { x, y, w: cell.bounds.w, h: cell.bounds.h };
    x += cell.bounds.w; shelf = Math.max(shelf, cell.bounds.h);
  }
  const empty = cells.some(cell => !cell.bounds);
  let emptyPixel;
  if (empty) {
    if (x + 1 > maxW) { x = 0; y += shelf; shelf = 0; }
    emptyPixel = { x, y, w: 1, h: 1 }; x += 1; shelf = Math.max(shelf, 1);
  }
  const width = Math.max(1, ...cells.filter(c => c.packed).map(c => c.packed.x + c.packed.w), emptyPixel ? emptyPixel.x + 1 : 1);
  const height = Math.max(1, y + shelf);
  const sheet = createCanvas(width, height), ctx = sheet.getContext('2d');
  const scratch = createCanvas(cw, ch), sctx = scratch.getContext('2d');
  const byKey = new Map();
  for (const cell of cells) {
    if (cell.packed) {
      const image = sctx.createImageData(cw, ch); image.data.set(cell.data);
      sctx.clearRect(0, 0, cw, ch); sctx.putImageData(image, 0, 0);
      ctx.drawImage(scratch, cell.bounds.x, cell.bounds.y, cell.bounds.w, cell.bounds.h, cell.packed.x, cell.packed.y, cell.bounds.w, cell.bounds.h);
      byKey.set(cell.key, { frame: cell.packed, source: cell.bounds });
    } else byKey.set(cell.key, { frame: emptyPixel, source: { x: 0, y: 0, w: 1, h: 1 } });
  }
  for (const frame of atlas.frames) {
    const t = byKey.get(`${frame.frame.x},${frame.frame.y}`);
    frame.frame = { ...t.frame };
    frame.spriteSourceSize = { ...t.source };
    frame.trimmed = t.source.x !== 0 || t.source.y !== 0 || t.source.w !== cw || t.source.h !== ch;
  }
  atlas.meta.size = { w: width, h: height };
  return { png: sheet.toBuffer('image/png'), atlas };
}
