import {readFileSync, existsSync, statSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {decodePng} from '../engine/png-decode.js';
import {shadowPixels, shadeTiles} from './tileset-shadow.js';
import {pipFrames, crackFrames} from './tileset-marks.js';
import {autotileTiles, AUTOTILE_KINDS, AUTOTILE_ROLES, MATERIALS, BLOB_MASKS, FENCE_MASKS, MASK_CONVENTION} from './tileset-autotile.js';

// Tileset recipe: a regular grid of equal cells (frame index = row-major cell index) described in
// plain-text `.pxl` sources. See examples/tileset/README.md for the grammar.
const HEX = /^#[0-9a-fA-F]{6}$/;
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const FIELDS = ['name', 'kind', 'cell', 'columns', 'sources', 'palette', 'imports'];
const MAX_CELL = 512, MAX_SOURCE_BYTES = 4 * 1024 * 1024;

const luminance = hex => { const n = parseInt(hex.slice(1), 16); return .2126 * (n >> 16) + .7152 * ((n >> 8) & 255) + .0722 * (n & 255); };
/** A darker, slightly cooler step of a colour, used when a palette entry names no outline. */
export function darken(hex) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (v, k) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0');
  return `#${f(r, .42)}${f(g, .42)}${f(b, .5)}`;
}

/** Parse the key=value options that follow a directive's positional words. */
function options(words, where) {
  const out = {flags: new Set(), values: {}};
  for (const w of words) {
    const eq = w.indexOf('=');
    if (eq < 0) out.flags.add(w); else out.values[w.slice(0, eq)] = w.slice(eq + 1);
  }
  out.where = where;
  return out;
}

function applyOutline(pixels, outline) {
  const h = pixels.length, w = pixels[0].length, result = pixels.map(row => row.map(p => p));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (pixels[y][x]) continue;
    let best = null;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const p = pixels[y + dy]?.[x + dx];
      if (!p) continue;
      const c = typeof outline === 'string' ? outline : p.outline ?? darken(p.color);
      if (!best || luminance(c) < luminance(best)) best = c;
    }
    if (best) result[y][x] = {color: best, outline: best, generated: true};
  }
  return result;
}

const toColors = pixels => pixels.map(row => row.map(p => p ? p.color : null));

/**
 * Read the built sheets a tileset may crop from: `imports` maps a name to another set's Aseprite atlas (a path relative to the
 * build config). Returns Map(name -> {frames: Map(filename -> rect), png: {width, height, data}}).
 */
export function loadTilesetImports(imports, baseDir) {
  const out = new Map();
  if (imports === undefined) return out;
  if (!imports || typeof imports !== 'object' || Array.isArray(imports)) throw Error('tileset.imports must be an object mapping a name to a built atlas path.');
  for (const [name, path] of Object.entries(imports)) {
    if (!NAME.test(name)) throw Error(`Invalid import name "${name}".`);
    if (typeof path !== 'string' || !path) throw Error(`tileset.imports.${name} must be the path of a built .atlas.json.`);
    const atlasPath = resolve(baseDir, path);
    if (!existsSync(atlasPath) || !statSync(atlasPath).isFile()) throw Error(`tileset.imports.${name} "${path}" is not a file; build that set first (build-set orders it before this one).`);
    let atlas;
    try { atlas = JSON.parse(readFileSync(atlasPath, 'utf8')); } catch (error) { throw Error(`tileset.imports.${name}: ${error.message}`); }
    if (!Array.isArray(atlas?.frames) || typeof atlas.meta?.image !== 'string') throw Error(`tileset.imports.${name} is not an Aseprite atlas (frames array and meta.image).`);
    const pngPath = resolve(dirname(atlasPath), atlas.meta.image);
    if (!existsSync(pngPath)) throw Error(`tileset.imports.${name}: sheet ${atlas.meta.image} is missing next to the atlas.`);
    let png;
    try { png = decodePng(readFileSync(pngPath)); } catch (error) { throw Error(`tileset.imports.${name}: ${error.message}`); }
    out.set(name, {frames: new Map(atlas.frames.map(f => [f.filename, f.frame])), png});
  }
  return out;
}

