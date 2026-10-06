import { drawLeg, footFor, legWidth, eye } from './creature-parts.js';
import { GAITS } from './creature-motion.js';
import { drawExtraEyes, drawHornsSide, drawHornsFront, drawBackFeatures, drawFurPatches, drawTusks, drawBeard, drawSecondHead } from './creature-features.js';

/** Head silhouettes: skull and muzzle sizes in head radii, plus an ear shape. */
export const HEAD_STYLES = {
  canid: { muzzle: 1.2, mh: 0.42, ear: 'point', skullY: 0.92, nose: true },
  bovid: { muzzle: 0.95, mh: 0.62, ear: 'flap', skullY: 1.0, nose: true },
  swine: { muzzle: 0.8, mh: 0.62, ear: 'fold', skullY: 0.95, nose: false, snoutDisc: true },
  caprine: { muzzle: 0.9, mh: 0.46, ear: 'leaf', skullY: 0.95, nose: true },
  equine: { muzzle: 1.9, mh: 0.5, ear: 'tall', skullY: 0.85, nose: true },
};

function earSide(ctx, hx, hy, r, style) {
  const { c, pal, pose } = ctx; const t = pose.twitch ? 1 : 0;
  c.begin('ear', pal.far);
  if (style === 'point') c.poly([[hx - 0.9 * r, hy - 0.5 * r], [hx - 0.55 * r, hy - 1.85 * r - t], [hx + 0.15 * r, hy - 0.75 * r]]);
  else if (style === 'tall') c.poly([[hx - 0.8 * r, hy - 0.6 * r], [hx - 0.6 * r, hy - 2.1 * r - t], [hx - 0.05 * r, hy - 0.7 * r]]);
  else if (style === 'flap') c.poly([[hx - 0.5 * r, hy - 0.35 * r], [hx - 1.55 * r, hy - 0.7 * r + t], [hx - 0.35 * r, hy + 0.15 * r]]);
  else if (style === 'leaf') c.poly([[hx - 0.4 * r, hy - 0.55 * r], [hx - 1.5 * r, hy - 0.45 * r + t], [hx - 0.3 * r, hy + 0.05 * r]]);
  else c.poly([[hx - 0.6 * r, hy - 0.7 * r], [hx - 0.3 * r, hy - 1.45 * r - t], [hx + 0.25 * r, hy - 0.6 * r]]);
}

/** One head in profile, facing right. Returns anchors for features. */
export function headSide(ctx, hx, hy, r, { jaw = 0, style = 'canid', far = false } = {}) {
  const { c, pal, pose } = ctx, hs = HEAD_STYLES[style], mat = far ? pal.far : pal.body;
  earSide(ctx, hx, hy, r, hs.ear);
  c.begin('head', mat);
  c.ellipse(hx, hy, r, r * hs.skullY);
  const mx = hx + r * (0.35 + hs.muzzle), my = hy + r * 0.28, mh = r * hs.mh;
  c.line(hx + r * 0.3, my - r * 0.05, mx, my, mh * 2 - (jaw > 0.35 ? 0.9 : 0));
  if (hs.snoutDisc) c.ellipse(mx - 0.2, my, Math.max(1.2, r * 0.35), mh * 1.0);
  const tipX = mx + (hs.snoutDisc ? Math.max(1.2, r * 0.35) : mh * 0.9);
  if (jaw > 0.35) {
    const drop = jaw * r * 0.9;
    c.begin('mouth', pal.dark); c.poly([[hx + r * 0.2, my + mh * 0.1], [tipX - 0.3, my + mh * 0.1], [tipX - 0.3, my + mh + drop * 0.5], [hx + r * 0.6, my + mh * 0.6 + drop * 0.35]]);
    c.begin('jaw', mat); c.line(hx + r * 0.2, my + mh * 0.8 + 0.2, tipX - 0.4, my + mh * 0.9 + drop * 0.9, Math.max(1, mh * 0.9));
  }
  if (hs.nose && !far) c.dot(tipX - 0.4, my - mh * 0.45, pal.dark);
  if (hs.snoutDisc) { c.dot(tipX - 0.6, my - mh * 0.15, pal.dark); }
  if (!far) { eye(ctx, hx + r * 0.38, hy - r * 0.18); drawExtraEyes(ctx, { x: hx, y: hy, r }, false); }
  return { x: hx, y: hy, r, tip: [tipX, my], muzzle: [mx, my], top: hy - r * hs.skullY };
}

