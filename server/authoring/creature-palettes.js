import { mat, flat } from './creature-raster.js';

/** Ramps adopted from the Fallow Valley art direction (light to dark). Extra ramps may be added, never recoloured. */
export const RAMPS = {
  dust: ['#e3cf93', '#c9a869', '#b08d57', '#8f6f45', '#6b5033', '#4a3624'],
  rust: ['#d98b4a', '#b5532f', '#8c3b25', '#5e2a1f'],
  oxide: ['#8fc4b4', '#5f9a8d', '#3f6f68', '#2a4a4a'],
  concrete: ['#c4c3ba', '#a8a79e', '#85847c', '#5f5f5a', '#3c3c3a', '#26262a'],
  scrub: ['#a9b45a', '#8a9a4a', '#6b7d3a', '#4a5c2f', '#2f3d22'],
  harvest: ['#f0d466', '#e0b84a', '#c58f2c'],
  toxic: ['#e08a2c', '#7a4a8c', '#5a2f6a', '#8fc43a'],
  glow: ['#d6ff9a', '#9dff6e', '#5ac96a'],
  night: ['#2c3a6b', '#1b2040', '#0d1126'],
};

// Named four-step materials [hi, mid, lo, out]: indices into a ramp, or explicit colours.
const m = (ramp, steps) => mat(...steps.map(i => RAMPS[ramp][i]));
const MATERIALS = {
  'dust': m('dust', [1, 2, 3, 5]),
  'dust-light': m('dust', [0, 1, 2, 4]),
  'earth': m('dust', [2, 3, 4, 5]),
  'rust': m('rust', [0, 1, 2, 3]),
  'oxide': m('oxide', [0, 1, 2, 3]),
  'concrete': m('concrete', [1, 2, 3, 5]),
  'ash': m('concrete', [2, 3, 4, 5]),
  'concrete-light': m('concrete', [0, 1, 2, 4]),
  'scrub': m('scrub', [1, 2, 3, 4]),
  'harvest': m('harvest', [0, 1, 2, 2]),
  'violet': mat(RAMPS.toxic[1], RAMPS.toxic[2], RAMPS.night[1], RAMPS.night[2]),
  'bone': mat(RAMPS.dust[0], RAMPS.dust[1], RAMPS.dust[3], RAMPS.dust[5]),
  'glow': mat(RAMPS.glow[0], RAMPS.glow[1], RAMPS.glow[2], RAMPS.scrub[3]),
  'night': mat(RAMPS.night[0], RAMPS.night[1], RAMPS.night[2], RAMPS.night[2]),
};
export const MATERIAL_NAMES = Object.keys(MATERIALS);

/** Named palettes: a role -> material table. Roles: body, belly, accent, cloth, metal, glow, dark. */
export const PALETTES = {
  dust: { body: 'dust', belly: 'dust-light', accent: 'bone', cloth: 'rust', metal: 'concrete', glow: 'glow' },
  earth: { body: 'earth', belly: 'dust', accent: 'bone', cloth: 'rust', metal: 'concrete', glow: 'glow' },
  rust: { body: 'rust', belly: 'dust', accent: 'bone', cloth: 'oxide', metal: 'concrete', glow: 'glow' },
  oxide: { body: 'oxide', belly: 'concrete-light', accent: 'bone', cloth: 'rust', metal: 'concrete', glow: 'glow' },
  concrete: { body: 'concrete', belly: 'concrete-light', accent: 'bone', cloth: 'rust', metal: 'ash', glow: 'glow' },
  ash: { body: 'ash', belly: 'concrete', accent: 'bone', cloth: 'rust', metal: 'concrete', glow: 'glow' },
  scrub: { body: 'scrub', belly: 'dust-light', accent: 'bone', cloth: 'rust', metal: 'concrete', glow: 'glow' },
  toxic: { body: 'violet', belly: 'earth', accent: 'bone', cloth: 'rust', metal: 'concrete', glow: 'glow' },
};
export const PALETTE_NAMES = Object.keys(PALETTES);
const HEX = /^#[0-9a-f]{6}$/i;

/** One role: a material name, or four explicit hex steps, or { ramp, steps }. */
function material(spec, role) {
  if (typeof spec === 'string') {
    if (!MATERIALS[spec]) throw Error(`Palette role ${role}: unknown material ${spec}. Use ${MATERIAL_NAMES.join(', ')}`);
    return { ...MATERIALS[spec] };
  }
  if (Array.isArray(spec) && spec.length === 4 && spec.every(c => typeof c === 'string' && HEX.test(c))) return mat(...spec);
  if (spec && typeof spec === 'object' && RAMPS[spec.ramp] && Array.isArray(spec.steps) && spec.steps.length === 4 && spec.steps.every(i => Number.isInteger(i) && i >= 0 && i < RAMPS[spec.ramp].length)) return m(spec.ramp, spec.steps);
  throw Error(`Palette role ${role} must be a material name, four #RRGGBB steps, or { ramp, steps }`);
}

export function resolvePalette(spec = 'dust') {
  let base = 'dust', roles = {};
  if (typeof spec === 'string') base = spec;
  else if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
    const { preset, ...rest } = spec;
    for (const key of Object.keys(rest)) if (!['body', 'belly', 'accent', 'cloth', 'metal', 'glow', 'patch'].includes(key)) throw Error(`Unknown palette role: ${key}`);
    base = preset ?? 'dust'; roles = rest;
  } else throw Error('palette must be a preset name or an object of roles');
  if (!PALETTES[base]) throw Error(`Unknown palette preset: ${base}. Use ${PALETTE_NAMES.join(', ')}`);
  const out = {};
  for (const role of ['body', 'belly', 'accent', 'cloth', 'metal', 'glow']) out[role] = material(roles[role] ?? PALETTES[base][role], role);
  out.patch = roles.patch ? material(roles.patch, 'patch') : { ...out.belly };
  // Far-side limbs read as being in shadow: one step darker than the near ones.
  out.far = mat(out.body.mid, out.body.lo, out.body.out, out.body.out);
  out.farAccent = mat(out.accent.mid, out.accent.lo, out.accent.out, out.accent.out);
  out.dark = flat(out.body.out);
  out.eye = flat(out.body.out);
  out.glowEye = flat(out.glow.mid, { noOutline: true });
  out.glowHot = flat(out.glow.hi, { noOutline: true });
  out.glowSoft = flat(out.glow.mid);
  out.white = flat(RAMPS.dust[0], { noOutline: true });
  return out;
}

/** Hit flash: every body tone lifts to the lightest steps of its own ramp. */
export function flashed(pal) {
  const f = {};
  for (const [k, v] of Object.entries(pal)) f[k] = v.flat ? v : mat(RAMPS.dust[0], RAMPS.dust[0], RAMPS.dust[1], v.out, { noOutline: v.noOutline });
  f.glowEye = pal.glowEye; f.glowHot = pal.glowHot;
  return f;
}
