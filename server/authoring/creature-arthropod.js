import { drawLeg, footFor, legWidth, eye } from './creature-parts.js';
import { GAITS, liftFor, foot, legPhase } from './creature-motion.js';
import { drawExtraEyes } from './creature-features.js';

const rnd = Math.round;
/** 1px jointed legs are drawn as bare dark strokes: an outline on top would swallow them. */
const stick = (pal, far) => ({ hi: far ? pal.body.out : pal.body.lo, mid: far ? pal.body.out : pal.body.lo, lo: pal.body.out, out: pal.body.out, flat: true, noOutline: true });

/** Eight-or-six legs in profile. Hips run along the underside; knees bow up and away from the body. */
function sideLegs(ctx, { count, hipFrom, hipTo, hipY, spreadBase, reach, w, gait, legLen, outward }) {
  const { pose, pal, H } = ctx, footY = H - w / 2, fx = [];
  const slots = [...Array(count).keys()];
  const per = i => (count === 1 ? 0.5 : i / (count - 1));
  const draws = [];
  for (const side of ['far', 'near']) for (const i of slots) {
    const hx = hipFrom + (hipTo - hipFrom) * per(i) + (side === 'far' ? 1 : 0);
    const spread = spreadBase + (per(i) - 0.5) * 2 * reach;
    const off = gait[side][i % gait[side].length];
    const f = footFor(ctx, hx + spread, off, gait.duty, Math.max(2, (hipTo - hipFrom) / count * 1.6), footY);
    const fxx = pose.stepping ? f.x : hx + spread, fyy = f.y;
    const dir = (per(i) - 0.5) * 2;
    draws.push({ name: `leg_${side}_${i}`, hip: [hx, hipY], foot: [fxx, fyy], l1: legLen * 0.52, l2: legLen * 0.62, hint: [dir * outward, -1], w, mat: side === 'far' ? pal.far : pal.body, paw: 'none', far: side === 'far' });
  }
  void fx;
  return draws;
}

// ---------------------------------------------------------------- insect

