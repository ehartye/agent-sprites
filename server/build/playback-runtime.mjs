// Portable, engine-independent playback helpers for agent-sprites character and
// environment reports. Copy beside the sheet; no DOM or engine dependency beyond
// a 2D context with drawImage for drawAtGround.
//
// Units: report distances are source pixels. `scale` is world pixels per source
// pixel. Pass the displacement your game actually applied after collision.

const MODES = ['authored-contact', 'continuous-root'];
// Used only when an older report predates published alias patterns.
const DEFAULT_ALIASES = { idle: '{person}_{outfit}_{direction}_idle', walk: '{person}_{outfit}_{direction}_walk_{frame}' };
const fill = (pattern, values) => pattern.replace(/\{(\w+)\}/g, (_, key) => String(values[key]));

/** A whole atlas entry (frame, spriteSourceSize, duration) by name; array or hash atlases. */
export function atlasEntry(atlas, name) {
  const entry = Array.isArray(atlas.frames) ? atlas.frames.find(f => f.filename === name) : atlas.frames?.[name];
  if (!entry?.frame) throw new Error(`Missing atlas frame: ${name}`);
  return entry;
}

/** Semantic ground point of a frame, in source pixels within its cell. */
export function groundAnchor(report, frame) {
  // Environment frames carry their own anchor; characters share report.ground at cell center.
  if (frame?.ground && typeof frame.ground === 'object') return { x: frame.ground.x, y: frame.ground.y };
  return { x: report.cellSize.width / 2, y: report.ground };
}

/** Draw an atlas frame so its ground anchor lands on (x, y) in world pixels. */
export function drawAtGround(ctx, image, atlasFrame, anchor, x, y, { scale = 1, offset = [0, 0] } = {}) {
  // Trimmed atlases place the packed rectangle at its offset within the cell.
  const f = atlasFrame.frame, s = atlasFrame.spriteSourceSize ?? { x: 0, y: 0 };
  ctx.drawImage(image, f.x, f.y, f.w, f.h, x + (s.x - anchor.x) * scale + offset[0], y + (s.y - anchor.y) * scale + offset[1], f.w * scale, f.h * scale);
}

/** Visual hit box from a report frame's opaque bounds. Not a collision footprint. */
export function hitBounds(frame, anchor, x, y, { scale = 1 } = {}) {
  const b = frame.bounds;
  return { x: x + (b.left - anchor.x) * scale, y: y + (b.top - anchor.y) * scale, w: (b.right - b.left + 1) * scale, h: (b.bottom - b.top + 1) * scale };
}

/**
 * World point and draw layer for one-sided gear (a held tool, holster, single
 * glove) from its declared anatomical side. A far-side item draws under the
 * body; near, front and back items draw over it.
 */
export function attachmentFor(frame, side, joint, anchor, x, y, { scale = 1 } = {}) {
  if (!['left', 'right'].includes(side)) throw new Error('side must be left or right');
  if (!['shoulder', 'wrist', 'hip', 'lowerWrist'].includes(joint)) throw new Error('joint must be shoulder, wrist, hip or lowerWrist');
  const s = frame.sides?.[side];
  if (!s?.[joint]) throw new Error(`frame ${frame.alias} has no ${side} ${joint}`);
  return { x: x + (s[joint][0] - anchor.x) * scale, y: y + (s[joint][1] - anchor.y) * scale, role: s.role, layer: s.role === 'far' ? 'under-body' : 'over-body' };
}

/** Facing from displacement: dominant axis wins; a tie keeps a matching current facing. */
export function facingFor(dx, dy, current = 'down') {
  if (!dx && !dy) return current;
  const horizontal = dx > 0 ? 'right' : 'left', vertical = dy > 0 ? 'down' : 'up';
  if (Math.abs(dx) > Math.abs(dy)) return horizontal;
  if (Math.abs(dy) > Math.abs(dx)) return vertical;
  return current === vertical ? vertical : horizontal;
}

/**
 * Distance-driven walker over one person/outfit from one or more character
 * reports (an idle-mode report supplies true idle frames).
 *
 * mode 'authored-contact': draw offset subtracts the phase remainder where the
 *   report says so, so calibrated profile contacts stay planted. The body steps.
 * mode 'continuous-root': no offset; the body follows the continuous root and
 *   feet may slide between poses. Calmer for fast camera-following games, but
 *   contacts are not claimed as calibrated.
 */
export function createWalker(reports, { person, outfit, mode, facing = 'down', scale = 1 } = {}) {
  if (!MODES.includes(mode)) throw new Error('mode must be authored-contact or continuous-root');
  const frames = new Map();
  for (const report of [].concat(reports)) for (const frame of report.frames) frames.set(frame.alias, frame);
  const aliases = [].concat(reports).find(r => r.aliases)?.aliases ?? DEFAULT_ALIASES;
  // Reports may name facings their own way (native sheets say front/back for down/up).
  const directions = [].concat(reports).find(r => r.directions)?.directions ?? {};
  const name = (mode, direction, frame) => fill(aliases[mode], { person, outfit, direction: directions[direction] ?? direction, frame });
  let distance = 0;
  const gait = f => {
    const frame = frames.get(name('walk', f, 0));
    if (!frame) throw new Error(`no walk frames ${name('walk', f, '*')}: include a walk-mode report for ${f}`);
    if (!frame.locomotion) throw new Error('no locomotion data in this report');
    return frame.locomotion;
  };
  return {
    gait,
    frame: alias => frames.get(alias),
    update(dx, dy) {
      const next = facingFor(dx, dy, facing);
      if (next !== facing) distance = 0;
      facing = next;
      if (!dx && !dy) {
        const alias = name('idle', facing);
        if (!frames.has(alias)) throw new Error(`no idle frame ${alias}: include an idle-mode report`);
        distance = 0;
        return { alias, facing, moving: false, distance: 0, offset: [0, 0], contactsCalibrated: false };
      }
      // The report's own facing vector, so the runtime never restates it.
      const g = gait(facing), [ux, uy] = g.direction;
      // Only travel along the facing axis advances the stride; the other axis slides.
      distance += Math.abs(dx * ux + dy * uy) / scale;
      const index = Math.floor(distance / g.frameDistance) % g.frameCount;
      const remainder = distance % g.frameDistance;
      const compensate = mode === 'authored-contact' && g.rootCompensation === 'subtract-phase-remainder';
      // "+ 0" turns -0 into 0 for axes the facing does not move along.
      const offset = compensate ? g.direction.map(c => -c * remainder * scale + 0) : [0, 0];
      return { alias: name('walk', facing, index), facing, moving: true, distance, offset, contactsCalibrated: compensate && g.contactCalibration === 'profile' };
    },
  };
}
