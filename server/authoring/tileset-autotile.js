// Procedural auto-tile sets for the `tileset` recipe: 47-mask blob walls, floors and roofs plus
// 16-mask fences, door tiles and fence gates, all built from selectable materials.
//
// Neighbour bits are clockwise from north and match the terrain-transition convention:
// N=1 NE=2 E=4 SE=8 S=16 SW=32 W=64 NW=128. A diagonal only matters when both adjacent
// orthogonal neighbours are present, which leaves exactly 47 masks.
import {TRANSITION_BITS as BITS, TERRAIN_MASKS, normalizeTerrainMask} from './environment-transition.js';

export {TERRAIN_MASKS as BLOB_MASKS, normalizeTerrainMask as normalizeBlobMask};
export const FENCE_MASKS = [0, 1, 4, 5, 16, 17, 20, 21, 64, 65, 68, 69, 80, 81, 84, 85];
export const MASK_CONVENTION = 'clockwise from north: N=1 NE=2 E=4 SE=8 S=16 SW=32 W=64 NW=128; a diagonal bit is kept only when both adjacent orthogonal bits are set';

// Roles: a base, b light (top-left lit), c dark, d accent, s seam/mortar, o outline.
const hash = (x, y, k = 0) => { let h = Math.imul(x + 1, 0x45d9f3b) ^ Math.imul(y + 7, 0x119de1f3) ^ Math.imul(k + 3, 0x2c1b3c6d); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };

// Every pattern is periodic in 16 pixels so neighbouring tiles continue it exactly.
const PATTERNS = {
  // vertical corrugation with panel seams and rivets
  corrugated: (x, y) => { if (y % 8 === 7) return 's'; if (x % 16 === 1 && y % 8 === 1) return 'd'; return ['b', 'a', 'a', 'c'][x % 4]; },
  // horizontal corrugation (roof sheet)
  ridged: (x, y) => { if (x % 8 === 7 && y % 4 === 1) return 's'; return ['b', 'a', 'a', 'c'][y % 4]; },
  bricks: (x, y) => { const r = y % 8, row = (y >> 2) & 1, xx = (x + (row ? 4 : 0)) % 8; if (r % 4 === 3 || xx === 7) return 's'; if (r % 4 === 0 || xx === 0) return 'b'; return hash(x >> 1, y >> 2, 1) > .82 ? 'c' : 'a'; },
  slabs: (x, y) => { if (x % 8 === 7 || y % 8 === 7) return 's'; if (x % 8 === 0 || y % 8 === 0) return 'b'; const h = hash(x, y, 2); return h > .93 ? 'c' : h < .05 ? 'b' : 'a'; },
  planksV: (x, y) => { const px = x % 4; if (px === 3) return 's'; if (px === 0) return 'b'; const j = (x >> 2) * 5 % 16; if ((y + j) % 16 === 0) return 's'; return hash(x, y >> 1, 3) > .93 ? 'c' : 'a'; },
  planksH: (x, y) => { const py = y % 4; if (py === 3) return 's'; if (py === 0) return 'b'; const j = (y >> 2) * 6 % 16; if ((x + j) % 16 === 0) return 's'; return hash(x >> 1, y, 4) > .94 ? 'c' : 'a'; },
  tiles: (x, y) => { if (x % 8 === 7 || y % 8 === 7) return 's'; if (x % 8 === 0 && y % 8 === 0) return 'b'; return ((x >> 3) + (y >> 3)) & 1 ? 'c' : 'a'; },
  diamond: (x, y) => { if ((x === 0 || x === 15) && (y === 0 || y === 15)) return 'd'; const u = (x + y) % 8, v = (x - y + 16) % 8; if (u === 0 || v === 0) return 'b'; if (u === 4 && v === 4) return 'c'; return 'a'; },
  thatch: (x, y) => { const d = (x + y * 2) % 8; if (d === 0) return 'b'; if (d === 5) return 'c'; return hash(x, y, 5) > .9 ? 'd' : 'a'; },
  scales: (x, y) => { const row = (y >> 2) & 1, xx = (x + (row ? 4 : 0)) % 8, r = y % 4; if (r === 3) return 'c'; if (r === 0) return 'b'; if (xx === 0 || xx === 7) return 's'; return 'a'; },
  concrete: (x, y) => { if (y % 16 === 15) return 's'; if (x % 16 === 15) return 's'; const h = hash(x, y, 6); return h > .92 ? 'c' : h < .08 ? 'b' : (h > .55 && h < .6 ? 'd' : 'a'); },
  // 16x8 cinder blocks in running bond, with an occasional rust fleck of exposed rebar
  cinder: (x, y) => { const r = y % 8, course = (y >> 3) & 1, sx = x + (course ? 8 : 0), xx = sx % 16; if (r === 7 || xx === 15) return 's'; if (r === 0 || xx === 0) return 'b'; if (hash(sx >> 4, y >> 3, 9) > .62 && ((r === 3 && (xx === 9 || xx === 10)) || (r === 4 && xx === 10))) return 'd'; const h = hash(x, y, 10); return h > .9 ? 'c' : h < .05 ? 'b' : 'a'; },
  // smooth plate in 16x8 panels with corner rivets and a faint brushed grain
  plate: (x, y) => { const r = y % 8, xx = x % 16; if (r === 7 || xx === 15) return 's'; if (r === 0 || xx === 0) return 'b'; if ((xx === 2 || xx === 13) && (r === 2 || r === 5)) return 'd'; if ((xx === 3 || xx === 14) && (r === 3 || r === 6)) return 'c'; return hash(x >> 2, y, 11) > .93 ? 'c' : 'a'; },
  // flat sheets lapped in rows, offset joints and bolts (a steel roof)
  lapped: (x, y) => { const r = y % 8, course = (y >> 3) & 1, xx = (x + (course ? 8 : 0)) % 16; if (r === 7) return 's'; if (r === 0) return 'b'; if (xx === 15) return 'c'; if ((xx === 4 || xx === 12) && r === 3) return 'd'; return r === 6 ? 'c' : 'a'; },
  // irregular flagstones, one mortar line, three courses of different heights
  flags: (x, y) => { const rows = [[0, 4, [-1, 5, 10, 15]], [5, 10, [-1, 3, 9, 15]], [11, 15, [-1, 4, 10, 15]]]; const [y0, y1, cuts] = rows.find(r => y >= r[0] && y <= r[1]); let i = 0; while (x > cuts[i + 1]) i++; const x0 = cuts[i] + 1, x1 = cuts[i + 1]; if (y === y1 || x === x1) return 's'; if (y === y0 || x === x0) return 'b'; const h = hash(x, y, 12 + i); return h > .9 || (h > .62 && i === 1) ? 'c' : h < .04 ? 'b' : 'a'; },
  // raised tread bars (diamond plate): short diagonals alternating direction in 4x4 cells
  tread: (x, y) => { const lx = x % 4, ly = y % 4, up = ((x >> 2) + (y >> 2)) & 1; if ((x === 0 || x === 15) && (y === 0 || y === 15)) return 'd'; if (up ? lx + ly === 3 : lx === ly) return 'b'; if (up ? lx + ly === 4 : lx === ly + 1) return 'c'; return 'a'; },
  // rammed earth: compacted layers and a few pale grains
  rammed: (x, y) => { const h = hash(x >> 1, y, 7); if (y % 8 === 3 && h > .5) return 'c'; if (y % 8 === 4 && hash(x >> 1, y, 8) > .72) return 'b'; return h > .94 ? 'c' : h < .06 ? 'b' : 'a'; },
  // seamless ceramic: a smooth glaze with pale flecks and one small inlay per tile
  ceramic: (x, y) => { if ((x === 7 || x === 8) && (y === 7 || y === 8)) return (x + y) % 2 ? 'd' : 'b'; const h = hash(x, y, 13); return h > .975 ? 'c' : h < .035 ? 'b' : 'a'; },
  // tall panels 8 px wide, each with a small accent light under its lit top edge
  panel: (x, y) => { const xx = x % 8, yy = y % 16; if (xx === 7 || yy === 15) return 's'; if (yy === 0 || xx === 0) return 'b'; if (yy === 5 && xx >= 2 && xx <= 5) return 'd'; if (yy === 6 && xx >= 2 && xx <= 5) return 'c'; return 'a'; },
  // glasshouse: long 8x16 panes between dark bars, each with diagonal glint streaks (offset on alternate panes)
  glasshouse: (x, y) => { const xx = x % 8, yy = y % 16, k = (xx + yy + (((x >> 3) & 1) ? 5 : 0)) % 16; if (xx === 7 || yy === 15) return 's'; if (xx === 0) return 'c'; if (xx >= 2 && xx <= 5 && (k === 9 || k === 10)) return 'b'; if (xx >= 3 && xx <= 5 && k === 13) return 'b'; return yy >= 13 ? 'c' : 'a'; },
  glass: (x, y) => { if (x % 8 === 7 || y % 8 === 7) return 's'; if (x % 8 === 0 || y % 8 === 0) return 'b'; if ((x % 8 + y % 8 === 3) || (x % 8 + y % 8 === 5 && x % 8 > 0 && y % 8 > 0 && x % 8 < 4)) return 'b'; return 'a'; },
};