export function insectSide(ctx) {
  const { c, W, H, pal, P, pose, F } = ctx, fy = H - 1, lw = Math.max(1, rnd(H * 0.034 * P.legThickness));
  const bl = W * 0.3 * P.bodyLength, bh = H * 0.17 * P.bodyHeight, legLen = H * 0.24 * P.legLength;
  const cx = W * 0.5 - 0.5, bx = cx + pose.lunge * W * 0.08 + (pose.hurt ? -1 : 0), by = fy - legLen * 0.8 - bh * 0.4 + pose.bob;
  const hr = Math.max(1.6, H * 0.1 * P.headSize);
  const legs = sideLegs(ctx, { count: 3, hipFrom: bx - bl * 0.3, hipTo: bx + bl * 0.5, hipY: by + bh * 0.5, spreadBase: 0, reach: bl * 0.38, w: lw, gait: GAITS.tripod, legDefault: 0, legLen, outward: 0.8 });
  const extra = F.has('extra_limbs') ? sideLegs(ctx, { count: 1, hipFrom: bx + bl * 0.05, hipTo: bx + bl * 0.05, hipY: by + bh * 0.5, spreadBase: bl * 0.2, reach: 0, w: lw, gait: { duty: 0.5, far: [0.25], near: [0.75] }, legLen, outward: 0 }) : [];
  const dark = { ...pal.dark, noOutline: false };
  const tiny = H < 20, drawLegs = list => { for (const l of list) drawLeg(ctx, { ...l, mat: stick(pal, l.far), straight: tiny }); };
  drawLegs([...legs, ...extra].filter(l => l.far || tiny));
  // antennae behind the head
  const hx = bx + bl * 0.95 + pose.ext * 1.2, hy = by + bh * 0.25 + (pose.ext > 0 ? pose.ext * 0.8 : 0) + pose.head * 0.5;
  {
    const sway = pose.sway, lift = pose.hurt ? 2 : 0;
    c.begin('antenna', dark); c.path([[hx + hr * 0.4, hy - hr * 0.4], [hx + hr * 0.4 + W * 0.09, hy - hr * 1.7 - lift + sway * 0.5], [hx + hr * 0.4 + W * 0.16, hy - hr * 1.2 - lift + sway]], 1, 1);
  }
  const abd = c.begin('abdomen', pal.body); c.ellipse(bx - bl * 0.38, by, bl * 0.66, bh);
  c.decal(abd, pal.belly, () => c.ellipse(bx - bl * 0.38, by + bh * 0.95, bl * 0.6, bh * 0.45));
  c.begin('thorax', pal.body); c.ellipse(bx + bl * 0.32, by - bh * 0.05, bl * 0.46, bh * 0.92);
  if (F.has('shell') || F.has('wings')) {
    const shell = c.begin('wing_case', pal.accent); c.ellipse(bx - bl * 0.12, by - bh * 0.3, bl * 0.85, bh * 0.72);
    c.begin('wing_seam', pal.dark); c.line(bx - bl * 0.85, by - bh * 0.2, bx + bl * 0.55, by - bh * 0.62, 1);
    void shell;
  }
  if (F.has('glow_patch')) c.decal(abd, pal.glow, () => c.ellipse(bx - bl * 0.5, by + bh * 0.1, Math.max(1, bl * 0.2), Math.max(1, bh * 0.35)));
  if (F.has('spikes')) for (let i = 0; i < 3; i++) { const x = bx - bl * 0.6 + i * bl * 0.55; c.begin('spike', pal.accent); c.poly([[x - 1, by - bh * 0.85], [x, by - bh * 1.55 - 0.5], [x + 1, by - bh * 0.85]]); }
  c.begin('head', pal.body); c.ellipse(hx, hy, hr, hr * 0.9);
  const open = pose.jaw;
  if (F.has('mandibles') || open > 0.35) {
    c.begin('mandible', pal.accent); c.poly([[hx + hr * 0.6, hy + hr * 0.2], [hx + hr + 1.6 + open, hy + hr * 0.1 - open * 0.8], [hx + hr * 0.9, hy + hr * 0.7]]);
    c.poly([[hx + hr * 0.6, hy + hr * 0.7], [hx + hr + 1.6 + open, hy + hr * 0.9 + open * 0.9], [hx + hr * 0.9, hy + hr * 0.4]]);
  }
  eye(ctx, hx + hr * 0.3, hy - hr * 0.25);
  drawExtraEyes(ctx, { x: hx, y: hy, r: hr }, false);
  if (!tiny) drawLegs([...legs, ...extra].filter(l => !l.far));
}

