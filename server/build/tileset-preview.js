import {existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import sharp from 'sharp';
import {decodePng} from '../engine/png-decode.js';

// Tileset preview: compose built frames into contact sheets (rooms, fence runs, icon boards) from a small JSON layout, with the same
// neighbour-mask rules a game uses at runtime. Reads built Aseprite atlases, writes whole-number nearest-neighbour PNGs.
//
// Layout (version 1), paths relative to the layout file:
//   { "version": 1, "atlases": {"objects": "dist/objects.atlas.json"}, "cell": 16, "background": "#c9a869", "scale": 4,
//     "sheets": { "room": { "size": [9, 8], "layers": [ ... ] } } }
// A layer stamps frames onto the sheet in order. Either one frame: {"frame": "prop_trough", "at": [8, 6], "atlas": "objects"}
// or a map of text rows with a glyph table:
//   {"at": [0, 0], "rows": ["#####", "#...#"], "glyphs": {"#": {"autotile": "wall_scrap", "joins": "#D"}, "D": {"frame": "door_scrap"}}}
// `autotile` glyphs pick `<autotile>_<mask>` from the glyph's neighbours (`mode` "blob" (default, 8 neighbours with the 47-mask diagonal
// rule) or "fence" (4 neighbours N=1 E=4 S=16 W=64)); `joins` lists the glyphs that count as neighbours (default: the glyph itself).
// A sheet or layer with `each: [{...}, ...]` is repeated per item with `${key}` replaced in every string (a numeric result stays a number).
const N = 1, NE = 2, E = 4, SE = 8, S = 16, SW = 32, W = 64, NW = 128;
const HEX = /^#[0-9a-fA-F]{6}$/;
export const TINTS = {night: {mul: [0.34, 0.42, 0.62], add: [0, 0, 24]}};

/** The 47-mask rule: a diagonal neighbour only counts when both adjacent orthogonal neighbours are present. */
export function connectMask(m) {
  if (!(m & N) || !(m & E)) m &= ~NE;
  if (!(m & E) || !(m & S)) m &= ~SE;
  if (!(m & S) || !(m & W)) m &= ~SW;
  if (!(m & W) || !(m & N)) m &= ~NW;
  return m;
}

const substitute = (value, vars) => {
  if (typeof value === 'string') {
    const out = value.replace(/\$\{(\w+)\}/g, (_, key) => { if (!(key in vars)) throw Error(`Layout uses \${${key}} but the each item has no "${key}".`); return String(vars[key]); });
    return out !== value && /^-?\d+$/.test(out) && /^\$\{\w+\}$/.test(value) ? Number(out) : out;
  }
  if (Array.isArray(value)) return value.map(v => substitute(v, vars));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [substitute(k, vars), substitute(v, vars)]));
  return value;
};
const expand = (def, what) => {
  if (def.each === undefined) return [def];
  if (!Array.isArray(def.each) || !def.each.length || def.each.some(v => !v || typeof v !== 'object' || Array.isArray(v))) throw Error(`${what}: each must be a nonempty array of objects.`);
  const {each, ...rest} = def;
  return each.map(vars => substitute(rest, vars));
};

function loadAtlases(atlases, base) {
  if (!atlases || typeof atlases !== 'object' || Array.isArray(atlases) || !Object.keys(atlases).length) throw Error('Layout needs atlases: an object mapping a name to a built .atlas.json path.');
  const out = new Map();
  for (const [name, path] of Object.entries(atlases)) {
    const atlasPath = resolve(base, String(path));
    if (!existsSync(atlasPath) || !statSync(atlasPath).isFile()) throw Error(`atlases.${name} "${path}" is not a file; build that set first.`);
    const atlas = JSON.parse(readFileSync(atlasPath, 'utf8'));
    if (!Array.isArray(atlas.frames) || typeof atlas.meta?.image !== 'string') throw Error(`atlases.${name} is not an Aseprite atlas.`);
    out.set(name, {frames: new Map(atlas.frames.map(f => [f.filename, f.frame])), png: decodePng(readFileSync(resolve(dirname(atlasPath), atlas.meta.image)))});
  }
  return out;
}

function parseColor(value, what) {
  if (!HEX.test(value ?? '')) throw Error(`${what} must be #rrggbb.`);
  return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
}

