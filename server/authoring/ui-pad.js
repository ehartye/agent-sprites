// Controller-button glyphs ("prompts") for the `wasteland` UI theme.
// Colour pixel art, at most 13 px tall, drawn procedurally with a tiny 3x5 letter font so they sit beside ~7px text.
// Face buttons are named by position (south/east/west/north) so a game can show the active controller's glyph.
// Everything here is deterministic: no randomness, no floating point beyond circle distance tests.
const OUT = '#26262a';
const INK = '#f6edcf';
const RAMPS = {
  green: ['#8fdc6a', '#4fa83a', '#2f7a2c'],
  red: ['#f08a7a', '#d04040', '#962a30'],
  blue: ['#7fb0f0', '#3f78d0', '#2a509a'],
  yellow: ['#fff09a', '#f0c830', '#c09418'],
  dark: ['#6a6e78', '#454953', '#2f323a'],
  light: ['#dcdee4', '#b4b7c0', '#82858f'],
  amber: ['#f0b070', '#d98b4a', '#a85f2c'],
};
const SYMBOL_COLORS = {cross: '#6aa8f4', circle: '#f0605a', square: '#f08cc4', triangle: '#52d89c', gold: '#f0d466'};

const FONT = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'], Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  L: ['#..', '#..', '#..', '#..', '###'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  Z: ['###', '..#', '.#.', '#..', '###'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  S: ['.##', '#..', '.#.', '..#', '##.'], 1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'], 3: ['###', '..#', '##.', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  '-': ['...', '...', '###', '...', '...'], '+': ['...', '.#.', '###', '.#.', '...'],
};
export const PAD_FONT = FONT;

export const PAD_FAMILIES = ['xbox', 'ps', 'switch', 'deck'];
export const PAD_IDS = ['south', 'east', 'west', 'north', 'lb', 'rb', 'lt', 'rt', 'back', 'start', 'ls', 'rs', 'lsb', 'rsb', 'dpad', 'dpad_up', 'dpad_down', 'dpad_left', 'dpad_right', 'dpad_ud', 'dpad_lr'];
export const PAD_DECK_EXTRA_IDS = ['l4', 'r4', 'l5', 'r5'];
export const PAD_ALIAS_NAMES = PAD_FAMILIES.flatMap(f => [...PAD_IDS, ...(f === 'deck' ? PAD_DECK_EXTRA_IDS : [])].map(id => `pad_${f}_${id}`));

// A small local canvas that is centred into the 24x24 cell when emitted.
function canvas(w, h) {
  return {w, h, px: Array.from({length: h}, () => Array(w).fill(null))};
}
const put = (cv, x, y, col) => { if (x >= 0 && y >= 0 && x < cv.w && y < cv.h) cv.px[y][x] = col; };
// Fill a mask with an outlined, bevelled body: dark outline, highlight top-left, shade bottom-right.
function body(cv, inside, [hi, base, sh], ox = 0, oy = 0) {
  const I = (x, y) => x >= 0 && y >= 0 && x < cv.w && y < cv.h && inside(x - ox, y - oy);
  const E = (x, y) => I(x, y) && !(I(x - 1, y) && I(x + 1, y) && I(x, y - 1) && I(x, y + 1));
  for (let y = 0; y < cv.h; y++) for (let x = 0; x < cv.w; x++) {
    if (!I(x, y)) continue;
    let col = base;
    if (E(x, y)) col = OUT;
    else if (E(x, y - 1) && I(x, y - 1)) col = hi;
    else if (E(x, y + 1) && I(x, y + 1)) col = sh;
    else if (E(x - 1, y) && I(x - 1, y)) col = hi;
    else if (E(x + 1, y) && I(x + 1, y)) col = sh;
    cv.px[y][x] = col;
  }
  return {I, E};
}
// Rounded rectangle mask with per-corner radii [tl, tr, br, bl]; a corner of radius r cuts pixels by distance.
const roundRect = (w, h, [tl, tr, br, bl]) => (x, y) => {
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  const corner = (r, cx, cy) => r <= 1 || Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r;
  if (x < tl && y < tl) return corner(tl, tl, tl);
  if (x >= w - tr && y < tr) return corner(tr, w - tr, tr);
  if (x >= w - br && y >= h - br) return corner(br, w - br, h - br);
  if (x < bl && y >= h - bl) return corner(bl, bl, h - bl);
  return true;
};
const discMask = d => (x, y) => Math.hypot(x + 0.5 - d / 2, y + 0.5 - d / 2) <= d / 2;
const textWidth = s => s.length * 4 - 1;
function text(cv, s, x, y, col) {
  [...s].forEach((ch, i) => FONT[ch].forEach((row, dy) => { for (let dx = 0; dx < 3; dx++) if (row[dx] === '#') put(cv, x + i * 4 + dx, y + dy, col); }));
}
const textCentered = (cv, s, cx, y, col) => text(cv, s, cx - Math.floor(textWidth(s) / 2), y, col);
function bitmap(cv, rows, x, y, col) {
  rows.forEach((row, dy) => { for (let dx = 0; dx < row.length; dx++) if (row[dx] === '#') put(cv, x + dx, y + dy, col); });
}

