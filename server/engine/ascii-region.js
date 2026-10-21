import { CanvasRenderer } from './canvas-renderer.js';

const LIMIT = 4096;
const SYMBOLS = { keep: '.', erase: '_', unknown: '?' };
const CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function region(cell, { x = 0, y = 0, w, h }) {
  if (![x, y, w, h].every(Number.isSafeInteger)) throw new Error('Region x, y, w and h must be exact integers');
  if (w < 1 || h < 1 || x < 0 || y < 0 || x + w > cell.width || y + h > cell.height) throw new Error('Region is outside cell bounds');
  if (w * h > LIMIT) throw new Error(`ASCII regions are limited to ${LIMIT} pixels`);
  return { x, y, w, h };
}

function colorMap(palette, colors) {
  const entries = colors == null
    ? palette.list().filter(({ color }) => /^#[\da-f]{6}$/i.test(color)).slice(0, CHARACTERS.length).map(({ color }, i) => [CHARACTERS[i], color])
    : Object.entries(colors);
  if (colors != null && (typeof colors !== 'object' || Array.isArray(colors))) throw new Error('colors must be a character-to-color object');
  const result = {};
  for (const [character, ref] of entries) {
    if (character.length !== 1 || !/^[\x20-\x7e]$/.test(character)) throw new Error('Use single printable ASCII color characters');
    if (Object.values(SYMBOLS).includes(character)) throw new Error(`Character "${character}" is reserved`);
    const color = typeof ref === 'string' ? palette.resolve(ref) : '';
    if (!/^#[\da-f]{6}$/i.test(color)) throw new Error(`Invalid opaque RGB color for "${character}": ${ref}`);
    result[character] = color.toLowerCase();
  }
  return result;
}

export function readAsciiRegion(cell, palette, options = {}) {
  const bounds = region(cell, options), colors = colorMap(palette, options.colors);
  const inverse = new Map();
  for (const [character, color] of Object.entries(colors)) if (!inverse.has(color)) inverse.set(color, character);
  const rgba = new CanvasRenderer(palette, { background: options.background }).renderCellRaw(cell);
  const rows = [], unmapped = [];
  for (let y = bounds.y; y < bounds.y + bounds.h; y++) {
    let row = '';
    for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
      const offset = (y * cell.width + x) * 4;
      const hex = '#' + [...rgba.slice(offset, offset + 4)].map(n => n.toString(16).padStart(2, '0')).join('');
      const character = rgba[offset + 3] === 0 ? SYMBOLS.erase : rgba[offset + 3] === 255 ? inverse.get(hex.slice(0, 7)) : null;
      row += character ?? SYMBOLS.unknown;
      if (character == null) unmapped.push({ x, y, rgba: hex });
    }
    rows.push(row);
  }
  return { ...bounds, rows, colors, ...SYMBOLS, unmapped };
}

export function patchAsciiRegion(cell, palette, options = {}) {
  const rows = typeof options.rows === 'string' ? options.rows.replaceAll('\r\n', '\n').split('\n') : options.rows;
  if (!Array.isArray(rows) || !rows.length || rows.some(row => typeof row !== 'string' || row.length !== rows[0].length)) throw new Error('ASCII rows must be nonempty and rectangular');
  const bounds = region(cell, { ...options, w: rows[0].length, h: rows.length });
  const colors = colorMap(palette, options.colors);
  const prefix = options.prefix ?? 'patch';
  if (typeof prefix !== 'string' || !/^[\w-]{1,80}$/.test(prefix)) throw new Error('Patch prefix must contain 1–80 letters, digits, underscores or hyphens');
  const edits = [];
  for (let dy = 0; dy < bounds.h; dy++) for (let dx = 0; dx < bounds.w; dx++) {
    const character = rows[dy][dx];
    if (character === SYMBOLS.keep) continue;
    if (character !== SYMBOLS.erase && !Object.hasOwn(colors, character)) throw new Error(`Unmapped patch character "${character}" at ${dx},${dy}`);
    const x = bounds.x + dx, y = bounds.y + dy, name = `${prefix}:${x},${y}`;
    const existing = cell.shapes.getByName(name);
    if (existing && (existing.type !== 'point' || existing.params.asciiPatch !== prefix)) throw new Error(`Shape "${name}" is not owned by this patch`);
    edits.push({ existing, x, y, name, erase: character === SYMBOLS.erase, color: colors[character] ?? '#ffffff' });
  }
  const shapes = cell.transaction(() => {
    if (edits.length) cell._nextZ = cell.shapes.listByZ().reduce((z, shape) => Math.max(z, shape.zIndex + 1), cell._nextZ);
    return edits.map(({ existing, x, y, name, erase, color }) => {
      const params = { x, y, erase, asciiPatch: prefix };
      if (!existing) return cell.draw('point', params, color, name).toJSON();
      cell.updateShapeParams(name, params);
      cell.recolorShape(name, color);
      cell.setZ(name, cell._nextZ++);
      return existing.toJSON();
    });
  });
  return { changed: edits.length, shapes };
}
