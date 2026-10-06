import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {autotileTiles, AUTOTILE_KINDS, AUTOTILE_ROLES, MATERIALS, BLOB_MASKS, FENCE_MASKS, MASK_CONVENTION} from './tileset-autotile.js';

// Tileset recipe: a regular grid of equal cells (frame index = row-major cell index) described in
// plain-text `.pxl` sources. See examples/tileset/README.md for the grammar.
const HEX = /^#[0-9a-fA-F]{6}$/;
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const FIELDS = ['name', 'kind', 'cell', 'columns', 'sources', 'palette'];

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

/** Parse source text into tile definitions, resolving palette characters as it goes. */
export function parseTilesetSource(text, file, state) {
  const {cellW, cellH, palette, tiles} = state;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  const fail = (msg, line = i) => { throw Error(`${file}:${line + 1}: ${msg}`); };
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
      if (line === null || isDirective(line)) fail(`${what} needs ${count} rows, found ${rows.length}.`, Math.min(i, lines.length - 1));
      if ([...line].length !== width) fail(`${what} row ${rows.length + 1} is ${[...line].length} wide; expected ${width}.`);
      rows.push([...line].map(ch => {
        if (ch === '.') return null;
        const entry = palette.get(ch);
        if (!entry) fail(`${what}: palette has no entry for "${ch}".`);
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
    if (!isDirective(line)) fail(`Expected a directive (@palette, @tile, @anim, @copy, @autotile); found "${line.slice(0, 20)}".`);
    const start = i, words = line.slice(1).trim().split(/\s+/), directive = words[0], rest = words.slice(1);
    i++;
    if (directive === 'palette') {
      while (i < lines.length) {
        const entry = next();
        if (entry === null || isDirective(entry)) break;
        const parts = entry.trim().split(/\s+/);
        const [ch, color, outline] = parts;
        if ([...ch].length !== 1 || ch === '.' || ch === '@' || ch === '%') fail(`Palette character "${ch}" is reserved or not a single character.`);
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
      if (!kind || !materialName || as !== 'as' || !prefix) fail('@autotile is: @autotile <kind> <material> as <prefix> [role=#hex ...] [face=N].', start);
      if (!AUTOTILE_KINDS.includes(kind)) fail(`Unknown auto-tile kind "${kind}" (${AUTOTILE_KINDS.join(', ')}).`, start);
      const o = options(opts), overrides = {};
      for (const [k, v] of Object.entries(o.values)) if (AUTOTILE_ROLES.includes(k)) overrides[k] = v; else if (k !== 'face' && k !== 'leaf') fail(`Unknown auto-tile option "${k}".`, start);
      let set;
      try { set = autotileTiles({kind, material: materialName, prefix, size: cellW, overrides, face: o.values.face === undefined ? undefined : Number(o.values.face), leaf: o.values.leaf}); }
      catch (error) { fail(error.message, start); }
      if (cellW !== cellH) fail('Auto-tiles need square cells.', start);
      for (const t of set) addTile(t.name, t.pixels, start, {autotile: prefix, mask: t.mask});
      state.autotiles[prefix] = {kind, material: materialName, masks: set.filter(t => t.mask !== undefined).map(t => t.mask), frames: set.map(t => t.name)};
    } else fail(`Unknown directive @${directive}.`, start);
  }
}

export function generateTilesetRecipe(config, baseDir = process.cwd()) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw Error('Tileset recipe must be an object.');
  for (const k of Object.keys(config)) if (!FIELDS.includes(k)) throw Error(`Unknown tileset field: ${k}`);
  const {name = 'tileset', cell = 16, sources, palette: inlinePalette = {}} = config;
  if (config.kind !== undefined && config.kind !== 'tileset') throw Error('Tileset kind must be "tileset".');
  if (typeof name !== 'string' || !NAME.test(name)) throw Error('Invalid tileset name.');
  const [cellW, cellH] = Array.isArray(cell) ? cell : [cell, cell];
  if (![cellW, cellH].every(n => Number.isInteger(n) && n >= 1)) throw Error('Tileset cell must be a positive integer or [width, height].');
  if (!Array.isArray(sources) || !sources.length || sources.some(s => typeof s !== 'string' || !s)) throw Error('Tileset sources must be a nonempty array of .pxl file paths relative to the build config.');
  const palette = new Map();
  for (const [ch, value] of Object.entries(inlinePalette)) {
    const color = typeof value === 'string' ? value : value?.color, outline = typeof value === 'string' ? undefined : value?.outline;
    if ([...ch].length !== 1 || ch === '.' || !HEX.test(color ?? '')) throw Error(`Invalid inline palette entry "${ch}".`);
    palette.set(ch, {color: color.toLowerCase(), ...(outline ? {outline: outline.toLowerCase()} : {})});
  }
  const state = {cellW, cellH, palette, tiles: [], names: new Set(), animations: [], autotiles: {}};
  for (const source of sources) parseTilesetSource(readFileSync(resolve(baseDir, source), 'utf8'), source, state);
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
    autotiles: Object.fromEntries(Object.entries(state.autotiles).map(([prefix, a]) => [prefix, {kind: a.kind, material: a.material, convention: MASK_CONVENTION, masks: a.masks, frames: Object.fromEntries(a.frames.map(f => [f, index[f]]))}])),
    materials: Object.keys(MATERIALS),
  };
  report.paddingCells = columns * rows - tiles.length;
  return {operations, report};
}

export {BLOB_MASKS, FENCE_MASKS};
