// Action poses for the native 16x32 cast: tool swing, canteen pouring, a hurt flinch
// and a collapsed pose, plus a shambling arms-forward posture for the idle and walk.
//
// The frames are derived from the character's FINISHED composite (body, garments,
// costume motifs): the acting arm's pixels are cleared and the arm is redrawn from
// authored joint paths in the character's own sleeve and skin ramps, with held gear on
// top. Everything is authored for right-facing, front and back; left is the right-facing
// pose drawn on the left composite, mirrored (so a mirrored swing holds the tool in the
// character's left hand: read each frame's report side).

import { handBoxes } from './joints.mjs';

export const ACTIONS = ['swing', 'water', 'hurt', 'down'];
export const TOOLS = ['hoe', 'pick', 'club'];
export const POSTURES = ['shamble'];
const FRAMES = { swing: 4, water: 4, hurt: 1, down: 1 };
const FPS = { swing: 10, water: 6 };
const FACINGS = ['front', 'right', 'back', 'left'];
const ROLES = ['outline', 'shadow', 'base', 'highlight'];

// Held gear colours come from the shared wasteland ramps (wood: dust, metal: concrete, water: oxide).
const GEAR = {
  wood: '#8f6f45', woodLight: '#b08d57', woodDark: '#6b5033',
  metal: '#a8a79e', metalLight: '#c4c3ba', metalDark: '#5f5f5a',
  cap: '#b5532f', water: '#8fc4b4', waterDark: '#5f9a8d',
};

const key = (x, y) => `${x},${y}`;
// The ground row is 29 (soles); rows 30-31 stay empty, so report bounds and the ground anchor agree.
const inCell = (x, y) => x >= 0 && x <= 15 && y >= 0 && y <= 29;