// Defaults follow the Fallow Valley ramps (docs/ART-DIRECTION.md) but every role is overridable per set.
export const MATERIALS = {
  scrap:         {pattern: 'corrugated', a: '#85847c', b: '#a8a79e', c: '#5f5f5a', d: '#b5532f', s: '#3c3c3a', o: '#26262a'},
  wood:          {pattern: 'planksV',    a: '#b08d57', b: '#c9a869', c: '#8f6f45', d: '#6b5033', s: '#6b5033', o: '#4a3624'},
  brick:         {pattern: 'bricks',     a: '#b5532f', b: '#d98b4a', c: '#8c3b25', d: '#5e2a1f', s: '#a8a79e', o: '#5e2a1f'},
  concrete:      {pattern: 'concrete',   a: '#a8a79e', b: '#c4c3ba', c: '#85847c', d: '#5f5f5a', s: '#85847c', o: '#3c3c3a'},
  glass:         {pattern: 'glass',      a: '#5f9a8d', b: '#8fc4b4', c: '#3f6f68', d: '#d6ff9a', s: '#2a4a4a', o: '#12201f'},
  planks:        {pattern: 'planksH',    a: '#b08d57', b: '#c9a869', c: '#8f6f45', d: '#6b5033', s: '#6b5033', o: '#4a3624'},
  slab:          {pattern: 'slabs',      a: '#a8a79e', b: '#c4c3ba', c: '#85847c', d: '#5f5f5a', s: '#85847c', o: '#5f5f5a'},
  tile:          {pattern: 'tiles',      a: '#8fc4b4', b: '#c4c3ba', c: '#5f9a8d', d: '#3f6f68', s: '#85847c', o: '#3f6f68'},
  'scrap-plate': {pattern: 'diamond',    a: '#85847c', b: '#a8a79e', c: '#5f5f5a', d: '#3c3c3a', s: '#3c3c3a', o: '#26262a'},
  thatch:        {pattern: 'thatch',     a: '#c9a869', b: '#e3cf93', c: '#8f6f45', d: '#b08d57', s: '#6b5033', o: '#4a3624'},
  sheet:         {pattern: 'ridged',     a: '#85847c', b: '#a8a79e', c: '#5f5f5a', d: '#b5532f', s: '#3c3c3a', o: '#26262a'},
  'roof-tile':   {pattern: 'scales',     a: '#b5532f', b: '#d98b4a', c: '#8c3b25', d: '#5e2a1f', s: '#8c3b25', o: '#5e2a1f'},
  // Fallow Valley building tiers (adobe, timber, masonry, steel, alloy). Wall, floor and roof presets share a tier's ramp steps.
  adobe:         {pattern: 'bricks',     a: '#c9a869', b: '#e3cf93', c: '#b08d57', d: '#b08d57', s: '#b08d57', o: '#6b5033'},
  rammed:        {pattern: 'rammed',     a: '#b08d57', b: '#c9a869', c: '#8f6f45', d: '#c9a869', s: '#b08d57', o: '#6b5033'},
  timber:        {pattern: 'planksV',    a: '#b08d57', b: '#c9a869', c: '#6b5033', d: '#6b5033', s: '#6b5033', o: '#4a3624'},
  shingle:       {pattern: 'scales',     a: '#8f6f45', b: '#b08d57', c: '#6b5033', d: '#4a3624', s: '#6b5033', o: '#4a3624'},
  cinder:        {pattern: 'cinder',     a: '#a8a79e', b: '#c4c3ba', c: '#5f5f5a', d: '#b5532f', s: '#5f5f5a', o: '#3c3c3a'},
  flags:         {pattern: 'flags',      a: '#a8a79e', b: '#c4c3ba', c: '#85847c', d: '#85847c', s: '#5f5f5a', o: '#5f5f5a'},
  plate:         {pattern: 'plate',      a: '#5f5f5a', b: '#a8a79e', c: '#2a4a4a', d: '#c4c3ba', s: '#26262a', o: '#12201f'},
  tread:         {pattern: 'tread',      a: '#5f5f5a', b: '#a8a79e', c: '#2a4a4a', d: '#c4c3ba', s: '#26262a', o: '#12201f'},
  lapped:        {pattern: 'lapped',     a: '#3c3c3a', b: '#85847c', c: '#2a4a4a', d: '#a8a79e', s: '#26262a', o: '#12201f'},
  ceramic:       {pattern: 'ceramic',    a: '#8fc4b4', b: '#c4c3ba', c: '#5f9a8d', d: '#5f9a8d', s: '#5f9a8d', o: '#3f6f68'},
  panel:         {pattern: 'panel',      a: '#3f6f68', b: '#5f9a8d', c: '#2a4a4a', d: '#8fc4b4', s: '#2a4a4a', o: '#12201f'},
  glasshouse:    {pattern: 'glasshouse', a: '#5f9a8d', b: '#8fc4b4', c: '#3f6f68', d: '#8fc4b4', s: '#2a4a4a', o: '#12201f'},
  // Fence styles: `fence` picks the drawing, the colours are the roles a (face) b (lit) c (shade) o (outline).
  wattle:        {pattern: 'planksV',    fence: 'wattle',   a: '#c9a869', b: '#e3cf93', c: '#8f6f45', d: '#b08d57', s: '#8f6f45', o: '#6b5033'},
  paling:        {pattern: 'planksV',    fence: 'paling',   a: '#b08d57', b: '#c9a869', c: '#6b5033', d: '#6b5033', s: '#6b5033', o: '#4a3624'},
  lowblock:      {pattern: 'cinder',     fence: 'lowblock', a: '#a8a79e', b: '#c4c3ba', c: '#5f5f5a', d: '#b5532f', s: '#5f5f5a', o: '#3c3c3a'},
  mesh:          {pattern: 'plate',      fence: 'mesh',     a: '#5f5f5a', b: '#a8a79e', c: '#2a4a4a', d: '#c4c3ba', s: '#26262a', o: '#12201f'},
  slimrail:      {pattern: 'panel',      fence: 'slimrail', a: '#3f6f68', b: '#8fc4b4', c: '#2a4a4a', d: '#8fc4b4', s: '#2a4a4a', o: '#12201f'},
  // Door leaves: only the colours matter (leaf=<name>); la base, lb lit edge, lc shade, ls plank line, ld latch.
  'leaf-adobe':  {pattern: 'planksV',    a: '#8f6f45', b: '#c9a869', c: '#6b5033', d: '#c9a869', s: '#4a3624', o: '#4a3624'},
  'leaf-timber': {pattern: 'planksV',    a: '#b08d57', b: '#c9a869', c: '#8f6f45', d: '#b5532f', s: '#6b5033', o: '#4a3624'},
  'leaf-masonry': {pattern: 'planksV',   a: '#6b5033', b: '#8f6f45', c: '#4a3624', d: '#b5532f', s: '#4a3624', o: '#2a1e14'},
  'leaf-steel':  {pattern: 'plate',      a: '#85847c', b: '#c4c3ba', c: '#5f5f5a', d: '#c4c3ba', s: '#2a4a4a', o: '#12201f'},
  'leaf-alloy':  {pattern: 'panel',      a: '#5f9a8d', b: '#8fc4b4', c: '#3f6f68', d: '#f0d466', s: '#2a4a4a', o: '#12201f'},
};
export const AUTOTILE_KINDS = ['wall', 'floor', 'roof', 'fence', 'door', 'gate'];
export const AUTOTILE_ROLES = ['a', 'b', 'c', 'd', 's', 'o'];

