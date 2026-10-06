// Optional body features shared by the plans. Each draws from anchors the plan
// exposes, so a horn follows its head and a saddle follows its back at any size.

const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return (h ^ (h >>> 16)) / 4294967296; };
export const unit = (n, i) => hash(n, i);

/** Horns on a profile head. */
export function drawHornsSide(ctx, head) {
  const { c, pal, F } = ctx; if (!F.has('horns')) return;
  const { style = 'curved' } = F.get('horns'), { x: hx, y: hy, r } = head, w = Math.max(1.3, r * 0.5);
  const sets = {
    curved: [[hx + 0.05 * r, hy - 0.7 * r], [hx + 0.45 * r, hy - 1.45 * r], [hx + 1.35 * r, hy - 1.95 * r]],
    straight: [[hx + 0.1 * r, hy - 0.75 * r], [hx + 0.3 * r, hy - 1.6 * r], [hx + 0.55 * r, hy - 2.4 * r]],
    ram: [[hx + 0.15 * r, hy - 0.6 * r], [hx - 0.55 * r, hy - 1.3 * r], [hx - 1.15 * r, hy - 0.5 * r], [hx - 0.75 * r, hy + 0.2 * r]],
    short: [[hx + 0.05 * r, hy - 0.75 * r], [hx + 0.25 * r, hy - 1.35 * r]],
  };
  const pts = sets[style]; if (!pts) throw Error(`Unknown horn style: ${style}`);
  c.begin('horn_far', pal.farAccent); c.path(pts.map(([x, y]) => [x - 1, y]), w * 0.9, 1);
  c.begin('horn', pal.accent); c.path(pts, w, Math.max(1, w * 0.45));
}
export function drawHornsFront(ctx, head) {
  const { c, pal, F } = ctx; if (!F.has('horns')) return;
  const { style = 'curved' } = F.get('horns'), { x: cx, y: hy, r } = head, w = Math.max(1.3, r * 0.5);
  const side = s => ({
    curved: [[cx + s * 0.7 * r, hy - 0.55 * r], [cx + s * 1.55 * r, hy - 0.75 * r], [cx + s * 1.85 * r, hy - 1.8 * r]],
    straight: [[cx + s * 0.55 * r, hy - 0.7 * r], [cx + s * 0.8 * r, hy - 1.6 * r], [cx + s * 0.95 * r, hy - 2.4 * r]],
    ram: [[cx + s * 0.8 * r, hy - 0.4 * r], [cx + s * 1.7 * r, hy - 0.5 * r], [cx + s * 1.6 * r, hy + 0.5 * r]],
    short: [[cx + s * 0.6 * r, hy - 0.65 * r], [cx + s * 0.9 * r, hy - 1.3 * r]],
  })[style];
  for (const s of [-1, 1]) { c.begin('horn', pal.accent); c.path(side(s), w, Math.max(1, w * 0.45)); }
}

export function drawTusks(ctx, head, side) {
  const { c, pal, F } = ctx; if (!F.has('tusks')) return;
  const { r } = head, w = Math.max(1.3, r * 0.42);
  if (side) { const [tx, ty] = head.tip; c.begin('tusk', pal.accent); c.path([[tx - r * 0.75, ty + r * 0.6], [tx - r * 0.15, ty + r * 0.75], [tx + r * 0.5, ty - r * 0.7]], w, 1); }
  else for (const s of [-1, 1]) { c.begin('tusk', pal.accent); c.path([[head.x + s * r * 0.55, head.y + r * 0.85], [head.x + s * r * 0.85, head.y + r * 0.5], [head.x + s * r * 0.8, head.y - r * 0.05]], w, 1); }
}

export function drawBeard(ctx, head, side) {
  const { c, pal, F } = ctx; if (!F.has('beard')) return;
  const { glow } = F.get('beard'), mat = glow ? pal.glow : pal.patch, { r } = head;
  c.begin('beard', mat);
  if (side) { const [tx, ty] = head.tip; c.poly([[tx - r * 0.9, ty + r * 0.35], [tx - r * 0.2, ty + r * 0.3], [tx - r * 0.5, ty + r * 1.35]]); }
  else c.poly([[head.x - r * 0.45, head.y + r * 0.85], [head.x + r * 0.45, head.y + r * 0.85], [head.x, head.y + r * 1.75]]);
}

export function drawFurPatches(ctx, host, a) {
  const { c, pal, F } = ctx; if (!F.has('fur')) return;
  const n = F.get('fur').count ?? 3;
  for (let i = 0; i < n; i++) {
    const u = unit(i + 11, 3), v = unit(i + 5, 9), px = a.bx + (u - 0.5) * a.bl * 1.3, py = a.by + (v - 0.6) * a.bh * 1.1;
    c.decal(host, pal.far, () => c.ellipse(px, py, Math.max(1, a.bl * 0.16), Math.max(1, a.bh * 0.22)));
  }
}

