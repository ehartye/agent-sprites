import { ik } from './creature-raster.js';
import { GAITS, foot, legPhase, liftFor } from './creature-motion.js';
import { eye } from './creature-parts.js';
import { drawExtraEyes, unit } from './creature-features.js';

// Heavy two-legged bodies: a hunched mutant brute, a boss-scale golem, a guard machine. One torso, two thick legs, two long
// arms and a small head, drawn from a handful of proportions so every pose of every view is derived, never hand placed.
// Attacks: `slam` (both fists up and down onto the ground), `sweep` (a flat swing), `blast` (an arm weapon fires).

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
/** One step darker than a material: how a far-side part reads. */
const dim = m => ({ ...m, hi: m.mid, mid: m.lo, lo: m.out });
/** 0 at the wind-up, 1 at the impact; recover falls back toward 0.6. */
const strike = pose => clamp((pose.ext + 0.7) / 1.7, 0, 1);

export const BIPED_HEADS = {
  brute: { w: 1, h: 0.9 },
  helm: { w: 1.05, h: 0.95 },
};

/** Dimensions shared by the three views. */
function sizes(ctx) {
  const { H, W, P, opts } = ctx;
  const helm = opts.head === 'helm';
  const legLen = H * 0.33 * P.legLength;
  const torsoH = H * 0.37 * P.bodyHeight;
  const r = Math.max(3, H * (helm ? 0.1 : 0.09) * P.headSize);
  return {
    legLen, torsoH, r,
    legW: Math.max(3, H * 0.125 * P.legThickness),
    armW: Math.max(3, H * 0.105 * P.legThickness),
    torsoD: Math.max(6, H * 0.27 * P.bodyLength),
    shoulderW: Math.min(W * 0.7, H * 0.55 * P.bodyLength),
    armLen: H * 0.44 * P.legLength,
    helm, hasHump: ctx.F.has('hump'), legMat: pal => (helm ? pal.metal : pal.cloth),
    fy: H - 1,
  };
}

/** A two-bone limb: IK from `from` to `to`, bowing toward `hint`, tapering from w0 to w1. */
function limb(ctx, name, from, to, l1, l2, hint, w0, w1, mat) {
  const pts = ik(from, to, l1, l2, hint);
  ctx.c.begin(name, mat);
  ctx.c.path(pts, w0, w1);
  return pts;
}

function hand(ctx, name, [x, y], w, big = 1) {
  const { c, pal, opts, F } = ctx, mat = opts.head === 'helm' ? pal.metal : pal.body;
  const rr = Math.max(1.6, w * 0.62 * big);
  c.begin(name, mat); c.ellipse(x, y, rr, rr * 0.92);
  if (opts.paw === 'claw') {
    c.begin(`${name}_claw`, pal.accent);
    for (const dx of [-0.55, 0, 0.55]) c.poly([[x + dx * rr - 0.8, y + rr * 0.6], [x + dx * rr + 0.2, y + rr * 1.5 + 1], [x + dx * rr + 1, y + rr * 0.6]]);
  }
  void F;
}

/** Spikes along a back line (side view), a shell of plates, glow sores: features on the torso. */
function torsoFeatures(ctx, host, a) {
  const { c, pal, F } = ctx, { x, y, rx, ry, side } = a;
  if (F.has('shell')) {
    c.decal(host, pal.metal, () => c.ellipse(x + (side ? rx * 0.15 : 0), y - ry * 0.15, rx * 0.7, ry * 0.5));
    for (const k of [-0.25, 0.25]) c.decal(host, pal.dark, () => c.line(x + (side ? rx * 0.15 : 0) - rx * 0.6, y - ry * 0.15 + ry * k * 1.4, x + (side ? rx * 0.15 : 0) + rx * 0.6, y - ry * 0.15 + ry * k * 1.4, 1));
  }
  if (F.has('glow_patch')) {
    const blot = (i, dx, dy, w, h) => c.decal(host, pal.glow, () => c.ellipse(x + dx * rx, y + dy * ry, Math.max(1.1, w * rx), Math.max(1.1, h * ry)));
    blot(0, side ? 0.15 : -0.2, -0.1, 0.2, 0.22); blot(1, side ? -0.35 : 0.3, 0.3, 0.12, 0.14); blot(2, side ? 0.45 : -0.45, 0.55, 0.1, 0.1);
  }
  if (F.has('core')) {
    c.decal(host, pal.dark, () => c.ellipse(x + (side ? rx * 0.25 : 0), y - ry * 0.05, Math.max(2.2, rx * 0.3), Math.max(2.2, rx * 0.3)));
    c.decal(host, pal.glow, () => c.ellipse(x + (side ? rx * 0.25 : 0), y - ry * 0.05, Math.max(1.4, rx * 0.2), Math.max(1.4, rx * 0.2)));
    c.dot(x + (side ? rx * 0.25 : 0) - 0.5, y - ry * 0.05 - 0.5, pal.glowHot);
  }
}

