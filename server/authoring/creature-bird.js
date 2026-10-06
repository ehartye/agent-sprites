import { drawLeg, footFor, eye } from './creature-parts.js';
import { GAITS } from './creature-motion.js';
import { drawExtraEyes, unit } from './creature-features.js';

const rnd = Math.round;
const thin = (ctx, mat) => ({ ...mat, flat: true, hi: mat.mid, lo: mat.mid, out: mat.out });

/** Patchy scrap-metal feathers: a few plates of the metal ramp on the wing and tail. */
function metalPatches(ctx, host, cx, cy, rx, ry) {
  const { c, pal, F } = ctx; if (!F.has('metal_feathers')) return;
  const n = F.get('metal_feathers').count ?? 3;
  for (let i = 0; i < n; i++) c.decal(host, pal.metal, () => c.ellipse(cx + (unit(i + 3, 5) - 0.5) * rx * 1.5, cy + (unit(i + 7, 2) - 0.5) * ry * 1.2, Math.max(1, rx * 0.22), Math.max(1, ry * 0.3)));
}

export function birdSide(ctx) {
  const { c, W, H, pal, P, pose, F } = ctx, fy = H - 1, lw = 1;
  const bl = W * 0.26 * P.bodyLength, bh = H * 0.21 * P.bodyHeight, legLen = H * 0.24 * P.legLength, r = Math.max(1.6, H * 0.095 * P.headSize);
  const cx = W * 0.5 - 0.5, bx = cx + pose.lunge * W * 0.06 + (pose.hurt ? -1 : 0), by = fy - legLen - bh * 0.55 + pose.bob;
  const footY = fy - 0.5, G = GAITS.biped, planted = !pose.stepping;
  const hipY = by + bh * 0.7, l1 = legLen * 0.55, l2 = legLen * 0.6, stride = bl * 0.9;
  const legs = [['leg_far', bx + 0.5, G.far, pal.far, pal.farAccent], ['leg_near', bx - 0.5, G.near, pal.body, pal.accent]];
  for (const [name, hx, off, mat, acc] of legs) {
    const f = footFor(ctx, hx, off, G.duty, stride, footY), fx = planted ? hx - 0.5 : f.x;
    drawLeg(ctx, { name, hip: [hx, hipY], foot: [fx, f.y], l1, l2, hint: [-1, 0], w: lw, mat: thin(ctx, acc), paw: 'none' });
    ctx.c.begin(`${name}_toes`, thin(ctx, acc)); ctx.c.line(fx - 0.4, f.y + 0.3, fx + 1.8, f.y + 0.3, 1);
    ctx.c.begin(`${name}_toe_back`, thin(ctx, acc)); ctx.c.dot(fx - 1, f.y - 0.2, thin(ctx, acc));
  }
  // tail feathers fan up behind
  const sway = pose.sway * 0.5, tl = Math.max(2.5, bl * 0.8);
  c.begin('tail_far', pal.far); c.poly([[bx - bl * 0.7, by - bh * 0.2], [bx - bl - tl * 0.4, by - bh * 1.4 - sway], [bx - bl * 0.3, by - bh * 0.7]]);
  const tail = c.begin('tail', pal.body); c.poly([[bx - bl * 0.75, by + bh * 0.1], [bx - bl - tl * 0.7, by - bh * 0.9 + sway], [bx - bl * 0.8, by - bh * 0.3]]);
  c.poly([[bx - bl * 0.7, by - bh * 0.1], [bx - bl - tl * 0.1, by - bh * 1.35 - sway], [bx - bl * 0.45, by - bh * 0.55]]);
  metalPatches(ctx, tail, bx - bl, by - bh * 0.7, tl, bh);
  const body = c.begin('body', pal.body); c.ellipse(bx, by, bl, bh);
  c.decal(body, pal.belly, () => c.ellipse(bx + bl * 0.15, by + bh * 0.7, bl * 0.85, bh * 0.5));
  // head on a short neck; the peck dips it to the ground
  const peck = pose.attack === 'peck' || pose.attack === 'bite' || pose.attack === 'charge' ? pose.ext : 0;
  const hx = bx + bl * 0.75 + pose.sway * 0.8 * (pose.stepping ? 1 : 0) + (peck > 0 ? peck * 2 : peck * 0.5), hy = by - bh * 1.2 + pose.head * 0.5 + (peck > 0 ? peck * bh * 1.5 : peck * 1.5) + (pose.hurt ? -1 : 0);
  c.line(bx + bl * 0.5, by - bh * 0.3, hx, hy + r * 0.2, Math.max(1.8, r * 1.1));
  if (F.has('comb')) { c.begin('comb', pal.cloth); c.poly([[hx - r * 0.6, hy - r * 0.6], [hx - r * 0.1, hy - r * 1.7], [hx + r * 0.3, hy - r * 0.9], [hx + r * 0.7, hy - r * 1.5], [hx + r * 0.8, hy - r * 0.5]]); }
  c.begin('head', pal.body); c.ellipse(hx, hy, r, r * 0.95);
  const open = pose.jaw;
  c.begin('beak', pal.accent); c.poly([[hx + r * 0.7, hy - r * 0.35 - open * 0.3], [hx + r + 1.6, hy + r * 0.1 - open * 0.3], [hx + r * 0.7, hy + r * 0.3]]);
  if (open > 0.35) { c.begin('beak_low', pal.farAccent); c.poly([[hx + r * 0.6, hy + r * 0.3], [hx + r + 1.3, hy + r * 0.5 + open * 0.9], [hx + r * 0.6, hy + r * 0.8]]); }
  if (F.has('comb')) { c.begin('wattle', pal.cloth); c.ellipse(hx + r * 0.55, hy + r * 0.95, Math.max(0.8, r * 0.3), Math.max(1, r * 0.5)); }
  eye(ctx, hx + r * 0.35, hy - r * 0.2);
  drawExtraEyes(ctx, { x: hx, y: hy, r }, false);
  // folded wing over the flank
  const wing = c.begin('wing', pal.far); c.ellipse(bx - bl * 0.12, by - bh * 0.05, bl * 0.58, bh * 0.58);
  c.decal(wing, pal.body, () => c.ellipse(bx - bl * 0.22, by - bh * 0.2, bl * 0.4, bh * 0.28));
  metalPatches(ctx, wing, bx - bl * 0.12, by - bh * 0.05, bl * 0.58, bh * 0.58);
  if (F.has('glow_patch')) c.decal(body, pal.glow, () => c.ellipse(bx + bl * 0.45, by + bh * 0.1, Math.max(1, bl * 0.2), Math.max(1, bh * 0.3)));
  if (F.has('spikes')) for (let i = 0; i < 3; i++) { const x = bx - bl * 0.3 + i * bl * 0.4; c.begin('spike', pal.accent); c.poly([[x - 1, by - bh * 0.9], [x, by - bh * 1.5 - 0.5], [x + 1, by - bh * 0.9]]); }
}