export function insectFrontBack(ctx) {
  const { c, W, H, pal, P, pose, F, view } = ctx, front = view === 'front', fy = H - 1, lw = Math.max(1, rnd(H * 0.034 * P.legThickness));
  const bw = Math.max(3, W * 0.2 * P.bodyHeight), bh = H * 0.2 * P.bodyHeight, legLen = H * 0.22 * P.legLength, cx = W / 2;
  const by = fy - legLen * 0.8 - bh * 0.5 + pose.bob + (pose.ext > 0 ? 1 : 0), G = GAITS.tripod, footY = H - lw / 2;
  const dark = mat => stick(pal, mat === pal.far);
  const drawSide = () => {
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const near = s > 0, off = G[near ? 'near' : 'far'][i], f = footFor(ctx, 0, off, G.duty, 0, footY - (2 - i) * (H > 20 ? 1.5 : 1));
      const hy = by + (i - 1) * bh * 0.45 + bh * 0.2, hx = cx + s * bw * 0.7, ox = bw * 0.75 + 2.2 + i * 0.4 + (f.swing ? -1 : 0);
      drawLeg(ctx, { name: `leg_${near ? 'r' : 'l'}${i}`, hip: [hx, hy], foot: [cx + s * (bw + 1.5 + i * 0.6 + (f.swing ? -1 : 0)), f.y], l1: legLen * 0.8, l2: legLen * 0.9, hint: [s * 0.4, -1], w: lw, mat: dark(i === 1 ? pal.body : pal.far), paw: 'none' });
      void ox;
    }
  };
  drawSide();
  // abdomen/wing cases behind, taller than the head so the back of the body shows over it
  const abd = c.begin('abdomen', pal.far); c.ellipse(cx, by - bh * (front ? 0.55 : 0.1), bw * 0.9, bh * (front ? 0.95 : 1.15));
  if (!front) {
    const body = c.begin('wing_case', F.has('shell') || F.has('wings') ? pal.accent : pal.body); c.ellipse(cx, by - bh * 0.05, bw, bh * 1.1);
    c.begin('wing_seam', pal.dark); c.line(cx - 0.5, by - bh * 1.1, cx - 0.5, by + bh * 0.9, 1);
    if (F.has('glow_patch')) c.decal(body, pal.glow, () => c.ellipse(cx, by + bh * 0.4, Math.max(1, bw * 0.3), Math.max(1, bh * 0.3)));
    if (F.has('spikes')) for (const s of [-1, 0, 1]) { c.begin('spike', pal.accent); c.poly([[cx + s * bw * 0.55 - 1, by - bh * 0.9], [cx + s * bw * 0.55, by - bh * 1.6 - 0.5], [cx + s * bw * 0.55 + 1, by - bh * 0.9]]); }
    void abd;
    // cerci
    c.begin('cercus', pal.dark); c.line(cx - bw * 0.35, by + bh * 1.1, cx - bw * 0.45, by + bh * 1.6, 1); c.line(cx + bw * 0.35, by + bh * 1.1, cx + bw * 0.45, by + bh * 1.6, 1);
    return;
  }
  const hr = Math.max(1.8, H * 0.1 * P.headSize), hy = by + bh * 0.35 + (pose.ext > 0 ? 1 : 0) + pose.head * 0.5;
  const sway = pose.sway;
  c.begin('antenna', pal.dark);
  c.path([[cx - hr * 0.5, hy - hr * 0.7], [cx - hr - 1.5, hy - hr * 2 + sway * 0.5], [cx - hr - 3.5, hy - hr * 2.4 + sway]], 1, 1);
  c.path([[cx + hr * 0.5, hy - hr * 0.7], [cx + hr + 1, hy - hr * 2 - sway * 0.5], [cx + hr + 3, hy - hr * 2.4 - sway]], 1, 1);
  const body = c.begin('thorax', pal.body); c.ellipse(cx, by - bh * 0.1, bw * 0.95, bh);
  c.decal(body, pal.belly, () => c.ellipse(cx, by + bh * 0.75, bw * 0.6, bh * 0.4));
  c.begin('head', pal.body); c.ellipse(cx, hy, hr * 1.15, hr);
  const open = pose.jaw;
  c.begin('mandible', pal.accent);
  c.poly([[cx - hr * 0.7, hy + hr * 0.5], [cx - hr * 0.25 - open, hy + hr + 1.2], [cx - hr * 0.05, hy + hr * 0.5]]);
  c.poly([[cx + hr * 0.7, hy + hr * 0.5], [cx + hr * 0.25 + open, hy + hr + 1.2], [cx + hr * 0.05, hy + hr * 0.5]]);
  const ex = Math.max(1.4, hr * 0.62);
  eye(ctx, cx - ex, hy - hr * 0.25); eye(ctx, cx + ex - 1, hy - hr * 0.25);
  drawExtraEyes(ctx, { x: cx, y: hy, r: hr }, true);
}

export function insectDown(ctx) {
  const { c, W, H, pal, P, F } = ctx, fy = H - 1, lw = Math.max(1, rnd(H * 0.034 * P.legThickness));
  const bl = W * 0.3 * P.bodyLength, bh = H * 0.17 * P.bodyHeight, cx = W * 0.5 - 0.5, by = fy - bh * 0.95, hr = Math.max(1.6, H * 0.1 * P.headSize);
  const dark = { ...pal.dark };
  const abd = c.begin('abdomen', pal.body); c.ellipse(cx - bl * 0.38, by, bl * 0.66, bh);
  c.decal(abd, pal.belly, () => c.ellipse(cx - bl * 0.38, by - bh * 0.6, bl * 0.6, bh * 0.5));
  c.begin('thorax', pal.body); c.ellipse(cx + bl * 0.32, by, bl * 0.46, bh * 0.92);
  c.begin('head', pal.body); c.ellipse(cx + bl * 0.95, by + bh * 0.2, hr, hr * 0.9);
  eye(ctx, cx + bl * 0.95 + hr * 0.3, by + bh * 0.2 - hr * 0.2);
  // legs curled up over the belly
  const legLen = H * 0.24 * P.legLength;
  for (let i = 0; i < 3; i++) for (const s of [0, 1]) {
    const x = cx - bl * 0.3 + i * bl * 0.4 + s;
    c.begin(`leg_${i}_${s}`, dark); c.path([[x, by - bh * 0.5], [x + (i - 1) * 1.5 - 1, by - bh - legLen * 0.8], [x + (i - 1) * 2.5 + (s ? 2 : -1), by - bh - legLen * 0.5]], lw, 1);
  }
  void F;
}