function pauldron(ctx, x, y, r, side) {
  const { c, pal, F } = ctx; if (!F.has('pauldrons')) return;
  c.begin('pauldron', pal.metal); c.ellipse(x, y, r * 1.15, r * 0.8);
  c.begin('pauldron_rim', pal.accent); c.line(x - r, y + r * 0.4, x + r, y + r * 0.4, 1);
  if (F.has('spikes')) { c.begin('pauldron_spike', pal.accent); c.poly([[x - 1.8, y - r * 0.5], [x + (side ? 0.5 : 0), y - r * 1.5], [x + 1.8, y - r * 0.5]]); }
}

/** Brute head in profile (facing right), or a helm. Returns anchors. */
function headSide(ctx, hx, hy, r, jaw) {
  const { c, pal, F, pose, opts } = ctx;
  if (opts.head === 'helm') {
    if (F.has('antennae')) { c.begin('mast', pal.metal); c.line(hx - r * 0.2, hy - r * 0.8, hx - r * 0.4, hy - r * 2.1, 1); c.begin('mast_tip', pal.glow); c.dot(hx - r * 0.4, hy - r * 2.2, pal.glowHot); }
    c.begin('helm', pal.metal); c.ellipse(hx, hy - r * 0.1, r, r * 0.95);
    c.rect(Math.round(hx - r * 0.7), Math.round(hy), Math.round(r * 1.7), Math.round(r * 0.8));
    // the visor: a lit slit across the front of the face
    c.begin('visor_frame', pal.dark); c.rect(Math.round(hx + r * 0.05), Math.round(hy - r * 0.35), Math.round(r * 1.1), Math.max(2, Math.round(r * 0.5)));
    c.begin('visor', F.has('glow_eyes') ? pal.glowEye : pal.dark); c.rect(Math.round(hx + r * 0.2), Math.round(hy - r * 0.25), Math.max(2, Math.round(r * 0.9)), Math.max(1, Math.round(r * 0.28)));
    if (pose.hurt) c.dot(hx + r * 0.3, hy - r * 0.1, pal.dark);
    return { x: hx, y: hy, r, tip: [hx + r, hy + r * 0.2] };
  }
  // brute: a low skull, a heavy brow, an underbite with tusks
  c.begin('head', pal.body); c.ellipse(hx, hy - r * 0.1, r, r * 0.9);
  const jx = hx + r * 0.55, jy = hy + r * 0.62 + jaw * r * 0.35;
  if (jaw > 0.35) { c.begin('mouth', pal.dark); c.ellipse(jx, hy + r * 0.45, r * 0.62, r * 0.35 + jaw * 0.5); }
  c.begin('jaw', pal.body); c.ellipse(jx, jy, r * 0.78, r * 0.5);
  c.begin('brow', pal.far); c.poly([[hx - r * 0.1, hy - r * 0.55], [hx + r * 1.05, hy - r * 0.35], [hx + r * 0.95, hy - r * 0.05], [hx - r * 0.1, hy - r * 0.2]]);
  if (F.has('tusks')) { c.begin('tusk', pal.accent); for (const dx of [0.45, 1.05]) c.poly([[hx + r * dx - 0.9, jy - r * 0.05], [hx + r * dx + (dx > 0.8 ? 0.6 : 0), jy - r * 1.05], [hx + r * dx + 0.9, jy - r * 0.05]]); }
  if (F.has('horns')) { c.begin('horn', pal.accent); c.path([[hx - r * 0.1, hy - r * 0.8], [hx - r * 0.55, hy - r * 1.5], [hx - r * 0.1, hy - r * 2.1]], Math.max(1.3, r * 0.45), 1); }
  eye(ctx, hx + r * 0.62, hy - r * 0.18); drawExtraEyes(ctx, { x: hx, y: hy, r }, false);
  return { x: hx, y: hy, r, tip: [hx + r * 1.2, jy] };
}