function tintOf(spec, what) {
  const t = typeof spec === 'string' ? TINTS[spec] : spec;
  if (!t || !Array.isArray(t.mul) || t.mul.length !== 3 || t.mul.some(v => typeof v !== 'number') || (t.add !== undefined && (!Array.isArray(t.add) || t.add.length !== 3 || t.add.some(v => typeof v !== 'number')))) throw Error(`${what} tint must be ${Object.keys(TINTS).join(', ')} or {mul: [r, g, b], add: [r, g, b]}.`);
  return {mul: t.mul, add: t.add ?? [0, 0, 0]};
}

function renderSheet(name, def, ctx) {
  const {cell, atlases, defaultAtlas, backgroundDefault} = ctx;
  if (!Array.isArray(def.size) || def.size.length !== 2 || def.size.some(v => !Number.isInteger(v) || v < 1)) throw Error(`sheet ${name}: size must be [columns, rows] in cells.`);
  const [cols, rows] = def.size, width = cols * cell, height = rows * cell, data = new Uint8Array(width * height * 4);
  const bg = parseColor(def.background ?? backgroundDefault, `sheet ${name}: background`);
  for (let i = 0; i < data.length; i += 4) { data[i] = bg[0]; data[i + 1] = bg[1]; data[i + 2] = bg[2]; data[i + 3] = 255; }
  const warnings = [];
  const stamp = (atlasName, frame, tx, ty, optional, where) => {
    const atlas = atlases.get(atlasName);
    if (!atlas) throw Error(`sheet ${name}: ${where} names atlas "${atlasName}", which is not in atlases.`);
    const f = atlas.frames.get(frame);
    if (!f) { if (optional) { warnings.push({code: 'missing-frame', message: `sheet ${name}: no frame ${frame} in ${atlasName}`}); return; } throw Error(`sheet ${name}: ${where}: ${atlasName} has no frame "${frame}".`); }
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const s = ((f.y + y) * atlas.png.width + f.x + x) * 4;
      if (atlas.png.data[s + 3] === 0) continue;
      const px = tx * cell + x, py = ty * cell + y;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const d = (py * width + px) * 4;
      data[d] = atlas.png.data[s]; data[d + 1] = atlas.png.data[s + 1]; data[d + 2] = atlas.png.data[s + 2]; data[d + 3] = 255;
    }
  };
  const point = (at, where) => { if (!Array.isArray(at) || at.length !== 2 || at.some(v => !Number.isInteger(v))) throw Error(`sheet ${name}: ${where}: at must be [x, y] in cells.`); return at; };
  (def.layers ?? []).flatMap((layer, i) => expand(layer, `sheet ${name} layer ${i}`).map(l => [l, i])).forEach(([layer, i]) => {
    const where = `layer ${i}`, [ox, oy] = point(layer.at ?? [0, 0], where), atlasName = layer.atlas ?? defaultAtlas, optional = !!layer.optional;
    if (layer.frame !== undefined) { stamp(atlasName, layer.frame, ox, oy, optional, where); return; }
    if (!Array.isArray(layer.rows) || !layer.rows.length || layer.rows.some(r => typeof r !== 'string')) throw Error(`sheet ${name}: ${where} needs frame or rows.`);
    const glyphs = layer.glyphs ?? {}, at = (x, y) => layer.rows[y]?.[x];
    layer.rows.forEach((line, y) => [...line].forEach((ch, x) => {
      if (ch === '.' || ch === ' ') return;
      const g = glyphs[ch];
      if (!g) throw Error(`sheet ${name}: ${where} row ${y + 1} uses glyph "${ch}", which is not in glyphs.`);
      const glyphAtlas = g.atlas ?? atlasName;
      if (g.frame !== undefined) return stamp(glyphAtlas, g.frame, ox + x, oy + y, optional || !!g.optional, where);
      if (typeof g.autotile !== 'string') throw Error(`sheet ${name}: glyph "${ch}" needs frame or autotile.`);
      const joins = g.joins ?? ch, has = (dx, dy) => { const c = at(x + dx, y + dy); return c !== undefined && joins.includes(c) && c !== '.'; };
      const mode = g.mode ?? 'blob';
      if (!['blob', 'fence'].includes(mode)) throw Error(`sheet ${name}: glyph "${ch}" mode must be blob or fence.`);
      const mask = mode === 'fence'
        ? (has(0, -1) ? N : 0) | (has(1, 0) ? E : 0) | (has(0, 1) ? S : 0) | (has(-1, 0) ? W : 0)
        : connectMask((has(0, -1) ? N : 0) | (has(1, -1) ? NE : 0) | (has(1, 0) ? E : 0) | (has(1, 1) ? SE : 0) | (has(0, 1) ? S : 0) | (has(-1, 1) ? SW : 0) | (has(-1, 0) ? W : 0) | (has(-1, -1) ? NW : 0));
      stamp(glyphAtlas, `${g.autotile}_${mask}`, ox + x, oy + y, optional || !!g.optional, where);
    }));
  });
  const tint = def.tint !== undefined ? tintOf(def.tint, `sheet ${name}`) : ctx.tint;
  if (tint) for (let i = 0; i < data.length; i += 4) for (let k = 0; k < 3; k++) data[i + k] = Math.min(255, Math.max(0, Math.round(data[i + k] * tint.mul[k] + tint.add[k])));
  return {width, height, data, warnings};
}