const darker = {a: 'c', b: 'a', c: 'o', d: 'c', s: 'o', o: 'o'};

function material(name, overrides) {
  const base = MATERIALS[name];
  if (!base) throw Error(`Unknown auto-tile material "${name}". Choose one of: ${Object.keys(MATERIALS).join(', ')}.`);
  const m = {...base};
  for (const [k, v] of Object.entries(overrides ?? {})) {
    if (!AUTOTILE_ROLES.includes(k)) throw Error(`Unknown material role "${k}". Roles: ${AUTOTILE_ROLES.join(' ')}.`);
    if (!/^#[0-9a-f]{6}$/i.test(v)) throw Error(`Material role ${k} needs a #rrggbb colour.`);
    m[k] = v.toLowerCase();
  }
  return m;
}

const roleGrid = (S, pattern) => Array.from({length: S}, (_, y) => Array.from({length: S}, (_, x) => pattern(x, y)));

/** Blob-edged block: walls and roofs (outlined, with a front face) and floors (soft edge only). */
function blockRoles(S, pattern, kind, mask, face) {
  const has = bit => (mask & bit) !== 0, last = S - 1;
  const g = roleGrid(S, pattern);
  const open = {n: !has(BITS.n), e: !has(BITS.e), s: !has(BITS.s), w: !has(BITS.w)};
  const concave = {ne: has(BITS.n) && has(BITS.e) && !has(BITS.ne), se: has(BITS.s) && has(BITS.e) && !has(BITS.se), sw: has(BITS.s) && has(BITS.w) && !has(BITS.sw), nw: has(BITS.n) && has(BITS.w) && !has(BITS.nw)};
  const set = (x, y, role) => { if (x >= 0 && y >= 0 && x < S && y < S) g[y][x] = role; };
  if (kind === 'floor') {
    if (open.n) for (let x = 0; x < S; x++) set(x, 0, 'c');
    if (open.w) for (let y = 0; y < S; y++) set(0, y, 'c');
    if (open.s) for (let x = 0; x < S; x++) set(x, last, 'o');
    if (open.e) for (let y = 0; y < S; y++) set(last, y, 'o');
    if (concave.ne) set(last, 0, 'o'); if (concave.se) set(last, last, 'o'); if (concave.sw) set(0, last, 'o'); if (concave.nw) set(0, 0, 'c');
    return g;
  }
  const top = open.s ? last - face : last; // last row of the lit top surface
  if (open.s) {
    for (let y = top + 1; y <= last; y++) for (let x = 0; x < S; x++) g[y][x] = y === top + 1 ? 'c' : darker[pattern(x, y)];
    for (let x = 0; x < S; x++) g[last][x] = 'o';
  }
  if (open.n) { for (let x = 0; x < S; x++) { g[0][x] = 'o'; if (top >= 1) g[1][x] = 'b'; } }
  if (open.w) { for (let y = 0; y <= (open.s ? last : top); y++) { g[y][0] = 'o'; if (y >= 1 && y <= top && !(open.n && y === 0)) g[y][1] = 'b'; } }
  if (open.e) { for (let y = 0; y <= (open.s ? last : top); y++) { g[y][last] = 'o'; if (y >= 1 && y <= top) g[y][last - 1] = 'c'; } }
  if (concave.ne) { set(last, 0, 'o'); set(last - 1, 1, 'c'); }
  if (concave.nw) { set(0, 0, 'o'); set(1, 1, 'b'); }
  if (concave.se) { set(last, last, 'o'); }
  if (concave.sw) { set(0, last, 'o'); }
  if (open.s && open.n) { /* corners already covered by outline rows */ }
  return g;
}

function fenceRoles(S, mask) {
  const has = bit => (mask & bit) !== 0, g = Array.from({length: S}, () => Array(S).fill(null));
  const put = (x, y, r) => { if (x >= 0 && y >= 0 && x < S && y < S) g[y][x] = r; };
  const rect = (x0, y0, x1, y1, r) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, r); };
  // rails first so the post draws over them
  const rail = (x0, x1) => { for (const ry of [5, 9]) { rect(x0, ry, x1, ry, 'o'); rect(x0, ry + 1, x1, ry + 1, 'b'); rect(x0, ry + 2, x1, ry + 2, 'a'); rect(x0, ry + 3, x1, ry + 3, 'o'); } };
  if (has(BITS.e)) rail(10, S - 1);
  if (has(BITS.w)) rail(0, 5);
  const vert = (y0, y1) => { rect(6, y0, 6, y1, 'o'); rect(7, y0, 7, y1, 'b'); rect(8, y0, 8, y1, 'a'); rect(9, y0, 9, y1, 'o'); };
  if (has(BITS.n)) vert(0, 4);
  if (has(BITS.s)) vert(12, S - 1);
  // post
  rect(5, 3, 10, 13, 'o'); rect(6, 4, 9, 12, 'a'); rect(6, 4, 9, 4, 'b'); rect(6, 5, 6, 12, 'b'); rect(9, 5, 9, 12, 'c'); rect(7, 12, 9, 12, 'c');
  return g;
}