/** Where a hand goes for the current pose, relative to a shoulder at (sx, sy). Right-facing profile. */
function handTarget(ctx, s, sx, sy, which, restDx, back = false) {
  const { H, pose } = ctx, kind = pose.attack, t = strike(pose), L = s.armLen, far = which === 'far' ? 1 : 0;
  if (pose.anim === 'attack' && kind) {
    if (kind === 'slam') return [lerp(sx + H * 0.06, sx + H * 0.33, t * t) + far * -2, lerp(sy - H * 0.27, s.fy - s.armW * 0.5, t * t)];
    if (kind === 'sweep') return [lerp(sx - H * 0.32, sx + H * 0.46, t) + far * -2, lerp(sy + H * 0.14, sy + H * 0.22, t) + (t > 0.9 ? 0 : -4 * Math.sin(t * Math.PI))];
    if (kind === 'blast') return which === 'near'
      ? [sx + H * lerp(0.18, 0.42, clamp((pose.ext + 0.7) / 1.7, 0, 1)), sy + H * 0.1]
      : [sx + H * 0.06 + restDx, sy + L * 0.82];
  }
  if (pose.down) return [sx, sy];
  return [sx + H * 0.13 + restDx + (back ? -1 : 0), sy + L * (pose.hurt ? 0.7 : 0.88)];
}

