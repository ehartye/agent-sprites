// Colour symbol icons for the `wasteland` UI theme: 12x12 pixel art centred in the 24x24 skin cell, named `sym_<name>`.
// Each is a body mask that gets an automatic outline and bevel (highlight where light reaches an edge from the top left,
// shade on the far edges), so every icon shares one light direction. `*` marks detail, `+` a glint.
// The heart and the drop are the HUD icons `hud_health` and `hud_thirst`; the font draws them inline as glyphs too.
const OUT = '#26262a';
const P = (h, g, s, d, w = '#ffffff') => ({o: OUT, h, g, s, d, w});

function disc(r, cx = 5.5, cy = 5.5) { return (x, y) => Math.hypot(x - cx, y - cy) <= r; }
function near(a, b, thick) {
  const [ax, ay] = a, [bx, by] = b, dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  return (x, y) => { const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)); return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= thick; };
}
function inPolygon(points) {
  return (x, y) => { let inside = false; for (let i = 0, j = points.length - 1; i < points.length; j = i++) { const [xi, yi] = points[i], [xj, yj] = points[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; } return inside; };
}
function fromFn(fn) {
  return Array.from({length: 12}, (_, y) => Array.from({length: 12}, (_, x) => fn(x, y) ? '#' : '.').join(''));
}
function star() {
  const pts = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 2.6 : 5.6, a = -Math.PI / 2 + i * Math.PI / 5; pts.push([5.5 + r * Math.cos(a), 6.2 + r * Math.sin(a)]); }
  return fromFn(inPolygon(pts));
}
function sun() {
  const rays = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]].map(([dx, dy]) => near([5.5 + dx * 3.7, 5.5 + dy * 3.7], [5.5 + dx * 4.7, 5.5 + dy * 4.7], 0.55));
  const core = disc(2.9);
  return fromFn((x, y) => core(x, y) || rays.some(f => f(x, y)));
}
function moon() { const a = disc(5), b = disc(4.2, 8, 3.4); return fromFn((x, y) => a(x, y) && !b(x, y)); }
function check() { const a = near([2.2, 6.2], [4.6, 8.8], 1.05), b = near([4.6, 8.8], [9.6, 2.6], 1.05); return fromFn((x, y) => a(x, y) || b(x, y)); }
function cross() { const a = near([2.6, 2.6], [8.4, 8.4], 1.1), b = near([8.4, 2.6], [2.6, 8.4], 1.1); return fromFn((x, y) => a(x + .5, y + .5) || b(x + .5, y + .5)); }
function bolt() { return fromFn(inPolygon([[7.4, .6], [2.4, 6.4], [5.2, 6.4], [3.6, 11.2], [9.4, 4.8], [6.4, 4.8], [8.6, .6]])); }
// Hand-drawn 10-wide masks, centred in the cell.
const centre = rows => { const top = Math.floor((12 - rows.length) / 2); return Array.from({length: 12}, (_, y) => { const r = rows[y - top]; return r ? '.' + r + '.' : '.'.repeat(12); }); };
const SKULL = centre(['..######..', '.########.', '##########', '#**####**#', '#**####**#', '####**####', '.########.', '..######..', '..#.##.#..']);
const LOCK = centre(['..######..', '..##..##..', '..##..##..', '##########', '##########', '####**####', '####**####', '##########', '##########']);
const WHEAT = centre(['....##....', '..#.##.#..', '.##.##.##.', '..#.##.#..', '.##.##.##.', '..#.##.#..', '....##....', '....##....', '....##....', '....##....']);

export const SYMBOL_ICONS = {
  skull: {colors: P('#f6edcf', '#e3cf93', '#a8a79e', '#0d1126'), mask: SKULL},
  wheat: {colors: P('#f0d466', '#e0b84a', '#b5832c', '#8f6f45'), mask: WHEAT},
  bolt: {colors: P('#fff2b0', '#f0d466', '#c58f2c', '#8f6f45'), mask: bolt()},
  sun: {colors: P('#fff2b0', '#f0d466', '#d98b2c', '#8f6f45'), mask: sun()},
  moon: {colors: P('#e8f0f0', '#b8c8d8', '#7f8fb0', '#4f5f8a'), mask: moon()},
  star: {colors: P('#fff2b0', '#f0d466', '#c58f2c', '#8f6f45'), mask: star()},
  check: {colors: P('#d6f08a', '#8fdc6a', '#2f7a2c', '#1f5a22'), mask: check()},
  cross: {colors: P('#f08a7a', '#d04040', '#962a30', '#5e1f24'), mask: cross()},
  lock: {colors: P('#f0d466', '#e0b84a', '#b5832c', '#3c2a14'), mask: LOCK},
};
export const SYMBOL_ICON_NAMES = Object.keys(SYMBOL_ICONS);

/** 12 strings of `o h g s d w .` keys for one symbol: outline around the body, bevel inside. */
export function symbolRows(name) {
  const {mask} = SYMBOL_ICONS[name], body = (x, y) => x >= 0 && y >= 0 && x < 12 && y < 12 && mask[y][x] !== '.';
  return mask.map((row, y) => [...row].map((ch, x) => {
    if (ch === '.') return [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => body(x + dx, y + dy)) ? 'o' : '.';
    if (ch === '*') return 'd';
    return !body(x, y - 1) || !body(x - 1, y) ? 'h' : !body(x, y + 1) || !body(x + 1, y) ? 's' : 'g';
  }).join(''));
}