/** Parse source text into tile definitions, resolving palette characters as it goes. */
export function parseTilesetSource(text, file, state) {
  const {cellW, cellH, palette, tiles} = state;
  if (text.length > MAX_SOURCE_BYTES) throw Error(`${file}: source is larger than ${MAX_SOURCE_BYTES} bytes.`);
  // A UTF-8 BOM and indentation are tolerated; ` % note` after any line is a comment (art rows never contain spaces).
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n').map(l => l.trim().replace(/\s+%.*$/, ''));
  let i = 0, last = '';
  const fail = (msg, line = i) => { throw Error(`${file}:${line + 1}: ${msg}`); };
  // Check mode records recoverable row problems (wrong width, unknown palette character) and keeps parsing so one run lists them all.
  const problem = (code, message, extra) => {
    if (!state.diagnostics) fail(message);
    state.diagnostics.push({code, file, line: i + 1, message: `${file}:${i + 1}: ${message}`, ...extra});
  };
  const isDirective = line => line.startsWith('@');
  const next = () => { while (i < lines.length && (!lines[i].trim() || lines[i].startsWith('%'))) i++; return i < lines.length ? lines[i] : null; };
  // Art may be smaller than the cell: x=, y=, w= and rows= place a w-by-rows block inside it.
  const placed = (o, what) => {
    const num = (key, dflt) => { const v = o.values[key] === undefined ? dflt : Number(o.values[key]); if (!Number.isInteger(v) || v < 0) fail(`${what}: ${key}= must be a non-negative integer.`); return v; };
    const x = num('x', 0), y = num('y', 0), w = num('w', cellW - x), n = num('rows', cellH - y);
    if (w < 1 || n < 1 || x + w > cellW || y + n > cellH) fail(`${what}: a ${w}x${n} block at ${x},${y} does not fit a ${cellW}x${cellH} cell.`);
    const rows = readRows(n, what, w);
    const grid = Array.from({length: cellH}, () => Array(cellW).fill(null));
    rows.forEach((row, ry) => row.forEach((p, rx) => { grid[y + ry][x + rx] = p; }));
    return grid;
  };
  const readRows = (count, what, width = cellW) => {
    const rows = [];
    while (rows.length < count) {
      const line = next();
      if (line === null || isDirective(line)) fail(`${what} needs ${count} rows, found ${rows.length}; add the missing rows (cell rows are ${cellH} tall, ${cellW} wide).`, Math.min(i, lines.length - 1));
      if (line === '---') fail(`${what} needs ${count} rows, found ${rows.length} before "---"; add the missing rows.`);
      let chars = [...line];
      if (chars.length !== width) {
        problem('row-width', `${what} row ${rows.length + 1} is ${chars.length} wide; expected ${width}.`, {tile: what, row: rows.length + 1, expected: width, actual: chars.length});
        chars = Array.from({length: width}, (_, k) => chars[k] ?? '.');
      }
      rows.push(chars.map(ch => {
        if (ch === '.') return null;
        const entry = palette.get(ch);
        if (!entry) { problem('palette', `${what}: palette has no entry for "${ch}".`, {tile: what, char: ch}); return null; }
        return {...entry, ch};
      }));
      i++;
    }
    return rows;
  };
  const addTile = (name, pixels, line, extra = {}) => {
    if (!NAME.test(name)) fail(`Invalid tile name "${name}".`, line);
    if (state.names.has(name)) fail(`Duplicate tile name "${name}".`, line);
    state.names.add(name);
    tiles.push({name, pixels, source: `${file}:${line + 1}`, ...extra});
  };
  while (true) {
    const line = next();
    if (line === null) break;
    if (!isDirective(line)) fail(`Expected a directive (@palette, @tile, @anim, @recolor, @copy, @autotile, @shadow, @shade, @pips, @cracks, @crop).${last ? ` This may be an extra row after ${last}, which already had its full row count.` : ''}`);
    const start = i, words = line.slice(1).trim().split(/\s+/), directive = words[0], rest = words.slice(1);
    i++;
    if (directive === 'tile' || directive === 'anim') last = `${directive} ${rest[0] ?? ''}`.trim(); else last = '';
    if (directive === 'palette') {
      while (i < lines.length) {
        const entry = next();
        if (entry === null || isDirective(entry)) break;
        const parts = entry.trim().split(/\s+/);
        const [ch, color, outline] = parts;
        if ([...ch].length !== 1 || ch === '.' || ch === '@' || ch === '%' || /\s/.test(ch)) fail(`Palette lines start with one character that is not ".", "@", "%" or whitespace.`);
        if (!HEX.test(color ?? '') || (outline !== undefined && !HEX.test(outline)) || parts.length > 3) fail('Palette lines are: <char> #rrggbb [#outline].');
        palette.set(ch, {color: color.toLowerCase(), ...(outline ? {outline: outline.toLowerCase()} : {})});
        i++;
      }
    } else if (directive === 'tile') {
      const [name, ...opts] = rest;
      if (!name) fail('@tile needs a name.', start);
      const o = options(opts);
      const raw = placed(o, `Tile ${name}`);
      let pixels = raw;
      if (o.values.outline !== undefined && !HEX.test(o.values.outline)) fail('outline=#rrggbb needs a six digit colour.', start);
      if (o.flags.has('outline') || o.values.outline) pixels = applyOutline(pixels, o.values.outline);
      addTile(name, toColors(pixels), start, {raw, outlineOption: o, template: o.flags.has('template')});
    } else if (directive === 'anim') {
      const [name, ...opts] = rest;
      if (!name) fail('@anim needs a name.', start);
      const o = options(opts), fps = Number(o.values.fps ?? 8);
      if (!(fps > 0)) fail('@anim fps must be positive.', start);
      const frames = [];
      while (true) {
        const peek = next();
        if (peek === null || isDirective(peek)) break;
        if (peek.trim() === '---') { i++; continue; }
        frames.push(placed(o, `Animation ${name} frame ${frames.length}`));
      }
      if (frames.length < 2) fail(`Animation ${name} needs at least two frames.`, start);
      const names = frames.map((rows, k) => {
        const px = o.flags.has('outline') || o.values.outline ? applyOutline(rows, o.values.outline) : rows;
        const frameName = `${name}_${k}`;
        addTile(frameName, toColors(px), start, {animation: name, raw: rows, outlineOption: o});
        return frameName;
      });
      state.animations.push({name, fps, frames: names});
    } else if (directive === 'recolor') {
      // @recolor <new> <source> A=B ...: the source tile again with palette characters swapped (tool tiers, seasonal tints).
      const [name, from, ...pairs] = rest;
      const src = tiles.find(t => t.name === from);
      if (!name || !src || !src.raw) fail(`@recolor needs a new name and an existing hand-drawn tile (${from ?? 'missing'}).`, start);
      const map = new Map();
      for (const pair of pairs) {
        const [a, b] = pair.split('=');
        if ([...(a ?? '')].length !== 1 || [...(b ?? '')].length !== 1) fail(`Recolor pairs are single characters, like a=K (got "${pair}").`, start);
        if (!palette.has(b)) fail(`Recolor target "${b}" has no palette entry.`, start);
        if (!src.raw.some(row => row.some(p => p && p.ch === a))) fail(`@recolor ${name}: ${from} has no "${a}" pixels to replace.`, start);
        map.set(a, {...palette.get(b), ch: b});
      }
      if (!map.size) fail('@recolor needs at least one A=B pair.', start);
      const raw = src.raw.map(row => row.map(p => (p && map.has(p.ch) ? map.get(p.ch) : p)));
      const o = src.outlineOption;
      const painted = o.flags.has('outline') || o.values.outline ? applyOutline(raw, o.values.outline) : raw;
      addTile(name, toColors(painted), start, {raw, outlineOption: o, recolorOf: from});
    } else if (directive === 'copy') {
      const [name, from] = rest;
      const src = tiles.find(t => t.name === from);
      if (!name || !src) fail(`@copy needs a new name and an existing tile (${from ?? 'missing'}).`, start);
      addTile(name, src.pixels.map(row => row.slice()), start, {copyOf: from});
    } else if (directive === 'autotile') {
      const [kind, materialName, as, prefix, ...opts] = rest;
      if (!kind || !materialName || as !== 'as' || !prefix) fail('@autotile is: @autotile <kind> <material> as <prefix> [role=#hex ...] [face=N] [ragged=N seed=N offset=X,Y].', start);
      if (!AUTOTILE_KINDS.includes(kind)) fail(`Unknown auto-tile kind "${kind}" (${AUTOTILE_KINDS.join(', ')}).`, start);
      const o = options(opts), overrides = {};
      for (const [k, v] of Object.entries(o.values)) if (AUTOTILE_ROLES.includes(k)) overrides[k] = v; else if (!['face', 'leaf', 'ragged', 'seed', 'offset'].includes(k)) fail(`Unknown auto-tile option "${k}".`, start);
      const shape = {};
      if (o.values.ragged !== undefined) {
        const ragged = Number(o.values.ragged);
        if (!['wall', 'roof'].includes(kind)) fail(`ragged= applies to wall and roof sets, not ${kind}.`, start);
        if (!Number.isInteger(ragged) || ragged < 1 || ragged > 4) fail('ragged= must be an integer from 1 to 4 (the deepest crumble, in pixels).', start);
        shape.ragged = ragged;
      }
      if (o.values.seed !== undefined) {
        const seed = Number(o.values.seed);
        if (!['wall', 'roof'].includes(kind)) fail(`seed= applies to ragged wall and roof sets, not ${kind}.`, start);
        if (o.values.ragged === undefined) fail('seed= needs ragged= (it picks the crumble profile).', start);
        if (!Number.isInteger(seed) || seed < 0 || seed > 255) fail('seed= must be an integer from 0 to 255.', start);
        shape.seed = seed;
      }
      if (o.values.offset !== undefined) {
        const parts = o.values.offset.split(',').map(Number);
        if (!['wall', 'floor', 'roof'].includes(kind)) fail(`offset= applies to wall, floor and roof sets, not ${kind}.`, start);
        if (parts.length !== 2 || parts.some(v => !Number.isInteger(v) || v < 0 || v > 15)) fail('offset= is x,y with each an integer from 0 to 15 (the pattern origin).', start);
        shape.offset = parts;
      }
      if (o.values.face !== undefined) {
        const face = Number(o.values.face);
        if (!['wall', 'roof', 'door'].includes(kind)) fail(`face= applies to wall, roof and door sets, not ${kind}.`, start);
        if (!Number.isInteger(face) || face < 1 || face > 8) fail('face= must be an integer from 1 to 8.', start);
      }
      if (o.values.leaf !== undefined && kind !== 'door') fail('leaf= applies only to door sets.', start);
      let set;
      try { set = autotileTiles({kind, material: materialName, prefix, size: cellW, overrides, face: o.values.face === undefined ? undefined : Number(o.values.face), leaf: o.values.leaf, ...shape}); }
      catch (error) { fail(error.message, start); }
      if (cellW !== cellH) fail('Auto-tiles need square cells.', start);
      for (const t of set) addTile(t.name, t.pixels, start, {autotile: prefix, mask: t.mask});
      state.autotiles[prefix] = {kind, material: materialName, ...(Object.keys(shape).length ? {options: shape} : {}), masks: set.filter(t => t.mask !== undefined).map(t => t.mask), frames: set.map(t => t.name)};
    } else if (directive === 'shadow') {
      // @shadow <name> w=<n> h=<n> [x= y=] [color=#hex]: a stepped contact-shadow silhouette, hard alpha, one colour.
      const [name, ...opts] = rest;
      if (!name) fail('@shadow needs a name.', start);
      const o = options(opts), num = key => { const v = Number(o.values[key]); if (!Number.isInteger(v) || v < 1) fail(`@shadow ${name}: ${key}= must be a positive integer.`, start); return v; };
      for (const k of Object.keys(o.values)) if (!['w', 'h', 'x', 'y', 'color'].includes(k)) fail(`@shadow ${name}: unknown option ${k}=.`, start);
      const sw = num('w'), sh = num('h');
      if (sw > cellW || sh > cellH) fail(`@shadow ${name}: a ${sw}x${sh} silhouette does not fit a ${cellW}x${cellH} cell.`, start);
      const x = o.values.x === undefined ? Math.floor((cellW - sw) / 2) : Number(o.values.x), y = o.values.y === undefined ? Math.floor((cellH - sh) / 2) : Number(o.values.y);
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x + sw > cellW || y + sh > cellH) fail(`@shadow ${name}: x= and y= must keep the silhouette inside the cell.`, start);
      let block;
      try { block = shadowPixels({w: sw, h: sh, color: o.values.color}); } catch (error) { fail(error.message, start); }
      const pixels = Array.from({length: cellH}, () => Array(cellW).fill(null));
      block.forEach((row, ry) => row.forEach((c, rx) => { pixels[y + ry][x + rx] = c; }));
      addTile(name, pixels, start, {shadow: true});
    } else if (directive === 'shade') {
      // @shade <prefix> n=<rows> w=<cols> [e=<cols>] [s=<rows>] [color=#hex]: edge occlusion bands for ground beside tall things.
      const [prefix, ...opts] = rest;
      if (!prefix) fail('@shade needs a prefix.', start);
      const o = options(opts);
      for (const k of Object.keys(o.values)) if (!['n', 'w', 'e', 's', 'color'].includes(k)) fail(`@shade ${prefix}: unknown option ${k}=.`, start);
      if (cellW !== cellH) fail('@shade needs square cells.', start);
      let set;
      try { set = shadeTiles({prefix, size: cellW, n: Number(o.values.n), w: Number(o.values.w), e: o.values.e === undefined ? 0 : Number(o.values.e), s: o.values.s === undefined ? 0 : Number(o.values.s), color: o.values.color}); } catch (error) { fail(error.message, start); }
      for (const t of set) addTile(t.name, t.pixels, start, {autotile: prefix, mask: t.mask});
      state.autotiles[prefix] = {kind: 'shade', material: 'shadow', masks: set.map(t => t.mask), frames: set.map(t => t.name), convention: Number(o.values.s) > 0 ? 'N=1 E=4 SE=8 S=16 SW=32 W=64 NW=128: a set bit means that neighbour casts onto this tile (S: the wall below, a contact line along the bottom); a diagonal bit is dropped when either adjacent cardinal is set' : 'N=1 E=4 W=64 NW=128: a set bit means that neighbour casts onto this tile; NW is dropped when N or W is set'};
    } else if (directive === 'crop') {
      // @crop <name> from=<import>:<frame> [src=X,Y] [size=WxH] [x= y=] [outline|outline=#hex] [template] [unknown=error|drop|keep] [trim=#hex,...]:
      // a region of another set's built frame, mapped back to palette entries, placed like a @tile block. The icon is then always the very art it shows.
      const [name, ...opts] = rest;
      if (!name) fail('@crop needs a name.', start);
      const o = options(opts);
      for (const k of Object.keys(o.values)) if (!['from', 'src', 'size', 'x', 'y', 'outline', 'unknown', 'trim'].includes(k)) fail(`@crop ${name}: unknown option ${k}=.`, start);
      for (const f of o.flags) if (!['outline', 'template'].includes(f)) fail(`@crop ${name}: unknown option ${f}.`, start);
      const [importName, frameName] = (o.values.from ?? '').split(':');
      if (!importName || !frameName) fail(`@crop ${name}: from= is <import>:<frame>, like from=objects:wall_adobe_255.`, start);
      const source = state.imports.get(importName);
      if (!source) fail(`@crop ${name}: no import "${importName}" (declare it in tileset.imports${state.imports.size ? `; have ${[...state.imports.keys()].join(', ')}` : ''}).`, start);
      const rect = source.frames.get(frameName);
      if (!rect) fail(`@crop ${name}: import "${importName}" has no frame "${frameName}".`, start);
      const pair = (key, dflt, sep) => { const v = o.values[key] === undefined ? dflt : o.values[key].split(sep).map(Number); if (v.length !== 2 || v.some(n => !Number.isInteger(n) || n < 0)) fail(`@crop ${name}: ${key}= is two non-negative integers separated by "${sep}".`, start); return v; };
      const [sx, sy] = pair('src', [0, 0], ','), [cw, ch] = pair('size', [rect.w - sx, rect.h - sy], 'x');
      if (cw < 1 || ch < 1 || sx + cw > rect.w || sy + ch > rect.h) fail(`@crop ${name}: a ${cw}x${ch} region at ${sx},${sy} does not fit the ${rect.w}x${rect.h} frame ${frameName}.`, start);
      const dx = o.values.x === undefined ? sx : Number(o.values.x), dy = o.values.y === undefined ? sy : Number(o.values.y);
      if (!Number.isInteger(dx) || !Number.isInteger(dy) || dx < 0 || dy < 0 || dx + cw > cellW || dy + ch > cellH) fail(`@crop ${name}: a ${cw}x${ch} block at ${dx},${dy} does not fit a ${cellW}x${cellH} cell.`, start);
      const unknown = o.values.unknown ?? 'error';
      if (!['error', 'drop', 'keep'].includes(unknown)) fail('unknown= is error, drop or keep.', start);
      const trim = new Set((o.values.trim ?? '').split(',').filter(Boolean).map(c => c.toLowerCase()));
      for (const c of trim) if (!HEX.test(c)) fail('trim= is a comma list of #rrggbb colours.', start);
      if (o.values.outline !== undefined && !HEX.test(o.values.outline)) fail('outline=#rrggbb needs a six digit colour.', start);
      // colour -> palette entry; when two characters share a fill the later line wins
      const byColor = new Map();
      for (const [c, entry] of palette) byColor.set(entry.color, {...entry, ch: c});
      const block = Array.from({length: ch}, (_, y) => Array.from({length: cw}, (_, x) => {
        const i = ((rect.y + sy + y) * source.png.width + rect.x + sx + x) * 4, d = source.png.data;
        if (d[i + 3] === 0) return null;
        const hex = '#' + [0, 1, 2].map(k => d[i + k].toString(16).padStart(2, '0')).join('');
        const entry = byColor.get(hex);
        if (entry) return {...entry};
        if (unknown === 'keep') return {color: hex};
        if (unknown === 'drop') return null;
        return fail(`@crop ${name}: ${importName}:${frameName} (${sx + x},${sy + y}) is ${hex}, which is not in the palette (unknown=drop or keep, or add it).`, start);
      }));
      if (trim.size) {
        const clear = (x, y) => !block[y]?.[x];
        const doomed = [];
        block.forEach((row, y) => row.forEach((p, x) => { if (p && trim.has(p.color) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ax, ay]) => clear(x + ax, y + ay))) doomed.push([x, y]); }));
        for (const [x, y] of doomed) block[y][x] = null;
      }
      const raw = Array.from({length: cellH}, () => Array(cellW).fill(null));
      block.forEach((row, y) => row.forEach((p, x) => { raw[dy + y][dx + x] = p; }));
      const pixels = o.flags.has('outline') || o.values.outline ? applyOutline(raw, o.values.outline) : raw;
      addTile(name, toColors(pixels), start, {raw, outlineOption: o, template: o.flags.has('template')});
    } else if (directive === 'pips' || directive === 'cracks') {
      // @pips <prefix> count=N pip=WxH [gap=N] [x= y=] lit=<ch|#hex> empty=<ch|#hex> [outline]: <prefix>_0 .. <prefix>_N, n pips lit.
      // @cracks <prefix> stages=N [seed=N] dark=<ch|#hex> light=<ch|#hex>: cumulative damage overlays <prefix>_1 .. <prefix>_N.
      const [prefix, ...opts] = rest;
      if (!prefix) fail(`@${directive} needs a prefix.`, start);
      const o = options(opts), allowed = directive === 'pips' ? ['count', 'pip', 'gap', 'x', 'y', 'lit', 'empty', 'outline'] : ['stages', 'seed', 'dark', 'light'];
      for (const k of Object.keys(o.values)) if (!allowed.includes(k)) fail(`@${directive} ${prefix}: unknown option ${k}=.`, start);
      if (directive === 'cracks' && o.flags.size) fail(`@cracks ${prefix}: unknown option ${[...o.flags][0]}.`, start);
      if (directive === 'pips') for (const f of o.flags) if (f !== 'outline') fail(`@pips ${prefix}: unknown option ${f}.`, start);
      const color = (key) => {
        const spec = o.values[key];
        if (spec === undefined) fail(`@${directive} ${prefix}: ${key}= is required (a palette character or #rrggbb).`, start);
        if (HEX.test(spec)) return {color: spec.toLowerCase(), ch: spec};
        const entry = [...spec].length === 1 ? palette.get(spec) : null;
        if (!entry) fail(`@${directive} ${prefix}: ${key}= "${spec}" is neither a palette character nor #rrggbb.`, start);
        return {...entry, ch: spec};
      };
      const int = key => o.values[key] === undefined ? undefined : Number(o.values[key]);
      if (o.values.outline !== undefined && !HEX.test(o.values.outline)) fail('outline=#rrggbb needs a six digit colour.', start);
      let frames, names, tokens;
      try {
        if (directive === 'pips') {
          const size = /^(\d+)x(\d+)$/.exec(o.values.pip ?? '');
          if (!size) fail(`@pips ${prefix}: pip= is <w>x<h>, like pip=2x2.`, start);
          frames = pipFrames({cellW, cellH, count: int('count'), pipW: Number(size[1]), pipH: Number(size[2]), gap: int('gap'), x: int('x'), y: int('y')});
          names = frames.map((_, n) => `${prefix}_${n}`); tokens = {lit: color('lit'), empty: color('empty')};
        } else {
          frames = crackFrames({cellW, cellH, stages: int('stages'), seed: int('seed')});
          names = frames.map((_, n) => `${prefix}_${n + 1}`); tokens = {dark: color('dark'), light: color('light')};
        }
      } catch (error) { if (error.message.startsWith(`${file}:`)) throw error; fail(error.message, start); }
      const outlined = directive === 'pips' && (o.flags.has('outline') || o.values.outline);
      frames.forEach((g, n) => {
        const raw = g.map(row => row.map(t => (t ? {...tokens[t]} : null)));
        const px = outlined ? applyOutline(raw, o.values.outline) : raw;
        addTile(names[n], toColors(px), start, {raw, outlineOption: o, mark: directive});
      });
    } else fail(`Unknown directive @${directive}.`, start);
  }
}