export function bipedSide(ctx) {
  const { c, W, H, pal, pose, F } = ctx, s = sizes(ctx), { fy, legLen, torsoH, torsoD, r, legW, armW } = s;
  const G = GAITS.biped, planted = !pose.stepping;
  const lean = H * (s.helm ? 0.03 : 0.075) + (pose.ext > 0 ? pose.ext * H * 0.07 : pose.ext * H * 0.06) * (pose.attack ? 1 : 0) + (pose.hurt ? -H * 0.04 : 0);
  const hipX = W / 2 - lean * 0.45 + (pose.hurt ? -1 : 0), hipY = fy - legLen + pose.bob + Math.max(0, pose.ext) * H * 0.025;
  const shX = hipX + lean, shY = hipY - torsoH;
  const stride = torsoD * 1.25;
  // legs (far first)
  const hint = [1, 0], footY = fy - 0.5, tl = legLen * 0.52, sl = legLen * 0.56;
  const leg = (name, hx, off, mat, accent) => {
    const f = foot(legPhase(pose.frame, off), G.duty, stride, liftFor(H));
    const fx = planted ? hx + (name.includes('far') ? -1 : 1) : hx + f.dx, fyy = planted ? footY : footY - (f.lift ?? 0);
    limb(ctx, name, [hx, hipY + 1], [fx, fyy], tl, sl, hint, legW, legW * 0.85, mat);
    c.begin(`${name}_foot`, accent); c.rect(Math.round(fx - legW * 0.45), Math.round(fyy - 1.5), Math.round(legW * 1.4), 3);
  };
  // far arm
  const armHint = pose.attack === 'slam' && pose.ext < 0 ? [-1, 0] : [-1, 0.3];
  const swing = off => (pose.stepping ? -foot(legPhase(pose.frame, off), G.duty, stride * 0.9, 0).dx * 0.6 : 0);
  const farHand = handTarget(ctx, s, shX - 1.5, shY + armW * 0.6, 'far', swing(G.near));
  limb(ctx, 'arm_far', [shX - 1.5, shY + armW * 0.6], farHand, s.armLen * 0.5, s.armLen * 0.55, armHint, armW * 0.95, armW * 0.8, pal.far);
  hand(ctx, 'fist_far', farHand, armW * 0.95);
  leg('leg_far', hipX + 1.5, G.far, dim(s.legMat(pal)), pal.dark);
  // spikes and hump sit behind the torso
  if (s.hasHump) { c.begin('hump', pal.body); c.ellipse(shX - torsoD * 0.5, shY + torsoH * 0.12, torsoD * 0.62, torsoH * 0.36); }
  const body = c.begin('body', pal.body);
  c.line(hipX, hipY - 1, shX, shY + torsoH * 0.12, torsoD * 0.82, torsoD * 1.12);
  c.ellipse(shX + torsoD * 0.08, shY + torsoH * 0.28, torsoD * 0.6, torsoH * 0.32);
  c.decal(body, pal.belly, () => c.ellipse(lerp(hipX, shX, 0.45) + torsoD * 0.3, lerp(hipY, shY, 0.45), torsoD * 0.3, torsoH * 0.28));
  torsoFeatures(ctx, body, { x: lerp(hipX, shX, 0.55), y: lerp(hipY, shY, 0.55), rx: torsoD * 0.55, ry: torsoH * 0.5, side: true });
  if (F.has('spikes')) {
    const n = 4, sz = Math.max(2, torsoD * 0.3);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), px = lerp(shX - torsoD * (s.hasHump ? 0.95 : 0.42), hipX - torsoD * 0.45, t), py = lerp(shY - torsoH * 0.05, hipY - torsoH * 0.22, t);
      c.begin('spike', pal.accent); c.poly([[px - 1.2, py + 1.5], [px - sz * 0.9, py - sz * 0.35 - 1], [px + 1.2, py - 0.5]]);
    }
  }
  // belt/loincloth
  c.begin('loin', s.helm ? pal.metal : pal.cloth); c.rect(Math.round(hipX - torsoD * 0.45), Math.round(hipY - 1), Math.round(torsoD * 0.95), 3);
  // head, small and low between the shoulders
  const jaw = pose.jaw, headLunge = pose.ext > 0 ? pose.ext * 2 : pose.ext * 1.5;
  const hx = shX + r * 0.95 + headLunge, hy = shY - r * 1.0 + pose.head * 0.5 + (pose.hurt ? -r * 0.35 : 0);
  c.begin('neck', pal.far); if (!s.helm) c.line(shX - 1, shY + 2, hx - r * 0.2, hy + r * 0.3, Math.max(3, r * 1.4)); else { c.begin('neck', pal.far); c.rect(Math.round(hx - r * 0.5), Math.round(hy + r * 0.6), Math.round(r), 3); }
  headSide(ctx, hx, hy, r, jaw);
  pauldron(ctx, shX - 0.5, shY + armW * 0.45, armW * 0.75, true);
  leg('leg_near', hipX - 1.5, G.near, s.legMat(pal), pal.dark);
  // near arm over the body
  const nearHand = handTarget(ctx, s, shX + 1, shY + armW * 0.6, 'near', swing(G.far));
  const arm = limb(ctx, 'arm_near', [shX + 1, shY + armW * 0.6], nearHand, s.armLen * 0.5, s.armLen * 0.55, armHint, armW, armW * 0.85, s.helm ? pal.metal : pal.body);
  void arm;
  hand(ctx, 'fist_near', nearHand, armW, 1.05);
  if (F.has('cannon') && pose.attack !== 'slam' && pose.attack !== 'sweep') {
    const [bx, by] = nearHand;
    c.begin('cannon', pal.dark); c.rect(Math.round(bx), Math.round(by - armW * 0.35), Math.max(4, Math.round(armW * 1.6)), Math.max(2, Math.round(armW * 0.7)));
    c.begin('cannon_rim', pal.metal); c.rect(Math.round(bx + armW * 1.1), Math.round(by - armW * 0.45), 2, Math.max(3, Math.round(armW * 0.9)));
    if (pose.attack === 'blast' && pose.frame >= 1 && pose.frame <= 2) { c.begin('flash', pal.glowHot); c.ellipse(bx + armW * 2.2, by, 2.2 + pose.frame, 1.6 + pose.frame * 0.4); }
  }
  void W;
}