// ---------------------------------------------------------------- arachnid

/** The metasoma: a chain of beads, curled up and over the back; `curl` straightens it for the strike. */
function tail(ctx, base, { segLen, theta0, curl, segs, width, front = true }) {
  const { c, pal } = ctx; let [x, y] = base; const pts = [[x, y]];
  c.begin('tail_base', pal.body);
  for (let i = 0; i < segs; i++) {
    const th = (theta0 + curl * i) * Math.PI / 180, nx = x + Math.cos(th) * segLen, ny = y + Math.sin(th) * segLen;
    const w = width * (1 - i / (segs + 1.5) * 0.55);
    c.begin(`tail_${i}`, i % 2 ? pal.far : pal.body); c.ellipse((x + nx) / 2, (y + ny) / 2, Math.max(1, w * 0.62) + (i === 0 ? 0.3 : 0), Math.max(1, w * 0.55));
    x = nx; y = ny; pts.push([x, y]);
  }
  const th = (theta0 + curl * segs) * Math.PI / 180;
  return { tip: [x, y], th, front };
}
function stinger(ctx, tip, th, size, glow) {
  const { c, pal } = ctx, ux = Math.cos(th), uy = Math.sin(th), nx = -uy, ny = ux;
  c.begin('stinger_bulb', pal.body); c.ellipse(tip[0] - ux * 0.3, tip[1] - uy * 0.3, size * 0.75, size * 0.75);
  c.begin('stinger', glow ? pal.glow : pal.accent);
  c.poly([[tip[0] + nx * size * 0.45, tip[1] + ny * size * 0.45], [tip[0] + ux * size * 1.9 - nx * size * 0.1, tip[1] + uy * size * 1.9 - ny * size * 0.1], [tip[0] - nx * size * 0.45, tip[1] - ny * size * 0.45]]);
}

function claw(ctx, shoulder, hand, size, open, { far = false } = {}) {
  const { c, pal } = ctx, mat = far ? pal.far : pal.body, fing = far ? pal.farAccent : pal.accent;
  c.begin(far ? 'arm_far' : 'arm', mat);
  c.path([shoulder, [(shoulder[0] + hand[0]) / 2, Math.min(shoulder[1], hand[1]) - size * 0.2], hand], Math.max(1.5, size * 0.75), Math.max(1.5, size * 0.9));
  c.begin(far ? 'palm_far' : 'palm', mat); c.ellipse(hand[0], hand[1], size * 1.05, size * 0.85);
  // two fingers with a dark gap: the lower one swings open for the pinch
  const [hx, hy] = hand, len = size * 1.75;
  c.begin(far ? 'finger_far' : 'finger_top', fing); c.poly([[hx + size * 0.2, hy - size * 0.85], [hx + len, hy - size * 0.35 - open], [hx + len - size * 0.2, hy - size * 0.05 - open * 0.3], [hx + size * 0.4, hy - size * 0.1]]);
  c.begin(far ? 'finger_far_low' : 'finger_bottom', fing); c.poly([[hx + size * 0.4, hy + size * 0.2], [hx + len - size * 0.2, hy + size * 0.35 + open * 0.2], [hx + len, hy + size * 0.8 + open], [hx + size * 0.2, hy + size * 0.85]]);
}