function line([x0, y0], [x1, y1]) {
  const out = [], dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (;;) {
    out.push([x, y]);
    if (x === x1 && y === y1) return out;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
function polyline(points) {
  const out = [];
  for (let i = 1; i < points.length; i++) for (const p of line(points[i - 1], points[i])) if (!out.some(q => q[0] === p[0] && q[1] === p[1])) out.push(p);
  return out;
}

// ---------------------------------------------------------------------------
// Authored poses (adult, bob 0, canonical right/front/back coordinates).
// An arm is {path: control points shoulder -> hand, hand: skin pixels at the end,
// tool?: {tip}, canteen?: {at, tilt}}; `lean` shifts rows (head, chest) and drops the
// upper body; `drops` are falling water pixels [x, y, shade].
// ---------------------------------------------------------------------------
const L = (head = 0, torso = 0, drop = 0) => ({ head, torso, drop });

const SWING = {
  right: [
    { lean: L(-1, 0, 0), near: { path: [[8, 15], [6, 14], [4, 12]], hand: 2, tool: { tip: [1, 6] } } },
    { lean: L(-1, 0, 0), near: { path: [[8, 15], [6, 12], [4, 10]], hand: 2, tool: { tip: [4, 2] } } },
    { lean: L(1, 1, 1), near: { path: [[8, 16], [10, 18], [12, 19]], hand: 2, tool: { tip: [14, 24] } } },
    { lean: L(1, 1, 1), near: { path: [[8, 16], [10, 19], [11, 21]], hand: 2, tool: { tip: [13, 25] } } },
  ],
  front: [
    { lean: L(0, 0, 0), near: { path: [[4, 15], [2, 14], [1, 12]], hand: 2, tool: { tip: [2, 6] } } },
    { lean: L(0, 0, 0), near: { path: [[4, 15], [2, 11], [2, 9]], hand: 2, tool: { tip: [2, 2] } } },
    { lean: L(0, 0, 1), near: { path: [[4, 16], [3, 19], [3, 21]], hand: 2, tool: { tip: [1, 26] } } },
    { lean: L(0, 0, 1), near: { path: [[4, 16], [3, 20], [3, 22]], hand: 2, tool: { tip: [1, 27] } } },
  ],
  back: [
    { lean: L(0, 0, 0), near: { path: [[11, 15], [13, 14], [14, 12]], hand: 2, tool: { tip: [13, 6] } } },
    { lean: L(0, 0, 0), near: { path: [[11, 15], [13, 11], [13, 9]], hand: 2, tool: { tip: [13, 2] } } },
    { lean: L(0, 0, 1), near: { path: [[11, 16], [12, 19], [12, 21]], hand: 2, tool: { tip: [14, 26] } } },
    { lean: L(0, 0, 1), near: { path: [[11, 16], [12, 20], [12, 22]], hand: 2, tool: { tip: [14, 27] } } },
  ],
};

const WATER = {
  right: [
    { lean: L(0, 0, 0), near: { path: [[8, 15], [10, 18], [11, 17]], hand: 2, canteen: { at: [12, 15], tilt: 0 } } },
    { lean: L(0, 0, 0), near: { path: [[8, 15], [11, 17], [12, 16]], hand: 2, canteen: { at: [13, 14], tilt: 1 } } },
    { lean: L(0, 0, 0), near: { path: [[8, 15], [11, 17], [12, 16]], hand: 2, canteen: { at: [13, 15], tilt: 2 } }, drops: [[15, 19, 0], [15, 22, 1], [14, 25, 0]] },
    { lean: L(0, 0, 0), near: { path: [[8, 15], [11, 17], [12, 16]], hand: 2, canteen: { at: [13, 15], tilt: 3 } }, drops: [[15, 18, 0], [15, 20, 1], [15, 22, 0], [15, 24, 1], [14, 27, 0], [15, 27, 0]] },
  ],
  front: [
    { lean: L(0, 0, 0), near: { path: [[4, 15], [3, 18], [5, 18]], hand: 2, canteen: { at: [3, 15], tilt: 0 } } },
    { lean: L(0, 0, 0), near: { path: [[4, 15], [2, 18], [3, 17]], hand: 2, canteen: { at: [2, 15], tilt: 1 } } },
    { lean: L(0, 0, 0), near: { path: [[4, 15], [2, 18], [3, 17]], hand: 2, canteen: { at: [2, 15], tilt: 2 } }, drops: [[1, 21, 0], [0, 24, 1], [1, 27, 0]] },
    { lean: L(0, 0, 0), near: { path: [[4, 15], [2, 18], [3, 17]], hand: 2, canteen: { at: [2, 15], tilt: 3 } }, drops: [[0, 20, 0], [0, 22, 1], [0, 24, 0], [1, 27, 1], [0, 28, 0]] },
  ],
  back: [
    { lean: L(0, 0, 0), near: { path: [[11, 15], [12, 18], [10, 18]], hand: 2, canteen: { at: [11, 15], tilt: 0 } } },
    { lean: L(0, 0, 0), near: { path: [[11, 15], [13, 18], [12, 17]], hand: 2, canteen: { at: [13, 15], tilt: 1 } } },
    { lean: L(0, 0, 0), near: { path: [[11, 15], [13, 18], [12, 17]], hand: 2, canteen: { at: [13, 15], tilt: 2 } }, drops: [[14, 21, 0], [15, 24, 1], [14, 27, 0]] },
    { lean: L(0, 0, 0), near: { path: [[11, 15], [13, 18], [12, 17]], hand: 2, canteen: { at: [13, 15], tilt: 3 } }, drops: [[15, 20, 0], [15, 22, 1], [15, 24, 0], [14, 27, 1], [15, 28, 0]] },
  ],
};

const HURT = {
  right: { lean: L(-2, -1, 0), near: { path: [[8, 15], [6, 15], [3, 13]], hand: 2 }, far: { path: [[9, 15], [12, 14], [14, 12]], hand: 2 } },
  front: { lean: L(-1, -1, 0), near: { path: [[4, 15], [2, 14], [1, 11]], hand: 2 }, far: { path: [[11, 15], [13, 14], [14, 11]], hand: 2 } },
  back: { lean: L(1, 1, 0), near: { path: [[11, 15], [13, 14], [14, 11]], hand: 2 }, far: { path: [[4, 15], [2, 14], [1, 11]], hand: 2 } },
};

// Shamble: both arms reach forward. Sway alternates the hands on the walk contacts.
const SHAMBLE = {
  right: [
    { near: { path: [[8, 16], [11, 17], [13, 17]], hand: 2 }, far: { path: [[9, 15], [12, 16], [14, 16]], hand: 2 } },
    { near: { path: [[8, 16], [11, 16], [13, 16]], hand: 2 }, far: { path: [[9, 15], [12, 16], [14, 17]], hand: 2 } },
  ],
  front: [
    { near: { path: [[4, 15], [3, 17], [5, 19]], hand: 2 }, far: { path: [[11, 15], [12, 17], [10, 19]], hand: 2 } },
    { near: { path: [[4, 15], [3, 17], [5, 18]], hand: 2 }, far: { path: [[11, 15], [12, 17], [10, 19]], hand: 2 } },
  ],
  back: [
    { near: { path: [[11, 15], [13, 16], [13, 18]], hand: 2 }, far: { path: [[4, 15], [2, 16], [2, 18]], hand: 2 } },
    { near: { path: [[11, 15], [13, 16], [13, 17]], hand: 2 }, far: { path: [[4, 15], [2, 16], [2, 18]], hand: 2 } },
  ],
};

// Arm zones (canonical coordinates, adult, bob 0) that are cleared before the arm is redrawn.
// The divider outline between arm and torso stays, so the torso keeps its edge.
const ZONES = {
  front: { near: [[2, 15, 4, 23]], far: [[11, 15, 13, 23]] },
  back: { near: [[11, 15, 13, 23]], far: [[2, 15, 4, 23]] },
  right: { near: [[4, 15, 5, 19], [4, 20, 6, 20]], far: [[11, 18, 12, 20]] },
};

const wx = x => (x < 7 ? x - 1 : x > 8 ? x + 1 : x);

// ---------------------------------------------------------------------------

function readCell(ops, cell) {
  const points = new Map(), order = [];
  for (const o of ops) if (o.command === 'draw' && o.cell === cell) { if (!points.has(key(o.x, o.y))) order.push(key(o.x, o.y)); points.set(key(o.x, o.y), { x: o.x, y: o.y, color: o.color, name: o.name }); }
  const groups = new Map();
  for (const o of ops) if (o.command === 'shape-group' && o.cell === cell) groups.set(o.name, new Set(o.shapes));
  return { points, groups };
}

function sampleRamp(ops, cell, prefix) {
  const ramp = {};
  for (const role of ROLES) {
    const names = ops.find(o => o.command === 'shape-group' && o.cell === cell && o.name === `${prefix}-${role}`)?.shapes;
    const hit = names && ops.find(o => o.command === 'draw' && o.cell === cell && names.includes(o.name));
    if (!hit) return null;
    ramp[role] = hit.color;
  }
  return ramp;
}

/** Mirror a composite to canonical right-facing coordinates (and back). */
const flipCell = cell => ({ points: new Map([...cell.points.values()].map(p => [key(15 - p.x, p.y), { ...p, x: 15 - p.x }])), groups: cell.groups });

class Canvas {
  constructor(cell, overArmNames) { this.points = new Map(cell.points); this.groups = cell.groups; this.fresh = new Map(); this.overArms = overArmNames; }
  has(x, y) { return this.points.has(key(x, y)); }
  get(x, y) { return this.points.get(key(x, y)); }
  set(x, y, p) { if (inCell(x, y)) this.points.set(key(x, y), { x, y, ...p }); }
  delete(x, y) { this.points.delete(key(x, y)); }
}

/** Shift rows: head rows (y<14) by `head`, chest rows (14..waist) by `torso`; drop all upper rows by `drop`. */
function applyLean(canvas, lean, waist) {
  if (!lean || (!lean.head && !lean.torso && !lean.drop)) return;
  const next = new Map();
  const legs = [...canvas.points.values()].filter(p => p.y > waist);
  const upper = [...canvas.points.values()].filter(p => p.y <= waist);
  for (const p of legs) {
    // dropping the upper body consumes the top leg row
    if (lean.drop && p.y < waist + 1 + lean.drop) continue;
    next.set(key(p.x, p.y), p);
  }
  for (const p of upper) {
    const dx = p.y < 14 + (waist - 21) ? lean.head : lean.torso, x = p.x + dx, y = p.y + (lean.drop || 0);
    if (x < 0 || x > 15) continue;
    next.set(key(x, y), { ...p, x, y });
  }
  canvas.points = next;
}

function toolPixels(tool, grip, tip) {
  // The head faces forward/down; if that clips the cell the head flips to the other side of the shaft.
  const first = toolShape(tool, grip, tip, 1);
  const clipped = shape => shape.filter(p => !inCell(p.x, p.y)).length;
  const other = clipped(first) ? toolShape(tool, grip, tip, -1) : first;
  return clipped(other) < clipped(first) ? other : first;
}

function toolShape(tool, grip, tip, flip) {
  const vx = tip[0] - grip[0], vy = tip[1] - grip[1], len = Math.hypot(vx, vy) || 1;
  const d = [Math.round(vx / len), Math.round(vy / len)];
  // blade normal: perpendicular to the shaft, pointing downward/forward
  let n = [-d[1], d[0]];
  if (n[1] < 0 || (n[1] === 0 && n[0] < 0)) n = [-n[0], -n[1]];
  if (d[0] === 0) n = [1, 0];
  if (d[1] === 0) n = [0, 1];
  n = [n[0] * flip, n[1] * flip];
  const px = [];
  const add = (x, y, c) => px.push({ x, y, c });
  line(grip, tip).forEach(([x, y], i, all) => px.push({ x, y, c: i === all.length - 1 ? GEAR.woodDark : GEAR.wood, shaft: true }));
  const [tx, ty] = tip;
  if (tool === 'hoe') {
    for (const k of [0, 1, 2, 3]) add(tx + k * n[0], ty + k * n[1], k === 3 ? GEAR.metalLight : GEAR.metal);
    for (const k of [1, 2, 3]) add(tx + k * n[0] - d[0], ty + k * n[1] - d[1], GEAR.metalDark);
  } else if (tool === 'pick') {
    for (const k of [-2, -1, 0, 1, 2]) {
      const back = Math.abs(k) >= 2 ? 1 : 0;
      add(tx + k * n[0] - back * d[0], ty + k * n[1] - back * d[1], Math.abs(k) === 2 ? GEAR.metalLight : GEAR.metal);
    }
    for (const k of [-1, 0, 1]) add(tx + k * n[0] + d[0], ty + k * n[1] + d[1], GEAR.metalDark);
  } else { // club: a thick knotted striking end with a nail
    for (const [x, y] of line(grip, tip).slice(-4)) { add(x + n[0], y + n[1], GEAR.woodLight); add(x - n[0], y - n[1], GEAR.woodDark); }
    add(tx + d[0], ty + d[1], GEAR.woodDark); add(tx + n[0], ty + n[1], GEAR.metalLight);
  }
  return px;
}

const CANTEEN = [
  // tilt 0 (upright), 1, 2, 3 (pouring); offsets relative to `at`
  [[0, 0, 'cap'], [-1, 1, 'light'], [0, 1, 'base'], [-1, 2, 'base'], [0, 2, 'shade'], [-1, 3, 'base'], [0, 3, 'shade']],
  [[1, 0, 'cap'], [0, 1, 'light'], [1, 1, 'base'], [-1, 2, 'light'], [0, 2, 'base'], [-1, 3, 'base'], [0, 3, 'shade']],
  [[2, 2, 'cap'], [1, 1, 'light'], [1, 2, 'base'], [0, 1, 'light'], [0, 2, 'base'], [-1, 2, 'base'], [-1, 3, 'shade'], [0, 3, 'shade']],
  [[2, 3, 'cap'], [1, 2, 'light'], [1, 3, 'base'], [0, 2, 'light'], [0, 3, 'base'], [-1, 3, 'base'], [-1, 4, 'shade'], [0, 4, 'shade']],
];
const CANTEEN_COLOR = { cap: GEAR.cap, light: GEAR.metalLight, base: GEAR.metal, shade: GEAR.metalDark };

function drawArm(canvas, arm, ctx, off, wide, label) {
  const m = ([x, y]) => [(wide ? wx(x) : x) + off[0], y + off[1]];
  const points = arm.path.map(m), path = polyline(points);
  // Sleeves end at the elbow (control point 2); the forearm and hand are skin, so the arm reads against the torso.
  const elbow = points.length > 2 ? path.findIndex(p => p[0] === points[1][0] && p[1] === points[1][1]) : -1;
  const handLen = Math.min(Math.max(arm.hand ?? 2, elbow >= 0 ? path.length - 1 - elbow : 0), path.length - 1);
  const sleeve = path.slice(0, path.length - handLen), hand = path.slice(path.length - handLen);
  const gear = [];
  if (arm.tool) for (const p of toolPixels(ctx.tool, path.at(-1), [Math.min(15, arm.tool.tip[0] + off[0] + (wide && arm.tool.tip[0] > 8 ? 1 : 0)), arm.tool.tip[1] + off[1]])) gear.push(p);
  if (arm.canteen) {
    const [ax, ay] = m(arm.canteen.at);
    for (const [dx, dy, role] of CANTEEN[arm.canteen.tilt]) gear.push({ x: ax + dx, y: ay + dy, c: CANTEEN_COLOR[role] });
  }
  const sleeveRamp = ctx.sleeve, skinRamp = ctx.hand, thick = wide ? 2 : 1;
  const set = new Map();
  const put = (x, y, color, group, part, shaft = false) => {
    if (!inCell(x, y)) { if (part === 'tool' && shaft) throw new Error(`Held gear pixel (${x},${y}) falls outside the 16x32 cell in ${label} (grip ${arm.path.at(-1)} tip ${arm.tool?.tip} off ${off}).`); return; }
    set.set(key(x, y), { x, y, color, group, part });
  };
  for (const g of gear) put(g.x, g.y, g.c, 'gear', 'tool', g.shaft);
  sleeve.forEach(([x, y], i) => {
    const role = i === 0 ? 'highlight' : 'base';
    for (let t = 0; t < thick; t++) put(x + t, y, sleeveRamp[role], ctx.sleeveName + '-' + role, 'sleeve');
  });
  hand.forEach(([x, y], i) => { for (let t = 0; t < thick; t++) put(x + t, y, i ? skinRamp.highlight : skinRamp.base, ctx.handName + '-' + (i ? 'highlight' : 'base'), 'hand'); });
  for (const p of set.values()) {
    const old = canvas.get(p.x, p.y);
    if (old && ctx.overArms(old)) continue;
    canvas.set(p.x, p.y, { color: p.color, name: `act-${label}-${p.x}-${p.y}`, group: p.group, part: p.part, fresh: true });
  }
  // outline ring around the new arm: over empty pixels and over same-material torso pixels
  const sleeveColors = new Set([sleeveRamp.base, sleeveRamp.highlight, sleeveRamp.shadow]);
  for (const p of set.values()) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const x = p.x + dx, y = p.y + dy;
    if (set.has(key(x, y)) || !inCell(x, y)) continue;
    const old = canvas.get(x, y);
    if (old && old.fresh) continue;
    if (old && (!sleeveColors.has(old.color) || ctx.overArms(old) || ctx.isHead(old))) continue;
    const color = p.part === 'hand' ? skinRamp.outline : p.part === 'tool' ? ctx.outline : sleeveRamp.outline;
    const group = p.part === 'hand' ? ctx.handName + '-outline' : p.part === 'tool' ? 'gear' : ctx.sleeveName + '-outline';
    canvas.set(x, y, { color, name: `act-${label}-${x}-${y}`, group, part: p.part, fresh: true });
  }
  return path.at(-1);
}

function emit(ops, cell, canvas, mirror, baseGroups) {
  const names = new Set(), groupsOut = new Map();
  const list = [...canvas.points.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const p of list) {
    ops.push({ command: 'draw', type: 'point', cell, name: p.name, x: mirror ? 15 - p.x : p.x, y: p.y, color: p.color });
    names.add(p.name);
    if (p.group) { if (!groupsOut.has(p.group)) groupsOut.set(p.group, []); groupsOut.get(p.group).push(p.name); }
  }
  for (const [name, members] of baseGroups) {
    const kept = [...members].filter(n => names.has(n));
    if (kept.length) { if (!groupsOut.has(name)) groupsOut.set(name, []); groupsOut.get(name).unshift(...kept); }
  }
  for (const [name, shapes] of groupsOut) ops.push({ command: 'shape-group', sub: 'create', cell, name, shapes: [...new Set(shapes)] });
}

function slump(canvas, bob) {
  // Collapse: the legs fold (rows removed), the torso compresses, the head drops and tips.
  const rows = new Map();
  for (const p of canvas.points.values()) { if (!rows.has(p.y)) rows.set(p.y, []); rows.get(p.y).push(p); }
  const remove = new Set([17, 18, 19, 20, 24, 25, 26].map(y => y + bob));
  const keep = [...rows.keys()].filter(y => !remove.has(y)).sort((a, b) => a - b);
  const next = new Map(), top = 29 - (keep.length - 1);
  keep.forEach((y, i) => {
    const ny = top + i, head = y < 14 + bob;
    for (const p of rows.get(y)) { const x = p.x + (head ? 2 : y <= 21 + bob ? 1 : 0); if (x >= 0 && x <= 15) next.set(key(x, ny), { ...p, x, y: ny }); }
  });
  canvas.points = next;
}

/**
 * Append action cells (and apply postures) to a finished-but-uncut native composite.
 * Returns the new operations and per-alias facts (acting side, grip) for the report.
 */
export function addActionFrames(ops, { kind = 'adult', actions = [], tool = 'hoe', posture, armMaterial, handMaterial, overArms = new Map(), outline = '#26333f' } = {}) {
  const wide = kind === 'large';
  const out = ops.map(o => ({ ...o }));
  const frames = out.filter(o => o.command === 'name');
  const cellOf = alias => frames.find(f => f.as === alias).cell;
  const idleCell = cellOf('front');
  const sleeveName = armMaterial ?? (sampleRamp(out, idleCell, 'cloth') ? 'cloth' : 'skin');
  const handName = handMaterial ?? 'skin';
  const sleeve = sampleRamp(out, idleCell, sleeveName), handRamp = sampleRamp(out, idleCell, handName);
  if (!sleeve || !handRamp) throw new Error(`Action poses need ${sleeve ? handName : sleeveName} colour groups: set armMaterial/handMaterial.`);
  const info = {};
  const enabled = ACTIONS.filter(a => actions.includes(a));
  let col = Math.max(...frames.map(f => Number(f.cell.split(',')[1]))) + 1;
  const layout = Object.fromEntries(enabled.map(a => { const at = col; col += FRAMES[a]; return [a, at]; }));
  if (enabled.length) out[0] = { ...out[0], cols: col };

  const readCache = new Map();
  const read = cell => { if (!readCache.has(cell)) readCache.set(cell, readCell(out, cell)); return readCache.get(cell); };
  const overArm = p => p.name.startsWith('costume-') && Boolean(overArms.get(Number(p.name.split('-')[1])));
  const isCostume = p => p.name.startsWith('costume-');
  const ctxFor = cell => ({ tool, sleeve, hand: handRamp, sleeveName, handName, outline, overArms: overArm, isHead: p => Boolean(read(cell).groups.get('head')?.has(p.name)) });
  // Head top from every drawn head pixel, including those a hat or hair now covers.
  const bobOf = cell => { const head = read(cell).groups.get('head'); return Math.min(...out.filter(o => o.command === 'draw' && o.cell === cell && head?.has(o.name)).map(o => o.y)) - 2; };
  const zoneFor = (dir, which, off) => ZONES[dir][which].map(([l, t, r, b]) => [(wide ? wx(l) : l) + off[0], t + off[1], (wide ? wx(r) : r) + off[0], b + off[1]]);
  function clear(canvas, rects) {
    for (const [l, t, r, b] of rects) for (let y = t; y <= b; y++) for (let x = l; x <= r; x++) {
      const p = canvas.get(x, y);
      if (p && !isCostume(p)) canvas.delete(x, y);
    }
  }

  // One action frame from the facing's idle composite (left: the left composite mirrored to right-facing).
  function pose(facing, spec, label) {
    const mirror = facing === 'left', dir = mirror ? 'right' : facing, cell = cellOf(facing);
    const src = read(cell), canvas = new Canvas(mirror ? flipCell(src) : src), bob = bobOf(cell), ctx = ctxFor(cell);
    if (spec.lean) applyLean(canvas, spec.lean, 21 + bob);
    const lean = spec.lean ?? L(), off = [lean.torso, bob + lean.drop], grips = {};
    for (const which of ['far', 'near']) if (spec[which]) clear(canvas, zoneFor(dir, which, off));
    for (const which of ['far', 'near']) if (spec[which]) grips[which] = drawArm(canvas, spec[which], ctx, off, wide, `${label}${which[0]}`);
    for (const [x, y, shade] of spec.drops ?? []) canvas.set(x, y, { color: shade ? GEAR.waterDark : GEAR.water, name: `act-${label}-drop-${x}-${y}`, group: 'gear', part: 'tool', fresh: true });
    if (spec.down) slump(canvas, bob);
    return { canvas, mirror, cell, grip: grips.near };
  }

  function addFrame(facing, alias, action, frame, spec) {
    const rowCell = `${FACINGS.indexOf(facing)},${layout[action] + frame}`;
    const { canvas, mirror, cell, grip } = pose(facing, spec, `${action}${frame}`);
    out.push({ command: 'name', cell: rowCell, as: alias });
    emit(out, rowCell, canvas, mirror, read(cell).groups);
    info[alias] = { action, frame, side: facing === 'left' ? 'left' : 'right', ...(grip ? { wrist: [mirror ? 15 - grip[0] : grip[0], grip[1]] } : {}) };
    return rowCell;
  }

  for (const facing of FACINGS) {
    const dir = facing === 'left' ? 'right' : facing;
    if (layout.swing !== undefined) {
      const cells = SWING[dir].map((spec, i) => addFrame(facing, `${facing}_swing_${i}`, 'swing', i, spec));
      out.push({ command: 'group', sub: 'create', name: `swing_${facing}`, cells, fps: FPS.swing });
    }
    if (layout.water !== undefined) {
      const cells = WATER[dir].map((spec, i) => addFrame(facing, `${facing}_water_${i}`, 'water', i, spec));
      out.push({ command: 'group', sub: 'create', name: `water_${facing}`, cells, fps: FPS.water });
    }
    if (layout.hurt !== undefined) out.push({ command: 'group', sub: 'create', name: `hurt_${facing}`, cells: [addFrame(facing, `${facing}_hurt`, 'hurt', 0, HURT[dir])], fps: 8 });
    if (layout.down !== undefined) out.push({ command: 'group', sub: 'create', name: `down_${facing}`, cells: [addFrame(facing, `${facing}_down`, 'down', 0, { down: true })], fps: 8 });
  }
  if (layout.down !== undefined) out.push({ command: 'group', sub: 'create', name: 'down', cells: [`0,${layout.down}`], fps: 8 });

  // Shamble: rebuild idle and walk cells with both arms reaching forward.
  if (posture === 'shamble') {
    for (const facing of FACINGS) {
      const mirror = facing === 'left', dir = mirror ? 'right' : facing;
      const idleSrc = read(cellOf(facing));
      const idle = mirror ? flipCell(idleSrc) : idleSrc, idleBob = bobOf(cellOf(facing));
      for (const alias of [facing, ...[0, 1, 2, 3].map(k => `${facing}_walk_${k}`)]) {
        const cell = cellOf(alias), phase = alias.includes('_walk_') ? Number(alias.split('_').at(-1)) : 0;
        const walkSrc = read(cell), walk = mirror ? flipCell(walkSrc) : walkSrc, bobK = bobOf(cell), dy = bobK - idleBob;
        const waistK = 21 + bobK, canvas = new Canvas({ points: new Map(), groups: walkSrc.groups });
        for (const p of idle.points.values()) if (p.y <= 21 + idleBob) canvas.set(p.x, p.y + dy, p);
        // lower body from the walk frame, minus the swinging hands and sleeves
        const hands = handBoxes('adult', dir, phase);
        const skin = new Set([...walkSrc.groups].filter(([n]) => n.startsWith('skin-')).flatMap(([, s]) => [...s]));
        for (const p of walk.points.values()) {
          if (p.y <= waistK) continue;
          const inHand = hands.some(([l, t, r, b]) => p.x >= l && p.x <= r && p.y >= t + bobK && p.y <= b + bobK);
          if (inHand && skin.has(p.name)) continue;
          if ((dir === 'front' || dir === 'back') && (p.x <= 3 || p.x >= 12) && !isCostume(p)) continue;
          canvas.set(p.x, p.y, p);
        }
        const sway = SHAMBLE[dir][phase % 2 ? 1 : 0], off = [0, bobK], ctx = ctxFor(cell);
        for (const which of ['far', 'near']) clear(canvas, zoneFor(dir, which, off));
        for (const which of ['far', 'near']) drawArm(canvas, sway[which], ctx, off, wide, `s${phase}${which[0]}`);
        for (let i = out.length - 1; i >= 0; i--) if (out[i].cell === cell && (out[i].command === 'draw' || out[i].command === 'shape-group')) out.splice(i, 1);
        emit(out, cell, canvas, mirror, walkSrc.groups);
      }
    }
  }

  // pivot stays the last structural op
  const pivot = out.findIndex(o => o.command === 'pivot');
  if (pivot >= 0) { const [p] = out.splice(pivot, 1); out.push(p); }
  return { ops: out, info };
}