export function bipedFrontBack(ctx) {
  const { c, W, H, pal, pose, F, view } = ctx, front = view === 'front', s = sizes(ctx), { fy, legLen, torsoH, r, legW, armW, shoulderW } = s;
  const G = GAITS.biped, cx = W / 2 - 0.5;
  const hipY = fy - legLen + pose.bob + Math.max(0, pose.ext) * H * 0.025, shY = hipY - torsoH + (pose.ext > 0 ? pose.ext * H * 0.015 : 0);
  const sw = shoulderW, ww = sw * 0.66, hipSpread = ww * 0.32;
  const stepLift = i => (pose.stepping ? foot(legPhase(pose.frame, i ? G.near : G.far), G.duty, 0, liftFor(H)).lift : 0);
  // legs
  for (const [i, sgn] of [[0, -1], [1, 1]]) {
    const x = cx + sgn * hipSpread, fyy = fy - 0.5 - stepLift(i), mat = i ? s.legMat(pal) : dim(s.legMat(pal)), acc = pal.dark;
    ctx.c.begin(`leg_${i}`, mat); ctx.c.path([[x, hipY], [x + sgn * 0.8, fyy - legLen * 0.3], [x + sgn * 0.5, fyy]], legW, legW * 0.88);
    c.begin(`leg_${i}_foot`, acc); c.rect(Math.round(x - legW * 0.75 + (sgn > 0 ? 1 : 0)), Math.round(fyy - 1.5), Math.round(legW * 1.5), 3);
  }
  // far arms first when they hang behind the torso, near arms after
  const slam = pose.attack === 'slam', sweep = pose.attack === 'sweep', blast = pose.attack === 'blast', t = strike(pose);
  const armTargets = sgn => {
    const sx = cx + sgn * (sw / 2 + armW * 0.1), sy = shY + armW * 0.7;
    let hx = sx + sgn * armW * 0.45, hy = sy + s.armLen * 0.88;
    if (pose.anim === 'attack' && slam) { hx = sx + sgn * lerp(armW * 0.2, -sw * 0.1, t * t); hy = lerp(sy - H * 0.25, fy - armW * 0.2, t * t); }
    else if (pose.anim === 'attack' && sweep) { hx = sx + sgn * lerp(sw * 0.5, -sw * 0.3, t); hy = sy + s.armLen * 0.6; }
    else if (pose.anim === 'attack' && blast) { hx = sx + sgn * armW * 0.2; hy = sgn > 0 ? lerp(sy + s.armLen * 0.5, sy + s.armLen * 0.35, t) : sy + s.armLen * 0.88; }
    else if (pose.stepping) hy += (sgn > 0 ? 1 : -1) * (pose.frame % 2 ? -2 : 2) * (pose.frame < 2 ? 1 : -1);
    if (pose.hurt) hy -= H * 0.05;
    return { sx, sy, hx, hy };
  };
  const arm = (sgn, mat) => {
    const a = armTargets(sgn);
    const dd = Math.hypot(a.hx - a.sx, a.hy - a.sy); limb(ctx, `arm_${sgn}`, [a.sx, a.sy], [a.hx, a.hy], dd * 0.54, dd * 0.54, [sgn, 0.1], armW, armW * 0.85, mat);
    hand(ctx, `fist_${sgn}`, [a.hx, a.hy], armW, slam && t > 0.8 ? 1.15 : 1);
    if (F.has('cannon') && sgn > 0 && !slam) {
      c.begin('cannon', pal.dark); c.rect(Math.round(a.hx - armW * 0.35), Math.round(a.hy), Math.max(2, Math.round(armW * 0.7)), Math.max(3, Math.round(armW * 1.2)));
      if (blast && pose.frame >= 1 && pose.frame <= 2) { c.begin('flash', pal.glowHot); c.ellipse(a.hx, a.hy + armW * 1.6, 2 + pose.frame, 2 + pose.frame); }
    }
  };
  arm(-1, s.helm ? dim(pal.metal) : pal.far);
  // torso: a trapezoid, wide across the shoulders
  if (s.hasHump) { c.begin('hump', pal.body); c.ellipse(cx, shY - torsoH * 0.02, sw * 0.4, torsoH * 0.28); }
  const body = c.begin('body', pal.body);
  c.poly([[cx - sw / 2, shY + 1], [cx + sw / 2, shY + 1], [cx + ww / 2 + 1, hipY], [cx - ww / 2 - 1, hipY]]);
  c.ellipse(cx, shY + torsoH * 0.22, sw * 0.5, torsoH * 0.3);
  if (front) c.decal(body, pal.belly, () => c.ellipse(cx, lerp(shY, hipY, 0.62), ww * 0.34, torsoH * 0.28));
  torsoFeatures(ctx, body, { x: cx, y: lerp(shY, hipY, 0.38), rx: sw * 0.5, ry: torsoH * 0.55, side: false });
  if (front) { c.begin('belt', s.helm ? pal.metal : pal.cloth); c.rect(Math.round(cx - ww / 2 - 1), Math.round(hipY - 2), Math.round(ww + 2), 3); }
  else { c.begin('belt', s.helm ? pal.metal : pal.cloth); c.rect(Math.round(cx - ww / 2 - 1), Math.round(hipY - 2), Math.round(ww + 2), 3); }
  if (F.has('spikes')) for (const k of back(front) ? [-0.28, 0, 0.28] : [-0.38, 0.38]) { c.begin('spike', pal.accent); const px = cx + k * sw, py = shY + (k ? 1.5 : -1); c.poly([[px - 1.3, py + 2], [px + (k > 0 ? 0.5 : -0.5), py - Math.max(2.5, sw * 0.14)], [px + 1.3, py + 2]]); }
  // head
  const hy = shY - r * 0.95 + pose.head * 0.5 + (pose.ext > 0 ? pose.ext * 1.2 : 0) + (pose.hurt ? -r * 0.3 : 0);
  if (s.helm) {
    if (F.has('antennae')) { c.begin('mast', pal.metal); c.line(cx + r * 0.6, hy - r * 0.8, cx + r * 0.8, hy - r * 2.1, 1); c.dot(cx + r * 0.8, hy - r * 2.2, pal.glowHot); }
    c.begin('helm', pal.metal); c.ellipse(cx, hy - r * 0.1, r * 1.05, r * 0.95); c.rect(Math.round(cx - r * 0.85), Math.round(hy), Math.round(r * 1.7), Math.round(r * 0.8));
    if (front) {
      c.begin('visor_frame', pal.dark); c.rect(Math.round(cx - r * 0.8), Math.round(hy - r * 0.35), Math.round(r * 1.6), Math.max(2, Math.round(r * 0.5)));
      c.begin('visor', F.has('glow_eyes') ? pal.glowEye : pal.dark); c.rect(Math.round(cx - r * 0.65), Math.round(hy - r * 0.25), Math.max(2, Math.round(r * 1.3)), Math.max(1, Math.round(r * 0.28)));
    }
  } else {
    if (F.has('horns')) for (const sg of [-1, 1]) { c.begin('horn', pal.accent); c.path([[cx + sg * r * 0.7, hy - r * 0.6], [cx + sg * r * 1.35, hy - r * 1.1], [cx + sg * r * 1.2, hy - r * 1.9]], Math.max(1.3, r * 0.45), 1); }
    c.begin('head', pal.body); c.ellipse(cx, hy, r * 1.05, r * 0.92);
    if (front) {
      c.begin('brow', pal.far); c.rect(Math.round(cx - r * 0.95), Math.round(hy - r * 0.5), Math.round(r * 1.9), Math.max(2, Math.round(r * 0.32)));
      if (pose.jaw > 0.35) { c.begin('mouth', pal.dark); c.ellipse(cx, hy + r * 0.45, r * 0.55, r * 0.28 + pose.jaw * 0.6); }
      c.begin('jaw', pal.body); c.ellipse(cx, hy + r * 0.65, r * 0.7, r * 0.34);
      if (F.has('tusks')) { c.begin('tusk', pal.accent); for (const sg of [-1, 1]) c.poly([[cx + sg * r * 0.5 - 0.9, hy + r * 0.7], [cx + sg * r * 0.55, hy + r * 0.05], [cx + sg * r * 0.5 + 0.9, hy + r * 0.7]]); }
      const ex = Math.max(1.6, r * 0.5); eye(ctx, cx - ex, hy - r * 0.15); eye(ctx, cx + ex - 1, hy - r * 0.15); drawExtraEyes(ctx, { x: cx, y: hy, r }, true);
    }
  }
  pauldronPair(ctx, cx, shY, sw, armW);
  arm(1, s.helm ? pal.metal : pal.body);
}
const back = front => !front;