export function arachnidSide(ctx) {
  const { c, W, H, pal, P, pose, F } = ctx, fy = H - 1, lw = Math.max(1, rnd(H * 0.034 * P.legThickness));
  const bl = W * 0.24 * P.bodyLength, bh = H * 0.13 * P.bodyHeight, legLen = H * 0.27 * P.legLength;
  const cx = W * 0.5, bx = cx + pose.lunge * W * 0.05 + (pose.hurt ? -1 : 0), by = fy - legLen * 0.85 - bh * 0.35 + pose.bob;
  const ext = pose.ext, atk = pose.attack, size = Math.max(1.8, H * 0.1 * P.headSize);
  const legs = sideLegs(ctx, { count: 4, hipFrom: bx - bl * 0.45, hipTo: bx + bl * 0.55, hipY: by + bh * 0.4, spreadBase: 0, reach: bl * 0.45, w: lw, gait: GAITS.tetrapod, legLen, outward: 1.0 });
  const extra = F.has('extra_limbs') ? sideLegs(ctx, { count: 1, hipFrom: bx - bl * 0.5, hipTo: bx - bl * 0.5, hipY: by + bh * 0.4, spreadBase: -bl * 0.8, reach: 0, w: lw, gait: { duty: 0.5, far: [0.25], near: [0.75] }, legLen, outward: -0.8 }) : [];
  const legMat = l => stick(pal, l.far);
  for (const l of [...legs, ...extra].filter(l => l.far)) drawLeg(ctx, { ...l, mat: legMat(l) });
  // far claw, then body, then near claw so the claws read as a pair
  const reach = bl * 1.2 + (atk === 'pincer' ? ext * 2.5 : 0), headY = by + bh * 0.15;
  const open = atk === 'pincer' ? [1.4, 1.8, 0.4, 0][pose.attackFrame] ?? 0 : (pose.jaw > 0.35 ? 1 : 0);
  claw(ctx, [bx + bl * 0.7, headY - bh * 0.3], [bx + reach + size * 0.6, headY - bh * 0.7 - size * 0.5], size * 0.9, open, { far: true });
  // tail: curled forward over the back. The strike uncurls it toward the front.
  const striking = atk === 'stinger';
  const curl = striking ? [34, 22, 4, 26][pose.attackFrame] : 34 + pose.sway * 2, theta0 = striking ? [-125, -105, -75, -100][pose.attackFrame] : -112 + pose.sway * 2;
  const segLen = Math.max(1.8, bh * 0.95 * P.tailLength), segs = 5, tw = Math.max(2.2, bh * 1.35);
  const tl = tail(ctx, [bx - bl * 0.8, by - bh * 0.1], { segLen, theta0, curl, segs, width: tw });
  const body = c.begin('body', pal.body); c.ellipse(bx, by, bl, bh);
  c.ellipse(bx + bl * 0.78, by - bh * 0.25, bl * 0.24, bh * 0.7);
  c.decal(body, pal.belly, () => c.ellipse(bx, by + bh * 0.95, bl * 0.9, bh * 0.45));
  if (F.has('shell')) {
    c.decal(body, pal.accent, () => c.ellipse(bx - bl * 0.1, by - bh * 0.35, bl * 0.82, bh * 0.62));
    for (let i = 1; i < 4; i++) { const x = bx - bl * 0.85 + bl * 0.5 * i; c.decal(body, pal.dark, () => c.line(x, by - bh * 0.95, x - 0.4, by + bh * 0.1, 1)); }
  }
  if (F.has('spikes')) for (let i = 0; i < 3; i++) { const x = bx - bl * 0.35 + i * bl * 0.4; c.begin('spike', pal.accent); c.poly([[x - 1, by - bh * 0.95], [x, by - bh * 1.7 - 0.5], [x + 1, by - bh * 0.95]]); }
  if (F.has('glow_patch')) c.decal(body, pal.glow, () => c.ellipse(bx - bl * 0.2, by - bh * 0.05, Math.max(1, bl * 0.25), Math.max(1, bh * 0.3)));
  // eyes on the carapace front
  eye(ctx, bx + bl * 0.86, by - bh * 0.55); eye(ctx, bx + bl * 0.66, by - bh * 0.75);
  drawExtraEyes(ctx, { x: bx + bl * 0.75, y: by - bh * 0.1, r: Math.max(2, size) }, false);
  claw(ctx, [bx + bl * 0.8, headY + bh * 0.2], [bx + reach + size * 0.9, headY + bh * 0.3], size, open);
  stinger(ctx, tl.tip, tl.th, Math.max(1.2, size * 0.75), F.has('glow_patch'));
  for (const l of [...legs, ...extra].filter(l => !l.far)) drawLeg(ctx, { ...l, mat: legMat(l) });
}

