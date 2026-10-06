import { ik } from './creature-raster.js';
import { foot, legPhase, liftFor } from './creature-motion.js';

const r2 = n => Math.round(n);
export const legWidth = ctx => Math.max(1, r2(ctx.H * 0.085 * ctx.P.legThickness));

/** A two-bone leg ending flat on the ground. Returns the foot position. */
export function drawLeg(ctx, { name, hip, foot: f, l1, l2, hint, w, mat, paw = 'paw', pawMat, taper = 0.8, straight = false }) {
  const { c } = ctx;
  c.begin(name, mat);
  c.path(straight ? [hip, f] : ik(hip, f, l1, l2, hint), w, Math.max(1, w * taper));
  if (paw !== 'none' && w >= 2) {
    c.begin(`${name}_foot`, paw === 'hoof' ? (pawMat ?? mat) : mat);
    c.line(f[0] - w * 0.2, f[1] + w / 2 - 0.5, f[0] + w * 0.9, f[1] + w / 2 - 0.5, 1);
  }
  return f;
}

/** Where a gaited foot lands, given its hip x, a phase offset and a duty factor. */
export function footFor(ctx, hipX, offset, duty, stride, groundY) {
  const { pose, H } = ctx;
  if (!pose.stepping) return { x: hipX, y: groundY, swing: false };
  const f = foot(legPhase(pose.frame, offset), duty, stride, liftFor(H));
  return { x: hipX + f.dx, y: groundY - Math.round(f.lift), swing: f.swing };
}

/** An eye. Normal eyes are a dark pixel; hurt eyes squint; down eyes are crossed. */
export function eye(ctx, x, y, size = 1) {
  const { c, pal, pose, F } = ctx;
  const glow = F.has('glow_eyes');
  if (pose.down) { c.dot(x, y, pal.dark); if (size > 1) { c.dot(x - 1, y - 1, pal.dark); c.dot(x + 1, y + 1, pal.dark); c.dot(x - 1, y + 1, pal.dark); c.dot(x + 1, y - 1, pal.dark); } return; }
  if (pose.hurt) { c.dot(x, y, pal.dark); c.dot(x - 1, y, pal.dark); return; }
  if (glow) { c.dot(x, y, pal.glowEye); if (size > 1) c.dot(x - 1, y, pal.glowHot); return; }
  c.dot(x, y, pal.dark);
}
