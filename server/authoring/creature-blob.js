import { eye } from './creature-parts.js';
import { drawExtraEyes } from './creature-features.js';

/** Squash and stretch per walk frame: a crawl wave that rolls front to back. */
const CRAWL = [[1.0, 0], [1.1, 1], [1.0, 0], [0.9, -1]];

function dome(ctx, { cx, by, rx, ry, view }) {
  const { c, pal, F, pose } = ctx, fy = ctx.H - 1;
  const [stretch, wave] = pose.stepping ? CRAWL[pose.frame] : [1, 0];
  const sx = rx * stretch * (pose.ext > 0 ? 1 + pose.ext * 0.12 : 1) * (pose.hurt ? 1.1 : 1), sy = ry / Math.pow(stretch, 0.8) * (pose.hurt ? 0.85 : 1) + (pose.bob > 0 ? -0.4 : 0);
  const cyy = fy - sy * 0.62 + pose.bob * 0.3;
  const body = c.begin('body', pal.body);
  c.ellipse(cx, cyy, sx, sy);
  c.cut(body, () => c.rect(-ctx.W, fy, ctx.W * 3, 6));
  c.decal(body, pal.belly, () => c.ellipse(cx, fy - 0.3, sx * 0.85, sy * 0.28));
  // pseudopod bumps along the base shift with the wave
  if (pose.stepping) for (const s of [-1, 1]) { c.begin('foot', pal.far); c.ellipse(cx + s * sx * 0.55 + wave * s * 0.6, fy - 0.8, Math.max(1.4, sx * 0.25), 1.1); }
  if (F.has('shell')) { c.decal(body, pal.accent, () => c.ellipse(cx - 0.5, cyy - sy * 0.35, sx * 0.75, sy * 0.55)); for (const k of [-0.4, 0.2]) { c.begin('plate_line', pal.dark); c.line(cx + sx * k, cyy - sy * 0.85, cx + sx * k - 0.4, cyy - sy * 0.1, 1); } }
  if (F.has('glow_patch')) c.decal(body, pal.glow, () => c.ellipse(cx - sx * 0.15, cyy - sy * 0.1, Math.max(1.2, sx * 0.3), Math.max(1.2, sy * 0.3)));
  if (F.has('spikes')) { const n = 3; for (let i = 0; i < n; i++) { const x = cx + (i - 1) * sx * 0.5, k = Math.sqrt(Math.max(0, 1 - ((x - cx) / sx) ** 2)); c.begin('spike', pal.accent); c.poly([[x - 1.1, cyy - sy * k + 1], [x, cyy - sy * k - Math.max(1.8, sy * 0.4)], [x + 1.1, cyy - sy * k + 1]]); } }
  return { sx, sy, cyy };
}

function mouth(ctx, x, y, w, open) {
  const { c, pal } = ctx;
  c.begin('mouth', pal.dark); c.rect(Math.round(x), Math.round(y), Math.max(2, Math.round(w)), open > 0.35 ? 2 : 1);
  if (open > 0.35) { c.dot(x, y - 1, pal.white); c.dot(x + Math.max(1, w - 2), y - 1, pal.white); }
}

export function blobSide(ctx) {
  const { W, H, P, pose, F } = ctx, rx = W * 0.3 * P.bodyLength, ry = H * 0.3 * P.bodyHeight;
  const cx = W * 0.5 - 0.5 + pose.lunge * W * 0.1 + (pose.hurt ? -1 : 0);
  const d = dome(ctx, { cx, by: 0, rx, ry });
  const ex = cx + d.sx * 0.45, ey = d.cyy - d.sy * 0.25;
  eye(ctx, ex, ey, 2); eye(ctx, ex - 2, ey + 0, 1);
  drawExtraEyes(ctx, { x: ex, y: ey, r: Math.max(2, d.sy * 0.5) }, false);
  mouth(ctx, cx + d.sx * 0.3, d.cyy + d.sy * 0.25, Math.max(2, d.sx * 0.4), pose.jaw);
  void F;
}

export function blobFrontBack(ctx) {
  const { W, P, pose, view } = ctx, front = view === 'front', rx = W * 0.26 * P.bodyHeight, ry = ctx.H * 0.3 * P.bodyHeight;
  const cx = W * 0.5 - 0.5, d = dome(ctx, { cx, by: 0, rx, ry });
  if (front) {
    const ex = Math.max(1.5, d.sx * 0.4), ey = d.cyy - d.sy * 0.2;
    eye(ctx, cx - ex, ey, 1); eye(ctx, cx + ex - 1, ey, 1);
    drawExtraEyes(ctx, { x: cx, y: ey, r: Math.max(2, d.sy * 0.5) }, true);
    mouth(ctx, cx - Math.max(1, d.sx * 0.25), d.cyy + d.sy * 0.3, Math.max(2, d.sx * 0.5), pose.jaw);
  }
}

export function blobDown(ctx) {
  const { c, W, H, pal, P } = ctx, fy = H - 1, rx = W * 0.34 * P.bodyLength, ry = H * 0.14 * P.bodyHeight, cx = W / 2 - 0.5;
  const body = c.begin('body', pal.body); c.ellipse(cx, fy - ry * 0.7, rx, ry); c.cut(body, () => c.rect(-W, fy, W * 3, 6));
  c.decal(body, pal.belly, () => c.ellipse(cx, fy - 0.5, rx * 0.8, ry * 0.3));
  eye(ctx, cx + rx * 0.3, fy - ry * 0.9, 2);
}