const SYMBOLS = {
  cross: ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'],
  circle: ['..###..', '.#...#.', '#.....#', '#.....#', '#.....#', '.#...#.', '..###..'],
  square: ['######', '#....#', '#....#', '#....#', '#....#', '######'],
  triangle: ['...#...', '..#.#..', '..#.#..', '.#...#.', '.#...#.', '#######'],
};

function letterDisc(label, ramp, letterCol) {
  const cv = canvas(11, 11);
  body(cv, discMask(11), ramp);
  textCentered(cv, label, 5, 3, letterCol);
  return cv;
}
function symbolDisc(symbol) {
  const cv = canvas(11, 11);
  body(cv, discMask(11), RAMPS.dark);
  const rows = SYMBOLS[symbol];
  bitmap(cv, rows, Math.floor((11 - rows[0].length) / 2), Math.floor((11 - rows.length) / 2), SYMBOL_COLORS[symbol]);
  return cv;
}
function bumper(label) {
  const cv = canvas(19, 9);
  body(cv, roundRect(19, 9, [4, 4, 4, 4]), RAMPS.light);
  textCentered(cv, label, 9, 2, OUT);
  return cv;
}
// Triggers are taller and curve away on the outer side, with the label low on the body.
function trigger(label, left) {
  const cv = canvas(15, 13);
  body(cv, roundRect(15, 13, left ? [7, 2, 2, 2] : [2, 7, 2, 2]), RAMPS.light);
  textCentered(cv, label, 7, 6, OUT);
  return cv;
}
function sysDisc(icon) {
  const cv = canvas(11, 11);
  body(cv, discMask(11), RAMPS.dark);
  icon(cv, 5);
  return cv;
}
function sysPill(icon) {
  const cv = canvas(15, 9);
  body(cv, roundRect(15, 9, [4, 4, 4, 4]), RAMPS.dark);
  icon(cv, 7);
  return cv;
}
const iconView = (cv, cx) => {
  const rect = (x0, y0, w, h) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x === 0 || y === 0 || x === w - 1 || y === h - 1) put(cv, x0 + x, y0 + y, INK); };
  const x0 = cx - 3, y0 = Math.floor((cv.h - 6) / 2);
  rect(x0, y0, 5, 4); rect(x0 + 2, y0 + 2, 5, 4);
};
const iconMenu = (cv, cx) => { const y0 = Math.floor((cv.h - 5) / 2); for (const dy of [0, 2, 4]) for (let x = 0; x < 7; x++) put(cv, cx - 3 + x, y0 + dy, INK); };
const iconOptions = (cv, cx) => { const y0 = Math.floor((cv.h - 5) / 2); for (const dy of [0, 2, 4]) for (let x = 0; x < 5; x++) put(cv, cx - 2 + x, y0 + dy, INK); };
const iconCreate = (cv, cx) => bitmap(cv, ['..#..', '.###.', '#...#', '#...#', '#####'], cx - 2, Math.floor((cv.h - 5) / 2), INK);
const iconMinus = (cv, cx) => bitmap(cv, ['#####'], cx - 2, Math.floor(cv.h / 2), INK);
const iconPlus = (cv, cx) => bitmap(cv, ['..#..', '..#..', '#####', '..#..', '..#..'], cx - 2, Math.floor((cv.h - 5) / 2), INK);
function stick(letter, pressed) {
  const cv = canvas(13, 13);
  const {I, E} = body(cv, discMask(13), RAMPS.dark);
  // The thumb-cap ring; the pressed variant has a gold ring and a filled light cap with a dark letter.
  const ring = pressed ? SYMBOL_COLORS.gold : '#868a96';
  for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
    const r = Math.hypot(x - 6, y - 6);
    if (!I(x, y) || E(x, y)) continue;
    if (r > 4.1 && r <= 5.3) cv.px[y][x] = ring;
    else if (pressed && r <= 4.1) cv.px[y][x] = INK;
  }
  textCentered(cv, letter, 6, 4, pressed ? OUT : INK);
  return cv;
}
function dpad(up, down, left, right) {
  const cv = canvas(13, 13);
  const arm = (x, y) => (Math.abs(x - 6) <= 2 && y >= 0 && y < 13) || (Math.abs(y - 6) <= 2 && x >= 0 && x < 13);
  const {I, E} = body(cv, arm, RAMPS.dark);
  const lit = (x, y) => (up && y < 5 && Math.abs(x - 6) <= 2) || (down && y > 7 && Math.abs(x - 6) <= 2) || (left && x < 5 && Math.abs(y - 6) <= 2) || (right && x > 7 && Math.abs(y - 6) <= 2);
  for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) if (I(x, y) && !E(x, y) && lit(x, y)) cv.px[y][x] = INK;
  if (!up && !down && !left && !right) put(cv, 6, 6, RAMPS.dark[2]);
  return cv;
}
function gripButton(label) {
  const cv = canvas(11, 13);
  body(cv, roundRect(11, 13, [3, 3, 3, 3]), RAMPS.amber);
  textCentered(cv, label, 5, 4, OUT);
  return cv;
}