/** Fence styles beyond the default post-and-rails: `wattle` woven stakes, `paling` pickets, `lowblock` a low masonry course,
 *  `mesh` wire between rails, `slimrail` thin bright rails on slender posts. Same footprint, same 16 edge masks. */
function styledFenceRoles(S, mask, style) {
  const has = bit => (mask & bit) !== 0, g = Array.from({length: S}, () => Array(S).fill(null));
  const put = (x, y, r) => { if (x >= 0 && y >= 0 && x < S && y < S) g[y][x] = r; };
  const rect = (x0, y0, x1, y1, r) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, r); };
  const hRun = (x0, x1, fn) => { for (let x = x0; x <= x1; x++) fn(x); };
  const vRun = (y0, y1, fn) => { for (let y = y0; y <= y1; y++) fn(y); };
  // the outline goes round everything drawn so far (4-neighbourhood, inside the tile only)
  const outline = () => { const add = []; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!g[y][x] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx] && g[y + dy][x + dx] !== 'o')) add.push([x, y]); for (const [x, y] of add) g[y][x] = 'o'; };
  const runs = (hx, vy) => { if (has(BITS.e)) hRun(10, S - 1, x => hx(x)); if (has(BITS.w)) hRun(0, 5, x => hx(x)); if (has(BITS.n)) vRun(0, 4, y => vy(y)); if (has(BITS.s)) vRun(12, S - 1, y => vy(y)); };
  const post = (x0, y0, x1, y1, cap) => { rect(x0, y0, x1, y1, 'a'); rect(x0, y0, x1, y0, cap ?? 'b'); rect(x0, y0 + 1, x0, y1, 'b'); rect(x1, y0 + 1, x1, y1, 'c'); rect(x0 + 1, y1, x1, y1, 'c'); };
  if (style === 'wattle') {
    // stakes 2 px wide every 4 px, a weave band that passes over and under alternate stakes; thick stake-bundle post
    runs(x => { const stake = x % 4 === 1 || x % 4 === 2; if (stake) { rect(x, 5, x, 12, x % 4 === 1 ? 'a' : 'c'); put(x, 4, 'b'); }
      for (const [y0, k] of [[6, 0], [10, 1]]) { const over = (((x >> 2) + k) & 1) === 0; if (over || !stake) { put(x, y0, 'b'); put(x, y0 + 1, 'a'); } else { put(x, y0, x % 4 === 1 ? 'a' : 'c'); put(x, y0 + 1, x % 4 === 1 ? 'a' : 'c'); } } },
      y => { rect(6, y, 9, y, y % 4 === 0 ? 'b' : y % 4 === 2 ? 'c' : 'a'); });
    post(5, 3, 10, 13, 'b'); rect(6, 7, 9, 7, 'c'); rect(6, 10, 9, 10, 'c'); outline();
  } else if (style === 'paling') {
    // pickets three wide with a pointed top; a one-pixel gap shows as the outline between boards
    runs(x => { const k = x % 4; if (k === 3) return; rect(x, 4, x, 13, k === 0 ? 'b' : k === 1 ? 'a' : 'c'); if (k === 1) put(x, 3, 'b'); put(x, 8, k === 1 ? 'c' : g[8][x]); put(x, 9, k === 0 ? 'b' : g[9][x]); },
      y => { rect(6, y, 9, y, y % 4 === 3 ? 'c' : 'a'); rect(6, y, 6, y, y % 4 === 3 ? 'c' : 'b'); });
    post(5, 3, 10, 13, 'b'); outline();
  } else if (style === 'lowblock') {
    // a low masonry course: cap, two block rows with a running-bond joint, a pier at the post
    runs(x => { rect(x, 7, x, 7, 'b'); rect(x, 8, x, 12, 'a'); put(x, 10, 'c'); if (x % 8 === 7) rect(x, 8, x, 9, 'c'); if (x % 8 === 3) rect(x, 11, x, 12, 'c'); put(x, 13, 'c'); },
      y => { rect(6, y, 9, y, 'a'); put(6, y, 'b'); put(9, y, 'c'); if (y % 4 === 3) rect(6, y, 9, y, 'c'); });
    post(4, 4, 11, 13, 'b'); rect(5, 8, 10, 8, 'c'); rect(5, 11, 10, 11, 'c'); outline();
  } else if (style === 'mesh') {
    // two rails and a diagonal wire lattice between them (the holes show the ground); slim posts
    const frame = () => { runs(x => { rect(x, 4, x, 4, 'b'); rect(x, 5, x, 5, 'a'); rect(x, 12, x, 12, 'a'); rect(x, 13, x, 13, 'c'); },
      y => { rect(6, y, 6, y, 'b'); rect(7, y, 8, y, 'a'); rect(9, y, 9, y, 'c'); }); rect(7, 2, 8, 14, 'a'); rect(7, 2, 7, 14, 'b'); rect(8, 3, 8, 14, 'c'); rect(7, 2, 8, 2, 'b'); };
    frame(); outline();
    const wire = (x, y) => { if (g[y][x] !== null) return; if ((x + y) % 4 === 0) g[y][x] = 'b'; else if ((x - y + 16) % 4 === 0) g[y][x] = 'a'; };
    if (has(BITS.e)) for (let y = 6; y <= 11; y++) for (let x = 9; x < S; x++) wire(x, y);
    if (has(BITS.w)) for (let y = 6; y <= 11; y++) for (let x = 0; x <= 6; x++) wire(x, y);
    if (has(BITS.n)) for (let y = 0; y <= 4; y++) for (let x = 7; x <= 8; x++) if (!g[y][x]) g[y][x] = (x + y) % 2 ? 'b' : 'a';
    if (has(BITS.s)) for (let y = 14; y < S; y++) for (let x = 7; x <= 8; x++) if (!g[y][x]) g[y][x] = (x + y) % 2 ? 'b' : 'a';
  } else if (style === 'slimrail') {
    // two thin bright rails (lit over shade) and slender posts with a light on top
    runs(x => { rect(x, 5, x, 5, 'b'); rect(x, 6, x, 6, 'c'); rect(x, 10, x, 10, 'b'); rect(x, 11, x, 11, 'c'); },
      y => { rect(7, y, 7, y, 'b'); rect(8, y, 8, y, 'c'); });
    rect(6, 3, 9, 13, 'a'); rect(6, 3, 6, 13, 'b'); rect(9, 4, 9, 13, 'c'); rect(7, 3, 8, 3, 'b'); rect(7, 4, 8, 4, 'd'); rect(6, 13, 9, 13, 'c'); outline();
  } else throw Error(`Unknown fence style "${style}".`);
  return g;
}