/** Render every sheet of a layout. Returns {ok, sheets: [{name, file, width, height}], warnings}; writes PNGs into `outDir`. */
export async function renderTilesetPreview(layoutPath, {outDir, scale, night = false} = {}) {
  const result = {ok: false, sheets: [], warnings: [], errors: []};
  try {
    layoutPath = resolve(layoutPath);
    const layout = JSON.parse(readFileSync(layoutPath, 'utf8')), base = dirname(layoutPath);
    if (layout?.version !== 1) throw Error('Layout requires version: 1.');
    if (!layout.sheets || typeof layout.sheets !== 'object' || Array.isArray(layout.sheets) || !Object.keys(layout.sheets).length) throw Error('Layout needs sheets: an object mapping a sheet name to its definition.');
    const cell = layout.cell ?? 16, factor = scale ?? layout.scale ?? 4;
    if (!Number.isInteger(cell) || cell < 1) throw Error('cell must be a positive integer.');
    if (!Number.isInteger(factor) || factor < 1) throw Error('scale must be a whole number of at least 1 (nearest-neighbour only).');
    if (!outDir) throw Error('An output directory is required (--out).');
    const atlases = loadAtlases(layout.atlases, base), ctx = {cell, atlases, defaultAtlas: Object.keys(layout.atlases)[0], backgroundDefault: layout.background ?? '#c9a869', tint: night ? tintOf('night', 'night') : layout.tint !== undefined ? tintOf(layout.tint, 'layout') : null};
    const out = resolve(outDir);
    mkdirSync(out, {recursive: true});
    const names = new Set();
    for (const [key, def] of Object.entries(layout.sheets)) {
      const variants = expand(def, `sheet ${key}`).map((sheet, i) => [def.each === undefined ? key : substitute(key, def.each[i]), sheet]);
      for (const [name, sheet] of variants) {
        if (names.has(name)) throw Error(`Two sheets are named ${name}.`);
        names.add(name);
        if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name)) throw Error(`Invalid sheet name "${name}".`);
        const r = renderSheet(name, sheet, ctx);
        const big = Buffer.alloc(r.width * factor * r.height * factor * 4);
        for (let y = 0; y < r.height * factor; y++) for (let x = 0; x < r.width * factor; x++) {
          const s = (Math.floor(y / factor) * r.width + Math.floor(x / factor)) * 4, d = (y * r.width * factor + x) * 4;
          big[d] = r.data[s]; big[d + 1] = r.data[s + 1]; big[d + 2] = r.data[s + 2]; big[d + 3] = r.data[s + 3];
        }
        const file = join(out, `${name}.png`);
        writeFileSync(file, await sharp(big, {raw: {width: r.width * factor, height: r.height * factor, channels: 4}}).png().toBuffer());
        result.sheets.push({name, file, width: r.width * factor, height: r.height * factor});
        result.warnings.push(...r.warnings);
      }
    }
    result.ok = true;
  } catch (error) { result.errors.push({code: 'preview', message: error.message}); }
  return result;
}