export function arachnidFrontBack(ctx) {
  const { c, W, H, pal, P, pose, F, view } = ctx, front = view === 'front', fy = H - 1, lw = Math.max(1, rnd(H * 0.034 * P.legThickness));
  const bw = Math.max(3, W * 0.17 * P.bodyHeight), bh = H * 0.14 * P.bodyHeight, legLen = H * 0.24 * P.legLength, cx = W / 2 - 0.5;
  const by = fy - legLen * 0.8 - bh * 0.35 + pose.bob, size = Math.max(1.8, H * 0.1 * P.headSize), G = GAITS.tetrapod, footY = H - lw / 2;
  const atk = pose.attack, ext = pose.ext;
  const legMat = i => stick(pal, i % 2 === 1);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const near = s > 0, off = G[near ? 'near' : 'far'][i], f = footFor(ctx, 0, off, G.duty, 0, footY - (3 - i) * (H > 24 ? 1 : 0.7));
    const hy = by + (i - 1.5) * bh * 0.3 + bh * 0.3, spread = bw + 1.8 + i * 1.1 - (i === 0 && front ? 0 : 0) + (f.swing ? -1 : 0);
    drawLeg(ctx, { name: `leg_${near ? 'r' : 'l'}${i}`, hip: [cx + s * bw * 0.6, hy], foot: [cx + s * spread, f.y], l1: legLen * 0.7, l2: legLen * 0.8, hint: [s * 0.5, -1], w: lw, mat: legMat(i), paw: 'none' });
  }
  const open = atk === 'pincer' ? [1.4, 1.8, 0.4, 0][pose.attackFrame] ?? 0 : 0;
  // tail rising behind the body, stinger hooked over the top
  const striking = atk === 'stinger', sway = pose.sway * 0.4;
  const segs = 5, segLen = Math.max(1.6, bh * 0.85 * P.tailLength), tw = Math.max(2.2, bh * 1.35);
  let tx = cx, ty = by - bh * 0.3;
  const segsOut = [];
  for (let i = 0; i < segs; i++) {
    const lean = striking ? [0, 0.3, 0.8, 0.3][pose.attackFrame] * (front ? 1 : -1) : 0;
    const nx = tx + sway * (i / segs), ny = ty - segLen * (1 - (striking ? [0.1, 0.35, 0.6, 0.25][pose.attackFrame] * i / segs : 0)) * (front ? 0.95 : 1);
    segsOut.push([(tx + nx) / 2 + lean * i * 0.2, (ty + ny) / 2, tw * (1 - i / (segs + 1.5) * 0.5)]);
    tx = nx; ty = ny;
  }
  const tail = () => segsOut.forEach(([x, y, w], i) => { c.begin(`tail_${i}`, i % 2 ? pal.far : pal.body); c.ellipse(x, y, Math.max(1.2, w * 0.62), Math.max(1.2, segLen * 0.6)); });
  if (front) tail();
  const body = c.begin('body', pal.body); c.ellipse(cx, by, bw, bh);
  c.decal(body, pal.belly, () => c.ellipse(cx, by + bh * 0.9, bw * 0.55, bh * 0.4));
  if (F.has('shell')) { c.decal(body, pal.accent, () => c.ellipse(cx, by - bh * 0.35, bw * 0.85, bh * 0.6)); c.decal(body, pal.dark, () => c.line(cx - bw * 0.7, by - bh * 0.1, cx + bw * 0.7, by - bh * 0.1, 1)); }
  if (F.has('glow_patch')) c.decal(body, pal.glow, () => c.ellipse(cx, by - bh * 0.1, Math.max(1, bw * 0.25), Math.max(1, bh * 0.3)));
  if (F.has('spikes')) for (const s of [-1, 0, 1]) { c.begin('spike', pal.accent); c.poly([[cx + s * bw * 0.55 - 1, by - bh * 0.85], [cx + s * bw * 0.55, by - bh * 1.6 - 0.5], [cx + s * bw * 0.55 + 1, by - bh * 0.85]]); }
  if (!front) {
    tail();
    const [x, y] = [segsOut.at(-1)[0], segsOut.at(-1)[1] - segLen * 0.5];
    stinger(ctx, [x, y], -Math.PI / 2 + 0.2, Math.max(1.2, size * 0.75), F.has('glow_patch'));
    return;
  }
  // pincers spread to each side of the face
  const spreadX = bw + size * 0.6 + (atk === 'pincer' ? ext * 1.5 : 0), handY = by + bh * 0.2 + (atk === 'pincer' ? ext * 1 : 0);
  for (const s of [-1, 1]) {
    c.begin('arm', pal.body); c.path([[cx + s * bw * 0.5, by - bh * 0.1], [cx + s * (bw * 0.8 + 1), handY - size * 0.6], [cx + s * spreadX, handY]], Math.max(1.5, size * 0.7), Math.max(1.5, size * 0.8));
    c.begin('palm', pal.body); c.ellipse(cx + s * spreadX, handY, size * 0.95, size * 0.9);
    c.begin('finger', pal.accent); c.poly([[cx + s * (spreadX - size * 0.4), handY], [cx + s * (spreadX + size * 0.5 + open * s * 0), handY + size * 1.6], [cx + s * (spreadX + size * 0.9), handY + size * 0.2]]);
  }
  // stinger hook over the tip (seen from the front it curls toward the viewer)
  const top = segsOut.at(-1);
  stinger(ctx, [top[0], top[1] - 0.5], Math.PI / 2 - 0.3, Math.max(1.2, size * 0.75), F.has('glow_patch'));
  const ex = Math.max(1.4, bw * 0.3), ey = by - bh * 0.35;
  eye(ctx, cx - ex, ey); eye(ctx, cx + ex - 1, ey);
  drawExtraEyes(ctx, { x: cx, y: by - bh * 0.25, r: Math.max(2, size) }, true);
}