/**
 * Fence gates: one tile that stands in a fence line, shut (`<prefix>`) and open (`<prefix>_open`), drawn in the material's fence style
 * (the same `fence=` presets as fences: wattle, paling, lowblock, mesh, slimrail, or the default post and rails). Two posts at the tile's
 * east and west edges so it joins a fence run on both sides; shut, the leaf spans between them; open, the leaf stands swung against the
 * hinge (west) post, edge-on, and the opening between the posts is clear.
 */
function gateRoles(S, style, open) {
  const g = Array.from({length: S}, () => Array(S).fill(null));
  const put = (x, y, r) => { if (x >= 0 && y >= 0 && x < S && y < S) g[y][x] = r; };
  const rect = (x0, y0, x1, y1, r) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, r); };
  const outline = () => { const add = []; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!g[y][x] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx] && g[y + dy][x + dx] !== 'o')) add.push([x, y]); for (const [x, y] of add) g[y][x] = 'o'; };
  // posts: a hinge post on the west edge and a latch post on the east, each 3 px wide, standing a little above the leaf
  const post = (x0, cap) => { rect(x0, 3, x0 + 2, 13, 'a'); rect(x0, 3, x0 + 2, 3, cap); rect(x0, 4, x0, 13, 'b'); rect(x0 + 2, 4, x0 + 2, 13, 'c'); rect(x0, 13, x0 + 2, 13, 'c'); };
  const cap = style === 'slimrail' ? 'd' : 'b';
  post(0, cap); post(S - 3, cap);
  if (!open) {
    const x0 = 3, x1 = S - 4; // the leaf between the posts
    const h = (y, r) => rect(x0, y, x1, y, r);
    if (style === 'wattle') {
      for (let x = x0; x <= x1; x++) { const stake = x % 4 === 1 || x % 4 === 2; if (stake) { rect(x, 5, x, 12, x % 4 === 1 ? 'a' : 'c'); put(x, 4, 'b'); }
        for (const [y0, k] of [[6, 0], [10, 1]]) { const over = (((x >> 2) + k) & 1) === 0; if (over || !stake) { put(x, y0, 'b'); put(x, y0 + 1, 'a'); } else { put(x, y0, x % 4 === 1 ? 'a' : 'c'); put(x, y0 + 1, x % 4 === 1 ? 'a' : 'c'); } } }
    } else if (style === 'paling') {
      for (let x = x0; x <= x1; x++) { const k = x % 4; if (k === 3) continue; rect(x, 4, x, 12, k === 0 ? 'b' : k === 1 ? 'a' : 'c'); if (k === 1) put(x, 3, 'b'); put(x, 7, 'c'); put(x, 10, 'c'); }
    } else if (style === 'lowblock') {
      h(7, 'b'); rect(x0, 8, x1, 12, 'a'); h(10, 'c'); for (const x of [x0 + 3, x0 + 8]) rect(x, 8, x, 9, 'c'); for (const x of [x0 + 1, x0 + 6]) rect(x, 11, x, 12, 'c'); h(13, 'c');
    } else if (style === 'mesh') {
      h(4, 'b'); h(5, 'a'); h(12, 'a'); h(13, 'c');
      for (let y = 6; y <= 11; y++) for (let x = x0; x <= x1; x++) { if ((x + y) % 4 === 0) put(x, y, 'b'); else if ((x - y + 16) % 4 === 0) put(x, y, 'a'); }
    } else if (style === 'slimrail') {
      h(5, 'b'); h(6, 'c'); h(10, 'b'); h(11, 'c'); rect(7, 6, 8, 10, 'a'); rect(7, 6, 7, 10, 'b');
    } else {
      // post-and-rail: two rails and a diagonal brace
      for (const y of [5, 10]) { h(y, 'b'); h(y + 1, 'a'); }
      for (let k = 0; k <= x1 - x0; k++) put(x0 + k, 10 - Math.round(k * 4 / (x1 - x0)), 'c');
    }
    put(x1, 8, 'd'); put(x1, 9, 'd'); // the latch
  } else {
    // swung open against the hinge post: a thin leaf standing edge-on, its rails showing as ticks
    rect(3, 4, 4, 12, 'a'); rect(3, 4, 3, 12, 'b'); rect(4, 5, 4, 12, 'c'); rect(3, 4, 4, 4, 'b');
    for (const y of [6, 10]) { put(5, y, 'b'); put(5, y + 1, 'a'); }
    put(4, 8, 'd');
  }
  outline();
  return g;
}