function tailSide(ctx, x0, y0, { length, style }) {
  const { c, pal, pose } = ctx, sway = pose.sway;
  c.begin('tail', pal.body);
  if (style === 'stub') { c.ellipse(x0 - 0.8, y0 + 0.3, 1.4, 1.4); return; }
  const l = Math.max(2, length), lift = style === 'whip' ? -l * 0.15 : l * 0.25;
  const pts = [[x0, y0], [x0 - l * 0.55, y0 + lift * 0.4 - 0.5 + sway * 0.4], [x0 - l, y0 + l * 0.35 + lift - sway]];
  c.path(pts, Math.max(1.5, ctx.H * 0.075), style === 'whip' ? 1 : Math.max(1.5, ctx.H * 0.07));
  if (style === 'tuft' || style === 'club') {
    const [tx, ty] = pts[2];
    c.begin('tail_tip', style === 'club' ? pal.accent : pal.far); c.ellipse(tx - 0.2, ty + 0.5, Math.max(1.2, ctx.H * 0.06), Math.max(1.5, ctx.H * 0.08));
  }
}

export function quadrupedSide(ctx) {
  const { c, W, H, pal, P, pose, F } = ctx, fy = H - 1, lw = legWidth(ctx);
  const bl = W * 0.25 * P.bodyLength, bh = H * 0.21 * P.bodyHeight, legLen = H * 0.29 * P.legLength;
  const r = H * 0.13 * P.headSize, style = ctx.opts.head;
  const tailProj = W * 0.12 * P.tailLength, cx = W * 0.08 + tailProj + bl;
  const bx = cx + pose.lunge * W * 0.1 + (pose.hurt ? -1 : 0), by = fy - legLen - 0.4 * bh + pose.bob;
  const hipY = by + bh * 0.45, footY = fy - lw / 2, l1 = legLen * 0.5, l2 = legLen * 0.6, stride = bl * 0.75;
  const G = GAITS.quadruped, planted = !pose.stepping;
  const base = { hind: cx - bl * 0.62, fore: cx + bl * 0.6 };
  const place = (hipX, offset) => {
    const f = footFor(ctx, hipX, offset, G.duty, stride, footY);
    return [planted ? hipX : f.x, f.y];
  };
  const hipHind = bx - bl * 0.62, hipFore = bx + bl * 0.6;
  const legs = [
    ['leg_far_hind', hipHind + 1.5, base.hind + 1.5, G.hindFar, [1, 0], pal.far, 'farAccent'],
    ['leg_far_fore', hipFore + 1, base.fore + 1, G.foreFar, [-1, 0], pal.far, 'farAccent'],
  ];
  const near = [
    ['leg_near_hind', hipHind, base.hind, G.hindNear, [1, 0], pal.body, 'accent'],
    ['leg_near_fore', hipFore, base.fore, G.foreNear, [-1, 0], pal.body, 'accent'],
  ];
  const extra = F.has('extra_limbs') ? [['leg_extra', (hipHind + hipFore) / 2, (base.hind + base.fore) / 2, 0.375, [-1, 0], pal.far, 'farAccent']] : [];
  const draw = ([name, hx, fx, off, hint, mat, accent]) => {
    const f = place(planted ? hx : hx, off);
    drawLeg(ctx, { name, hip: [hx, hipY], foot: [planted ? fx : f[0] + (fx - hx), f[1]], l1, l2, hint, w: lw, mat, paw: ctx.opts.paw, pawMat: pal[accent] });
  };
  tailSide(ctx, bx - bl * 0.85, by - bh * 0.25, { length: tailProj + 1, style: ctx.opts.tail });
  for (const l of [...legs, ...extra]) draw(l);
  // body, with the neck merged into the same part so no seam shows
  const body = c.begin('body', pal.body);
  c.ellipse(bx, by, bl, bh);
  const hx = bx + bl + r * 0.15 + pose.ext * W * 0.03, hy = by - bh * 0.75 + pose.head * 0.5 + (pose.ext > 0 ? pose.ext * r * 0.55 : pose.ext * r * 0.3) + (pose.hurt ? -r * 0.45 : 0);
  if (F.has('hump')) c.ellipse(bx + bl * 0.35, by - bh * 0.85, bl * 0.35, bh * 0.55);
  c.line(bx + bl * 0.45, by - bh * 0.1, hx - r * 0.2, hy + r * 0.15, r * 1.6 * P.neckThickness);
  c.decal(body, pal.belly, () => c.ellipse(bx + bl * 0.05, by + bh * 0.95, bl * 0.9, bh * 0.55));
  drawFurPatches(ctx, body, { bx, by, bl, bh });
  drawBackFeatures(ctx, { bx, by, bl, bh, side: true, body });
  if (F.has('second_head')) drawSecondHead(ctx, hx, hy, r, { bx, by, bl, bh, headSide, jaw: pose.jaw, style });
  const head = headSide(ctx, hx, hy, r, { jaw: pose.jaw, style });
  drawBeard(ctx, head, true);
  drawHornsSide(ctx, head);
  if (ctx.second) drawHornsSide(ctx, ctx.second);
  drawTusks(ctx, head, true);
  for (const l of near) draw(l);
  return { head, body: { x: bx, y: by, rx: bl, ry: bh }, ground: fy };
}