export function arachnidDown(ctx) {
  const { c, W, H, pal, P, F } = ctx, fy = H - 1, lw = Math.max(1, rnd(H * 0.034 * P.legThickness));
  const bl = W * 0.24 * P.bodyLength, bh = H * 0.13 * P.bodyHeight, cx = W * 0.56, by = fy - bh * 0.95, size = Math.max(1.6, H * 0.075 * P.headSize), legLen = H * 0.2 * P.legLength;
  // tail flopped to the rear
  c.begin('tail', pal.far); c.path([[cx - bl * 0.8, by], [cx - bl * 1.2, fy - 1.5], [cx - bl * 1.5, fy - 1.2]], Math.max(2, bh * 1.2), Math.max(1.2, bh * 0.6));
  c.begin('stinger', pal.accent); c.poly([[cx - bl * 1.5, fy - 2], [cx - bl * 2.0, fy - 1], [cx - bl * 1.5, fy - 0.3]]);
  const body = c.begin('body', pal.body); c.ellipse(cx, by, bl, bh);
  c.decal(body, pal.belly, () => c.ellipse(cx, by - bh * 0.55, bl * 0.9, bh * 0.5));
  for (let i = 0; i < 4; i++) for (const s of [0, 1]) {
    const x = cx - bl * 0.5 + i * bl * 0.35 + s;
    c.begin(`leg_${i}_${s}`, s ? pal.far : pal.body); c.path([[x, by - bh * 0.6], [x + (i - 1.5) * 1.4, by - bh - legLen * 0.7], [x + (i - 1.5) * 2.4 + (s ? 1 : -1), by - bh - legLen * 0.5]], lw, 1);
  }
  claw(ctx, [cx + bl * 0.7, by], [cx + bl + size * 1.2, fy - size * 0.9], size, 0.8);
  eye(ctx, cx + bl * 0.8, by - bh * 0.4);
  void F;
}