export function generateTilesetRecipe(config, baseDir = process.cwd(), {check = false} = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw Error('Tileset recipe must be an object.');
  for (const k of Object.keys(config)) if (!FIELDS.includes(k)) throw Error(`Unknown tileset field: ${k}`);
  const {name = 'tileset', cell = 16, sources, palette: inlinePalette = {}} = config;
  if (config.kind !== undefined && config.kind !== 'tileset') throw Error('Tileset kind must be "tileset".');
  if (typeof name !== 'string' || !NAME.test(name)) throw Error('Invalid tileset name.');
  const [cellW, cellH] = Array.isArray(cell) ? cell : [cell, cell];
  if (![cellW, cellH].every(n => Number.isInteger(n) && n >= 1 && n <= MAX_CELL)) throw Error(`Tileset cell must be an integer from 1 to ${MAX_CELL}, or [width, height].`);
  if (!Array.isArray(sources) || !sources.length || sources.some(s => typeof s !== 'string' || !s)) throw Error('Tileset sources must be a nonempty array of .pxl file paths relative to the build config.');
  const palette = new Map();
  for (const [ch, value] of Object.entries(inlinePalette)) {
    const color = typeof value === 'string' ? value : value?.color, outline = typeof value === 'string' ? undefined : value?.outline;
    if ([...ch].length !== 1 || ch === '.' || ch === '@' || ch === '%' || /\s/.test(ch) || !HEX.test(color ?? '')) throw Error(`Invalid inline palette entry "${ch}".`);
    palette.set(ch, {color: color.toLowerCase(), ...(outline ? {outline: outline.toLowerCase()} : {})});
  }
  const state = {cellW, cellH, palette, tiles: [], names: new Set(), animations: [], autotiles: {}, imports: loadTilesetImports(config.imports, baseDir), diagnostics: check ? [] : undefined};
  // Sources may live outside the config directory (a palette shared by several sets); they are tracked as build inputs.
  const root = resolve(baseDir);
  sources.forEach((source, n) => {
    const full = resolve(root, source);
    if (!existsSync(full) || !statSync(full).isFile()) throw Error(`tileset.sources[${n}] "${source}" is not a file.`);
    parseTilesetSource(readFileSync(full, 'utf8'), source, state);
  });
  if (check && state.diagnostics.length) return {operations: [], report: null, diagnostics: state.diagnostics};
  // Template tiles exist only to be recoloured; they never reach the sheet.
  const tiles = state.tiles.filter(t => !t.template);
  for (const a of state.animations) if (a.frames.some(f => !tiles.find(t => t.name === f))) throw Error(`Animation ${a.name} uses a template tile.`);
  if (!tiles.length) throw Error('Tileset has no tiles.');
  const columns = config.columns ?? Math.min(16, tiles.length);
  if (!Number.isInteger(columns) || columns < 1) throw Error('Tileset columns must be a positive integer.');
  const rows = Math.ceil(tiles.length / columns);
  const operations = [{command: 'new', name, size: `${cellW}x${cellH}`, cols: columns, rows, palette: 'pico8'}];
  const index = {};
  tiles.forEach((tile, n) => {
    const ref = `${Math.floor(n / columns)},${n % columns}`;
    index[tile.name] = n;
    operations.push({command: 'name', cell: ref, as: tile.name});
    // Greedy rectangle cover: horizontal runs of one colour, extended downward while identical.
    const px = tile.pixels, done = px.map(row => row.map(() => false));
    let k = 0;
    for (let y = 0; y < cellH; y++) for (let x = 0; x < cellW; x++) {
      const c = px[y][x];
      if (!c || done[y][x]) continue;
      let w = 1; while (x + w < cellW && px[y][x + w] === c && !done[y][x + w]) w++;
      let h = 1;
      while (y + h < cellH && Array.from({length: w}, (_, d) => d).every(d => px[y + h][x + d] === c && !done[y + h][x + d])) h++;
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) done[yy][xx] = true;
      operations.push({command: 'draw', cell: ref, type: 'rect', name: `px_${k++}`, color: c, filled: true, x, y, w, h});
    }
  });
  for (const anim of state.animations) {
    operations.push({command: 'group', sub: 'create', name: anim.name, cells: anim.frames.map(f => `${Math.floor(index[f] / columns)},${index[f] % columns}`), fps: anim.fps});
  }
  const report = {
    version: 1, ok: true, kind: 'tileset', cellSize: {width: cellW, height: cellH}, columns, rows, count: tiles.length,
    // Frame index equals the row-major cell index; a game maps names to Phaser tileset indices with this table.
    index,
    animations: Object.fromEntries(state.animations.map(a => [a.name, {fps: a.fps, frames: a.frames.map(f => index[f])}])),
    autotiles: Object.fromEntries(Object.entries(state.autotiles).map(([prefix, a]) => [prefix, {kind: a.kind, material: a.material, ...(a.options ? {options: a.options} : {}), convention: a.convention ?? MASK_CONVENTION, masks: a.masks, frames: Object.fromEntries(a.frames.map(f => [f, index[f]]))}])),
    materials: Object.keys(MATERIALS),
  };
  report.paddingCells = columns * rows - tiles.length;
  return check ? {operations, report, diagnostics: []} : {operations, report};
}

/**
 * Parse-only check of a tileset recipe: reads every `.pxl` source, rasterises nothing and writes nothing.
 * Row-width and palette mistakes are all listed; any other error stops the parse at its file and line.
 */
export function checkTilesetRecipe(config, baseDir = process.cwd()) {
  let diagnostics, tiles = 0;
  try {
    const result = generateTilesetRecipe(config, baseDir, {check: true});
    diagnostics = result.diagnostics;
    tiles = result.report?.count ?? 0;
  } catch (error) {
    const m = /^(.+?):(\d+): ([\s\S]*)$/.exec(error.message);
    diagnostics = [m ? {code: 'parse', file: m[1], line: Number(m[2]), message: error.message} : {code: 'recipe', message: error.message}];
  }
  return {ok: diagnostics.length === 0, tiles, diagnostics};
}

export {BLOB_MASKS, FENCE_MASKS};