const FACE_LETTERS = {
  xbox: {south: ['A', 'green', INK], east: ['B', 'red', INK], west: ['X', 'blue', INK], north: ['Y', 'yellow', OUT]},
  switch: {south: ['B', 'dark', INK], east: ['A', 'dark', INK], west: ['Y', 'dark', INK], north: ['X', 'dark', INK]},
};
FACE_LETTERS.deck = FACE_LETTERS.xbox;
const PS_FACE = {south: 'cross', east: 'circle', west: 'square', north: 'triangle'};
const SHOULDER = {
  xbox: {lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT'}, deck: {lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT'},
  ps: {lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2'}, switch: {lb: 'L', rb: 'R', lt: 'ZL', rt: 'ZR'},
};

function padCanvas(family, id) {
  if (['south', 'east', 'west', 'north'].includes(id)) {
    if (family === 'ps') return symbolDisc(PS_FACE[id]);
    const [label, ramp, ink] = FACE_LETTERS[family][id];
    return letterDisc(label, RAMPS[ramp], ink);
  }
  if (id === 'lb' || id === 'rb') return bumper(SHOULDER[family][id]);
  if (id === 'lt' || id === 'rt') return trigger(SHOULDER[family][id], id === 'lt');
  if (id === 'back') return family === 'ps' ? sysPill(iconCreate) : family === 'switch' ? sysDisc(iconMinus) : sysDisc(iconView);
  if (id === 'start') return family === 'ps' ? sysPill(iconOptions) : family === 'switch' ? sysDisc(iconPlus) : sysDisc(iconMenu);
  if (id === 'ls' || id === 'rs') return stick(id === 'ls' ? 'L' : 'R', false);
  if (id === 'lsb' || id === 'rsb') return stick(id === 'lsb' ? 'L' : 'R', true);
  if (id === 'dpad') return dpad(false, false, false, false);
  if (id === 'dpad_up') return dpad(true, false, false, false);
  if (id === 'dpad_down') return dpad(false, true, false, false);
  if (id === 'dpad_left') return dpad(false, false, true, false);
  if (id === 'dpad_right') return dpad(false, false, false, true);
  if (id === 'dpad_ud') return dpad(true, true, false, false);
  if (id === 'dpad_lr') return dpad(false, false, true, true);
  if (PAD_DECK_EXTRA_IDS.includes(id)) return gripButton(id.toUpperCase());
  throw Error(`Unknown pad glyph: ${family}_${id}`);
}

// Pixel rows (hex colours or null) for a pad alias, before centring: used by tests and the drawer.
export function padPixels(alias) {
  const m = /^pad_(xbox|ps|switch|deck)_(.+)$/.exec(alias);
  if (!m) throw Error(`Not a pad alias: ${alias}`);
  return padCanvas(m[1], m[2]).px;
}

// Cursors for the same colour-icon family: a 16x16 tile cursor (corner brackets) and an 11x11 aim crosshair.
export const CURSOR_ALIAS_NAMES = ['cursor_tile', 'cursor_aim'];
const CURSOR_GOLD = '#f0d466';
function outlined(size, isGold) {
  const px = Array.from({length: size}, () => Array(size).fill(null));
  const G = (x, y) => x >= 0 && y >= 0 && x < size && y < size && isGold(x, y);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (G(x, y)) px[y][x] = CURSOR_GOLD;
    else if (G(x - 1, y) || G(x + 1, y) || G(x, y - 1) || G(x, y + 1)) px[y][x] = OUT;
  }
  return px;
}
export function cursorPixels(alias) {
  if (alias === 'cursor_tile') {
    // Four corner brackets (2 px thick, 5 px arms) inside a 1 px dark outline; the middle stays hollow.
    return outlined(16, (x, y) => {
      if (x < 1 || y < 1 || x > 14 || y > 14) return false;
      const dx = Math.min(x - 1, 14 - x), dy = Math.min(y - 1, 14 - y);
      return (dx <= 1 && dy <= 4) || (dy <= 1 && dx <= 4);
    });
  }
  if (alias === 'cursor_aim') {
    return outlined(11, (x, y) => {
      if (x < 1 || y < 1 || x > 9 || y > 9) return false;
      return (y === 5 && (x <= 3 || x >= 7)) || (x === 5 && (y <= 3 || y >= 7));
    });
  }
  throw Error(`Unknown cursor: ${alias}`);
}
// Draw a pad or cursor alias centred in the 24x24 cell through the recipe's rect(x,y,w,h,color); false for other aliases.
export function drawGlyph(alias, rect) {
  const px = alias.startsWith('pad_') ? padPixels(alias) : CURSOR_ALIAS_NAMES.includes(alias) ? cursorPixels(alias) : null;
  if (!px) return false;
  const h = px.length, w = px[0].length, ox = Math.floor((24 - w) / 2), oy = Math.floor((24 - h) / 2);
  px.forEach((row, y) => {
    for (let x = 0; x < w;) {
      const col = row[x];
      if (!col) { x++; continue; }
      const start = x;
      while (x < w && row[x] === col) x++;
      rect(ox + start, oy + y, x - start, 1, col);
    }
  });
  return true;
}