/** Front and back share a body; the head and tail swap. */
export function quadrupedFrontBack(ctx) {
  const { c, W, H, pal, P, pose, F, view } = ctx, front = view === 'front', fy = H - 1, lw = legWidth(ctx);
  const bw = Math.max(3, W * 0.14 * P.bodyHeight), bh = H * 0.2 * P.bodyHeight, legLen = H * 0.30 * P.legLength;
  const r = H * 0.13 * P.headSize, cx = W / 2, style = ctx.opts.head, hs = HEAD_STYLES[style];
  const by = fy - legLen - 0.4 * bh + pose.bob + (pose.ext > 0 ? 1 : 0), hipY = by + bh * 0.5, footY = fy - lw / 2;
  const G = GAITS.quadruped, spread = bw * 0.62, hindSpread = bw * 0.95;
  const legAt = (x, off, shorter) => {
    const f = footFor(ctx, x, off, G.duty, 0, footY);
    return [x, f.y - (shorter ? 1 : 0)];
  };
  // hind legs sit behind the body, wider than the chest, and a pixel farther up the ground
  const hind = [[cx - hindSpread, G.hindFar], [cx + hindSpread, G.hindNear]];
  hind.forEach(([x, off], i) => drawLeg(ctx, { name: `leg_hind_${i}`, hip: [x, hipY], foot: legAt(x, off, true), l1: legLen * 0.6, l2: legLen * 0.6, hint: [0, 0], straight: true, w: lw, mat: pal.far, paw: 'none' }));
  // tail
  if (!front) {
    c.begin('tail', pal.body);
    const tl = Math.max(3, H * 0.28 * P.tailLength), tx = cx + pose.sway * 1;
    c.path([[cx, by - bh * 0.1], [tx, by + bh * 0.2], [tx + (ctx.opts.tail === 'whip' ? 0 : 0), by + bh * 0.2 + tl]], Math.max(1.5, H * 0.075), 1.2);
    if (ctx.opts.tail !== 'whip' && ctx.opts.tail !== 'stub') { c.begin('tail_tip', pal.far); c.ellipse(tx, by + bh * 0.2 + tl, Math.max(1.2, H * 0.06), 1.5); }
  }
  // the rump rises behind the chest, so the body reads as long rather than a ball
  c.begin('rump', pal.far); c.ellipse(cx, by - bh * 0.45, bw * 1.08, bh * 0.95);
  const body = c.begin('body', pal.body);
  c.ellipse(cx, by + bh * 0.1, bw, bh);
  c.decal(body, pal.belly, () => c.ellipse(cx, by + bh, bw * 0.55, bh * 0.45));
  drawFurPatches(ctx, body, { bx: cx, by, bl: bw, bh, front: true });
  drawBackFeatures(ctx, { bx: cx, by, bl: bw, bh, side: false, body, back: !front });
  const fore = [[cx - spread * 0.85, G.foreFar], [cx + spread * 0.85, G.foreNear]];
  if (front) {
    const hy = by - bh * 0.35 + pose.head * 0.5 + (pose.ext > 0 ? pose.ext * 1 : 0), hr = r * 1.05;
    // forelegs first, head over the chest
    fore.forEach(([x, off], i) => drawLeg(ctx, { name: `leg_fore_${i}`, hip: [x, hipY], foot: legAt(x, off, false), l1: legLen * 0.6, l2: legLen * 0.6, hint: [0, 0], straight: true, w: lw, mat: pal.body, paw: ctx.opts.paw, pawMat: pal.accent }));
    const two = F.has('second_head'), hrr = two ? hr * 0.88 : hr;
    for (const x of two ? [cx - hrr * 0.95, cx + hrr * 0.95] : [cx]) {
      headFront(ctx, x, hy + (two && x > cx ? -1 : 0), hrr, style, pose.jaw);
      drawHornsFront(ctx, { x, y: hy, r: hrr });
      drawBeard(ctx, { x, y: hy, r: hrr }, false);
      drawTusks(ctx, { x, y: hy, r: hrr, tip: [x, hy + hrr * 0.5] }, false);
    }
  } else {
    fore.forEach(([x, off], i) => drawLeg(ctx, { name: `leg_fore_${i}`, hip: [x, hipY], foot: legAt(x, off, false), l1: legLen * 0.6, l2: legLen * 0.6, hint: [0, 0], straight: true, w: lw, mat: pal.body, paw: ctx.opts.paw, pawMat: pal.accent }));
    // the back of a head peeking over the shoulders
    const hy = by - bh * 0.95;
    c.begin('ear', pal.far); c.poly([[cx - r * 0.95, hy], [cx - r * 0.7, hy - r * 1.4], [cx - r * 0.1, hy]]); c.poly([[cx + r * 0.95, hy], [cx + r * 0.7, hy - r * 1.4], [cx + r * 0.1, hy]]);
    const two = F.has('second_head');
    for (const x of two ? [cx - r * 0.85, cx + r * 0.85] : [cx]) {
      c.begin('head', pal.far); c.ellipse(x, hy + r * 0.2, r * (two ? 0.8 : 0.95), r * 0.8);
      drawHornsFront(ctx, { x, y: hy, r: two ? r * 0.8 : r, back: true });
    }
  }
  return { ground: fy };
}