function pauldronPair(ctx, cx, shY, sw, armW) {
  const { F } = ctx; if (!F.has('pauldrons')) return;
  for (const sg of [-1, 1]) pauldron(ctx, cx + sg * (sw / 2 - armW * 0.05), shY + armW * 0.5, armW * 0.75, sg > 0);
}

/** Flat on its back, head to the right, legs bent up, arms flung out. Everything scales from the cell so it fits any size. */
export function bipedDown(ctx) {
  const { c, W, H, pal } = ctx, s = sizes(ctx), fy = H - 1;
  const len = Math.min(s.torsoH * 1.05, W * 0.28), th = Math.min(s.torsoD * 0.9, H * 0.32), r = Math.min(s.r, W * 0.09);
  const legW = Math.min(s.legW, H * 0.15), armW = Math.min(s.armW, H * 0.13), legL = Math.min(s.legLen * 0.6, W * 0.2), armL = Math.min(s.armLen * 0.5, W * 0.17);
  const cx = W * 0.4, by = fy - th * 0.5;
  const body = c.begin('body', pal.body); c.line(cx - len * 0.45, by, cx + len * 0.5, by - 0.5, th * 0.9, th);
  c.decal(body, pal.belly, () => c.ellipse(cx, by - th * 0.2, len * 0.4, th * 0.28));
  torsoFeatures(ctx, body, { x: cx, y: by - 1, rx: len * 0.5, ry: th * 0.5, side: false });
  c.begin('loin', s.helm ? pal.metal : pal.cloth); c.rect(Math.round(cx - len * 0.5), Math.round(by - th * 0.45), 3, Math.max(2, Math.round(th * 0.9)));
  for (const [i, o] of [[0, 0], [1, 2]]) {
    const hx = cx - len * 0.5 - 1, hy = by + (i ? 1 : -1), kx = hx - legL * 0.3 - o * 0.4, ky = hy - legL * 0.8 + o, fx = kx - legL * 0.55 - o, fyy = fy - 1;
    c.begin(`leg_${i}`, i ? s.legMat(pal) : dim(s.legMat(pal))); c.path([[hx, hy], [kx, ky], [fx, fyy]], legW, legW * 0.85);
  }
  c.begin('arm_up', dim(pal.body)); c.path([[cx + len * 0.3, by - th * 0.35], [cx + len * 0.12, by - th * 0.95], [cx - len * 0.1, by - th * 0.55]], armW, armW * 0.85);
  c.begin('arm_down', pal.body); c.path([[cx + len * 0.2, by + 1], [cx + len * 0.3 + armL * 0.2, fy - armW * 0.6], [cx + len * 0.35 + armL * 0.8, fy - armW * 0.4]], armW, armW * 0.85);
  const hx = cx + len * 0.5 + r * 0.9, hy = fy - r * 0.9;
  if (s.helm) headSideDown(ctx, hx, hy, r); else headSide(ctx, hx, hy, r, 0.6);
}
function headSideDown(ctx, hx, hy, r) {
  const { c, pal } = ctx;
  c.begin('helm', pal.metal); c.ellipse(hx, hy - r * 0.1, r, r * 0.95); c.rect(Math.round(hx - r * 0.7), Math.round(hy), Math.round(r * 1.7), Math.round(r * 0.8));
  c.begin('visor_frame', pal.dark); c.rect(Math.round(hx + r * 0.05), Math.round(hy - r * 0.35), Math.round(r * 1.1), Math.max(2, Math.round(r * 0.5)));
  c.begin('visor', pal.dark); c.rect(Math.round(hx + r * 0.2), Math.round(hy - r * 0.25), 2, 1);
  void unit;
}