export function birdFrontBack(ctx) {
  const { c, W, H, pal, P, pose, F, view } = ctx, front = view === 'front', fy = H - 1;
  const bw = Math.max(3, W * 0.21 * P.bodyHeight), bh = H * 0.23 * P.bodyHeight, legLen = H * 0.24 * P.legLength, r = Math.max(1.7, H * 0.095 * P.headSize), cx = W / 2 - 0.5;
  const by = fy - legLen - bh * 0.5 + pose.bob + (pose.ext > 0 ? 1 : 0), G = GAITS.biped, footY = fy - 0.5, hipY = by + bh * 0.7;
  for (const [i, s] of [-1, 1].entries()) {
    const f = footFor(ctx, 0, i ? G.near : G.far, G.duty, 0, footY), fx = cx + s * bw * 0.4, acc = i ? pal.accent : pal.farAccent;
    drawLeg(ctx, { name: `leg_${i}`, hip: [fx, hipY], foot: [fx, f.y], l1: legLen, l2: legLen * 0.1, hint: [0, 0], straight: true, w: 1, mat: thin(ctx, acc), paw: 'none' });
    c.begin(`toes_${i}`, thin(ctx, acc)); c.line(fx - 1.4, f.y + 0.3, fx + 1.8, f.y + 0.3, 1);
  }
  if (!front) {
    const sway = pose.sway * 0.5, tl = Math.max(3, bh * 1.2);
    const tail = c.begin('tail', pal.far); for (const s of [-1, 0, 1]) c.poly([[cx + s * bw * 0.2 - 1.3, by - bh * 0.3], [cx + s * (bw * 0.7) + sway, by - bh - tl * 0.7], [cx + s * bw * 0.2 + 1.3, by - bh * 0.3]]);
    metalPatches(ctx, tail, cx, by - bh * 0.9, bw, tl);
  }
  const body = c.begin('body', pal.body); c.ellipse(cx, by, bw, bh);
  if (front) c.decal(body, pal.belly, () => c.ellipse(cx, by + bh * 0.25, bw * 0.65, bh * 0.7));
  const wing = c.begin('wing', pal.far);
  for (const s of [-1, 1]) c.ellipse(cx + s * bw * 0.78, by + bh * 0.05, bw * 0.4, bh * 0.75);
  metalPatches(ctx, wing, cx, by, bw * 1.5, bh);
  const hy = by - bh * 0.95 + pose.head * 0.5 + (pose.ext > 0 ? pose.ext * 1.2 : 0), peck = pose.ext > 0 ? 1 : 0;
  if (F.has('comb')) { c.begin('comb', pal.cloth); c.poly([[cx - r * 0.6, hy - r * 0.5], [cx - r * 0.4, hy - r * 1.5], [cx, hy - r * 0.9], [cx + r * 0.4, hy - r * 1.6], [cx + r * 0.6, hy - r * 0.5]]); }
  c.begin('head', pal.body); c.ellipse(cx, hy, r * 1.05, r);
  void peck;
  if (front) {
    c.begin('beak', pal.accent); c.poly([[cx - r * 0.45, hy + r * 0.2], [cx, hy + r * 1.1 + pose.jaw], [cx + r * 0.45, hy + r * 0.2]]);
    if (F.has('comb')) { c.begin('wattle', pal.cloth); c.ellipse(cx, hy + r * 1.3 + pose.jaw, Math.max(0.8, r * 0.3), Math.max(1, r * 0.4)); }
    const ex = Math.max(1.5, r * 0.65); eye(ctx, cx - ex, hy - r * 0.2); eye(ctx, cx + ex - 1, hy - r * 0.2);
    drawExtraEyes(ctx, { x: cx, y: hy, r }, true);
  }
  if (F.has('glow_patch')) c.decal(body, pal.glow, () => c.ellipse(cx, by + bh * 0.3, Math.max(1, bw * 0.25), Math.max(1, bh * 0.3)));
  if (F.has('spikes')) for (const s of [-1, 0, 1]) { c.begin('spike', pal.accent); c.poly([[cx + s * bw * 0.5 - 1, by - bh * 0.8], [cx + s * bw * 0.5, by - bh * 1.4 - 0.5], [cx + s * bw * 0.5 + 1, by - bh * 0.8]]); }
}