/** Saddle, saddlebags, shell plates, spikes, wool and the glow patch, all on the torso. */
export function drawBackFeatures(ctx, a) {
  const { c, pal, F } = ctx, { bx, by, bl, bh, side, body } = a;
  if (F.has('shell')) {
    const plates = side ? 4 : 3;
    c.decal(body, pal.accent, () => c.ellipse(bx, by - bh * 0.3, bl * 0.9, bh * 0.62));
    for (let i = 1; i < plates; i++) {
      const x = bx - bl * 0.9 + (bl * 1.8 * i) / plates;
      c.decal(body, pal.dark, () => { if (side) c.line(x, by - bh * 0.85, x - 0.5, by + bh * 0.1, 1); else c.line(bx - bl * 0.8, by - bh * 0.9 + (bh * 1.2 * i) / plates, bx + bl * 0.8, by - bh * 0.9 + (bh * 1.2 * i) / plates, 1); });
    }
  }
  if (F.has('wool')) {
    c.begin('wool', pal.patch);
    const n = side ? 5 : 3;
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; c.ellipse(side ? bx - bl * 0.85 + bl * 1.7 * t : bx - bl * 0.7 + bl * 1.4 * t, by - bh * (side ? 0.55 : 0.8) + (i % 2) * 0.8, Math.max(1.6, bh * 0.52), Math.max(1.6, bh * 0.5)); }
    c.ellipse(bx, by - bh * 0.25, bl * 0.95, bh * 0.7);
  }
  if (F.has('saddle')) {
    c.begin('saddle', pal.cloth);
    if (side) { c.ellipse(bx - bl * 0.05, by - bh * 0.78, bl * 0.42, Math.max(1.4, bh * 0.35)); c.rect(Math.round(bx - bl * 0.22), Math.round(by - bh * 0.7), Math.max(2, Math.round(bl * 0.34)), Math.max(2, Math.round(bh * 1.25))); }
    else { c.ellipse(bx, by - bh * 0.6, bl * 0.8, Math.max(1.5, bh * 0.4)); }
  }
  if (F.has('pack')) {
    const pw = Math.max(3, bl * 0.55), ph = Math.max(3, bh * 1.05);
    c.begin('pack', pal.cloth);
    if (side) { c.rect(Math.round(bx - pw / 2), Math.round(by - bh * 0.2), Math.round(pw), Math.round(ph)); }
    else for (const s of [-1, 1]) c.rect(Math.round(bx + s * bl * 1.0 - (s > 0 ? 0 : pw * 0.6)), Math.round(by - bh * 0.1), Math.round(pw * 0.6), Math.round(ph));
    c.begin('pack_strap', pal.metal); if (side) c.rect(Math.round(bx - pw / 2), Math.round(by - bh * 0.2), Math.round(pw), 1);
  }
  if (F.has('spikes')) {
    const n = F.get('spikes').count ?? (side ? 4 : 3), sz = Math.max(1.6, bh * 0.45);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = side ? bx - bl * 0.75 + bl * 1.5 * t : bx - bl * 0.6 + bl * 1.2 * t;
      const k = side ? Math.sqrt(Math.max(0, 1 - ((x - bx) / bl) ** 2)) : 0.9;
      c.begin('spike', pal.accent); c.poly([[x - 1.1, by - bh * k + 0.8], [x, by - bh * k - sz], [x + 1.1, by - bh * k + 0.8]]);
    }
  }
  if (F.has('glow_patch')) c.decal(body, pal.glow, () => c.ellipse(side ? bx - bl * 0.25 : bx, by - bh * 0.1, Math.max(1.4, bl * 0.28), Math.max(1.4, bh * 0.34)));
}

/** A second head on the same shoulders (the two-headed cow gag). */
export function drawSecondHead(ctx, hx, hy, r, o) {
  const { c, pal } = ctx;
  c.begin('neck_2', pal.far); c.line(o.bx + o.bl * 0.4, o.by - o.bh * 0.3, hx, hy - r * 1.3, r * 1.3);
  const h2 = o.headSide(ctx, hx + r * 0.1, hy - r * 1.55, r * 0.95, { jaw: 0, style: o.style, far: true });
  ctx.second = h2;
}

/** Extra eyes for mutants: a second eye above and a forehead eye when viewed from the front. */
export function drawExtraEyes(ctx, head, front) {
  const { c, pal, F } = ctx; if (!F.has('extra_eyes')) return;
  const n = F.get('extra_eyes').count ?? 1, mat = F.has('glow_eyes') ? pal.glowEye : pal.dark;
  const { x, y, r } = head;
  if (front) { c.dot(x, y - r * 0.55, mat); if (n > 1) { c.dot(x - r * 0.75, y - r * 0.5, mat); c.dot(x + r * 0.75 - 1, y - r * 0.5, mat); } }
  else { c.dot(x + r * 0.15, y - r * 0.6, mat); if (n > 1) c.dot(x - r * 0.3, y - r * 0.25, mat); }
}