function doorRoles(S, pattern, open, face) {
  const g = blockRoles(S, pattern, 'wall', BITS.e | BITS.w, face), set = (x, y, r) => { g[y][x] = r; };
  for (let y = 2; y <= S - 2; y++) for (let x = 3; x <= S - 4; x++) set(x, y, 'o');
  if (!open) {
    for (let y = 3; y <= S - 3; y++) for (let x = 4; x <= S - 5; x++) set(x, y, y % 4 === 2 ? 'ls' : (x === 4 ? 'lb' : x === S - 5 ? 'lc' : 'la'));
    set(S - 7, 8, 'ld'); set(S - 7, 9, 'ld');
  } else {
    for (let y = 3; y <= S - 3; y++) for (let x = 4; x <= S - 5; x++) set(x, y, 'k');
    for (let y = 3; y <= S - 3; y++) { set(4, y, 'la'); set(5, y, 'lc'); }
    for (let x = 6; x <= S - 5; x++) set(x, S - 3, 'f');
  }
  return g;
}

const DOOR_EXTRA = {k: '#1b2040', f: '#6b5033'};

/** Returns [{name, pixels}] with pixels[y][x] a #rrggbb string or null. */
export function autotileTiles({kind, material: materialName, prefix, size = 16, overrides, face, leaf}) {
  if (!AUTOTILE_KINDS.includes(kind)) throw Error(`Unknown auto-tile kind "${kind}". Choose one of: ${AUTOTILE_KINDS.join(', ')}.`);
  const m = material(materialName, overrides), pattern = PATTERNS[m.pattern], S = size;
  if (S !== 16) throw Error('Auto-tiles are authored for 16x16 cells.');
  const leafMaterial = kind === 'door' ? material(leaf ?? materialName, undefined) : null;
  const color = role => role === null ? null : role.length === 2 && role[0] === 'l' ? leafMaterial[role[1]] : (m[role] ?? DOOR_EXTRA[role]);
  const paint = roles => roles.map(row => row.map(color));
  const f = face ?? (kind === 'roof' ? 3 : 4);
  if (kind === 'fence') return FENCE_MASKS.map(mask => ({name: `${prefix}_${mask}`, mask, pixels: paint(m.fence ? styledFenceRoles(S, mask, m.fence) : fenceRoles(S, mask))}));
  if (kind === 'gate') return [{name: prefix, pixels: paint(gateRoles(S, m.fence, false))}, {name: `${prefix}_open`, pixels: paint(gateRoles(S, m.fence, true))}];
  if (kind === 'door') return [{name: prefix, pixels: paint(doorRoles(S, pattern, false, f))}, {name: `${prefix}_open`, pixels: paint(doorRoles(S, pattern, true, f))}];
  return TERRAIN_MASKS.map(mask => ({name: `${prefix}_${mask}`, mask, pixels: paint(blockRoles(S, pattern, kind, mask, f))}));
}