export function headFront(ctx, cx, hy, r, style, jaw = 0) {
  const { c, pal, F, pose } = ctx, hs = HEAD_STYLES[style], t = pose.twitch ? 1 : 0;
  // ears behind the skull
  c.begin('ear', pal.far);
  if (hs.ear === 'point' || hs.ear === 'tall') {
    const h = hs.ear === 'tall' ? 2.1 : 1.8;
    c.poly([[cx - r * 0.95, hy - r * 0.2], [cx - r * 0.8, hy - r * h - t], [cx - r * 0.1, hy - r * 0.7]]);
    c.poly([[cx + r * 0.95, hy - r * 0.2], [cx + r * 0.8, hy - r * h], [cx + r * 0.1, hy - r * 0.7]]);
  } else {
    c.ellipse(cx - r * 1.25, hy - r * 0.25 + t * 0.4, r * 0.55, r * 0.3); c.ellipse(cx + r * 1.25, hy - r * 0.25, r * 0.55, r * 0.3);
  }
  c.begin('head', pal.body); c.ellipse(cx, hy, r, r * hs.skullY);
  const mw = r * (hs.mh * 1.6 + 0.3);
  c.begin('muzzle', pal.belly); c.ellipse(cx, hy + r * 0.55, mw, r * (0.38 + (hs.snoutDisc ? 0.12 : 0)));
  if (jaw > 0.35) { c.begin('mouth', pal.dark); c.ellipse(cx, hy + r * 0.8, mw * 0.55, r * 0.3 + jaw * 0.6); }
  c.dot(cx - Math.max(1, mw * 0.4), hy + r * 0.45, pal.dark); c.dot(cx + Math.max(1, mw * 0.4) - 1, hy + r * 0.45, pal.dark);
  const ex = Math.max(1.5, r * 0.5);
  eye(ctx, cx - ex, hy - r * 0.2); eye(ctx, cx + ex - 1, hy - r * 0.2);
  drawExtraEyes(ctx, { x: cx, y: hy, r }, true);
  void F;
}

/** Lying on its back, legs stiff in the air, eyes crossed. */
export function quadrupedDown(ctx) {
  const { c, W, H, pal, P, F } = ctx, fy = H - 1, lw = legWidth(ctx);
  const bl = W * 0.25 * P.bodyLength, bh = H * 0.19 * P.bodyHeight, r = H * 0.13 * P.headSize, style = ctx.opts.head;
  const tailProj = W * 0.12 * P.tailLength, cx = W * 0.08 + tailProj + bl, by = fy - bh * 0.85, legLen = H * 0.27 * P.legLength;
  c.begin('tail', pal.far); c.path([[cx - bl * 0.8, by + bh * 0.2], [cx - bl - tailProj * 0.5, fy - 1.5], [cx - bl - tailProj, fy - 1]], Math.max(1.5, H * 0.07), 1);
  const body = c.begin('body', pal.body); c.ellipse(cx, by, bl, bh);
  c.decal(body, pal.belly, () => c.ellipse(cx, by - bh * 0.6, bl * 0.85, bh * 0.55));
  const lean = [[-bl * 0.55, -0.35], [-bl * 0.2, -0.15], [bl * 0.25, 0.2], [bl * 0.6, 0.4]];
  lean.forEach(([dx, tilt], i) => {
    const x = cx + dx, y = by - bh * 0.55;
    drawLeg(ctx, { name: `leg_up_${i}`, hip: [x, y], foot: [x + tilt * legLen, y - legLen * 0.95], l1: legLen * 0.6, l2: legLen * 0.6, hint: [tilt || 1, 0], straight: true, w: lw, mat: i % 2 ? pal.far : pal.body, paw: ctx.opts.paw, pawMat: pal.accent });
  });
  const hx = cx + bl + r * 0.1, hy = fy - r * 0.9;
  c.line(cx + bl * 0.5, by + bh * 0.2, hx, hy, r * 1.4);
  const head = headSide(ctx, hx, hy, r, { jaw: 0.5, style });
  drawHornsSide(ctx, head); drawTusks(ctx, head, true);
  void F;
}