export function birdDown(ctx) {
  const { c, W, H, pal, P, F } = ctx, fy = H - 1, bl = W * 0.26 * P.bodyLength, bh = H * 0.21 * P.bodyHeight, r = Math.max(1.6, H * 0.095 * P.headSize);
  const cx = W * 0.5 - 0.5, by = fy - bh * 0.95, acc = thin(ctx, pal.accent);
  // two stiff legs straight up, belly to the sky
  for (const [i, dx] of [[0, -bl * 0.1], [1, bl * 0.35]]) { c.begin(`leg_${i}`, acc); c.line(cx + dx, by - bh * 0.4, cx + dx + 0.6 * (i ? 1 : -1), by - bh - H * 0.2, 1); c.line(cx + dx + 0.6 * (i ? 1 : -1) - 1, by - bh - H * 0.2, cx + dx + 0.6 * (i ? 1 : -1) + 1, by - bh - H * 0.2, 1); }
  c.begin('tail', pal.far); c.poly([[cx - bl * 0.8, by], [cx - bl - 3, by - bh * 0.7], [cx - bl * 0.7, by - bh * 0.7]]);
  const body = c.begin('body', pal.body); c.ellipse(cx, by, bl, bh);
  c.decal(body, pal.belly, () => c.ellipse(cx, by - bh * 0.5, bl * 0.8, bh * 0.55));
  const hx = cx + bl + r * 0.2, hy = fy - r * 0.95;
  c.line(cx + bl * 0.5, by, hx, hy, Math.max(1.8, r * 1.1));
  c.begin('head', pal.body); c.ellipse(hx, hy, r, r * 0.95);
  c.begin('beak', pal.accent); c.poly([[hx + r * 0.7, hy - r * 0.3], [hx + r + 1.6, hy + r * 0.2], [hx + r * 0.7, hy + r * 0.4]]);
  eye(ctx, hx + r * 0.35, hy - r * 0.2);
  void F;
}
