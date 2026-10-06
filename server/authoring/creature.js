import { Raster, mirrorPixels, toOperations, boundsOf } from './creature-raster.js';
import { resolvePalette, flashed, PALETTE_NAMES } from './creature-palettes.js';
import { ANIMATIONS, VIEWS, ATTACKS, ATTACK_FRAMES, WALK_FRAMES, posePlan, GAITS } from './creature-motion.js';
import { PLANS } from './creature-plans.js';

export const SIZE_PRESETS = { small: [16, 16], medium: [32, 24], large: [48, 32] };
const PROPORTIONS = ['bodyLength', 'bodyHeight', 'legLength', 'legThickness', 'headSize', 'neckThickness', 'tailLength'];
const FEATURE_TYPES = ['horns', 'tusks', 'tail', 'stinger', 'pincers', 'mandibles', 'shell', 'fur', 'spikes', 'glow_eyes', 'glow_patch', 'beard', 'wool', 'saddle', 'pack', 'extra_eyes', 'extra_limbs', 'second_head', 'metal_feathers', 'comb', 'antennae', 'hump', 'wings'];
const count = v => Number.isInteger(v) && v >= 0 && v <= 12;
const FEATURE_OPTIONS = {
  horns: { style: v => ['curved', 'straight', 'ram', 'short'].includes(v) },
  fur: { count }, spikes: { count }, extra_eyes: { count }, metal_feathers: { count },
  beard: { glow: v => typeof v === 'boolean' },
};
const FPS = { idle: 3, walk: 8, attack: 10, hurt: 6, down: 1 };
const identifier = (v, label) => { if (typeof v !== 'string' || !/^[a-z][a-z0-9_-]{0,47}$/.test(v)) throw Error(`Invalid ${label}`); return v; };
const fail = msg => { throw Error(msg); };

export function parseSize(size = 'medium') {
  if (typeof size === 'string' && SIZE_PRESETS[size]) return [...SIZE_PRESETS[size]];
  const m = typeof size === 'string' ? size.match(/^(\d{1,3})x(\d{1,3})$/i) : null;
  if (!m) throw Error(`Unsupported creature size: ${size}. Use ${Object.keys(SIZE_PRESETS).join(', ')} or WxH`);
  const [w, h] = [Number(m[1]), Number(m[2])];
  if (w < 16 || h < 16 || w > 160 || h > 128) throw Error('Creature size must be between 16x16 and 160x128');
  return [w, h];
}

function normalise(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw Error('creature must be an object');
  for (const key of Object.keys(config)) if (!['name', 'plan', 'size', 'palette', 'proportions', 'features', 'head', 'tail', 'paw', 'views', 'animations', 'attack', 'idleFrames', 'left', 'outline', 'fps'].includes(key)) throw Error(`Unknown creature field: ${key}`);
  const name = identifier(config.name ?? 'creature', 'creature name');
  const plan = config.plan ?? fail('creature plan is required');
  const spec = typeof plan === 'string' && Object.hasOwn(PLANS, plan) ? PLANS[plan] : fail(`Unsupported creature plan: ${String(plan)}. Use ${Object.keys(PLANS).join(', ')}`);
  const [W, H] = parseSize(config.size);
  const P = Object.fromEntries(PROPORTIONS.map(k => [k, 1]));
  if (config.proportions !== undefined) {
    if (!config.proportions || typeof config.proportions !== 'object' || Array.isArray(config.proportions)) throw Error('proportions must be an object');
    for (const [k, v] of Object.entries(config.proportions)) {
      if (!PROPORTIONS.includes(k)) throw Error(`Unknown proportion: ${k}. Use ${PROPORTIONS.join(', ')}`);
      if (!Number.isFinite(v) || v < 0.4 || v > 2.5) throw Error(`Proportion ${k} must be between 0.4 and 2.5`);
      P[k] = v;
    }
  }
  const F = new Map();
  if (config.features !== undefined && !Array.isArray(config.features)) throw Error('features must be an array');
  for (const item of config.features ?? []) {
    const f = typeof item === 'string' ? { type: item } : item;
    if (!f || typeof f !== 'object' || Array.isArray(f) || typeof f.type !== 'string') throw Error('Each feature is a type name or an object with a type');
    if (!FEATURE_TYPES.includes(f.type)) throw Error(`Unknown creature feature: ${f.type}. Use ${FEATURE_TYPES.join(', ')}`);
    if (!spec.features.includes(f.type)) throw Error(`Feature ${f.type} is not available on the ${plan} plan (supported: ${spec.features.join(', ')})`);
    if (F.has(f.type)) throw Error(`Duplicate creature feature: ${f.type}`);
    const { type, ...fopts } = f;
    const schema = FEATURE_OPTIONS[type] ?? {};
    for (const [key, value] of Object.entries(fopts)) {
      const rule = Object.hasOwn(schema, key) ? schema[key] : fail(`Feature ${type} has no option ${key}${Object.keys(schema).length ? ` (options: ${Object.keys(schema).join(', ')})` : ''}`);
      if (!rule(value)) throw Error(`Invalid ${type} option ${key}: ${JSON.stringify(value)}`);
    }
    F.set(type, fopts);
  }
  const opts = { ...spec.defaults };
  for (const key of ['head', 'tail', 'paw']) if (config[key] !== undefined) {
    if (!spec.options[key]?.includes(config[key])) throw Error(`Unsupported ${key} for ${plan}: ${config[key]}. Use ${(spec.options[key] ?? []).join(', ') || 'none (not configurable)'}`);
    opts[key] = config[key];
  }
  const views = config.views ?? ['front', 'back', 'right'];
  if (Array.isArray(views) && views.includes('left')) throw Error('views lists front, back and right; left is the mirror of right (set left: false to omit it)');
  if (!Array.isArray(views) || !views.length || new Set(views).size !== views.length || views.some(v => !VIEWS.includes(v))) throw Error(`views must be a unique nonempty subset of ${VIEWS.join(', ')}`);
  const animations = config.animations ?? ANIMATIONS;
  if (!Array.isArray(animations) || !animations.length || new Set(animations).size !== animations.length || animations.some(a => !ANIMATIONS.includes(a))) throw Error(`animations must be a unique nonempty subset of ${ANIMATIONS.join(', ')}`);
  const left = config.left ?? true;
  if (typeof left !== 'boolean') throw Error('left must be true or false');
  const attacks = [].concat(config.attack ?? spec.attacks[0]);
  if (!attacks.length || attacks.length > 2 || new Set(attacks).size !== attacks.length || attacks.some(a => !ATTACKS.includes(a) || !spec.attacks.includes(a))) throw Error(`attack must be one or two of ${spec.attacks.join(', ')} for the ${plan} plan`);
  const idleFrames = config.idleFrames ?? 2;
  if (![2, 4].includes(idleFrames)) throw Error('idleFrames must be 2 or 4');
  const outline = config.outline ?? 'selective';
  if (!['selective', 'full'].includes(outline)) throw Error('outline must be selective or full');
  const fps = { ...FPS };
  if (config.fps !== undefined) {
    if (!config.fps || typeof config.fps !== 'object' || Array.isArray(config.fps)) throw Error('fps must be an object');
    for (const [k, v] of Object.entries(config.fps)) { if (!Object.hasOwn(FPS, k) || !Number.isFinite(v) || v < 1 || v > 60) throw Error(`fps.${k} must be between 1 and 60 for idle, walk, attack, hurt or down`); fps[k] = v; }
  }
  const palette = resolvePalette(config.palette);
  const emitViews = [...views, ...(left && views.includes('right') ? ['left'] : [])];
  return { name, plan, spec, W, H, P, F, opts, views, emitViews, animations, attacks, idleFrames, outline, fps, palette, paletteName: typeof config.palette === 'string' ? config.palette : (config.palette?.preset ?? 'dust'), left };
}

function frameSpecs(cfg) {
  const out = [];
  for (const view of cfg.emitViews) for (const anim of cfg.animations) {
    if (anim === 'down') continue;
    const count = anim === 'idle' ? cfg.idleFrames : anim === 'walk' ? WALK_FRAMES : anim === 'attack' ? ATTACK_FRAMES : 1;
    const kinds = anim === 'attack' ? cfg.attacks : [null];
    kinds.forEach((kind, ki) => {
      const tag = anim === 'attack' && ki === 1 ? 'attack2' : anim;
      for (let frame = 0; frame < count; frame++) out.push({ view, anim, tag, kind, frame, alias: `${tag}_${view}_${frame}`, tagName: `${tag}_${view}` });
    });
  }
  if (cfg.animations.includes('down')) out.push({ view: 'right', anim: 'down', tag: 'down', kind: null, frame: 0, alias: 'down_0', tagName: 'down' });
  return out;
}

function renderFrame(cfg, spec, shift, lungeScale = 1) {
  const { W, H } = cfg, pad = Math.ceil(W * 0.5), drawView = spec.view === 'left' ? 'right' : spec.view;
  const c = new Raster(W, H, pad);
  const pose = posePlan({ anim: spec.anim, frame: spec.frame, size: [W, H] });
  pose.lunge *= lungeScale; if (pose.ext > 0) pose.ext *= lungeScale; pose.attack = spec.kind; pose.attackFrame = spec.frame;
  const ctx = { c, W, H, pal: pose.hurt ? flashed(cfg.palette) : cfg.palette, P: cfg.P, F: cfg.F, opts: cfg.opts, pose, view: drawView, plan: cfg.plan };
  cfg.spec.draw(ctx);
  const px = c.resolve({ outline: cfg.outline }).filter(Boolean);
  return { px, pad, ctx };
}

function place(px, pad, dx, W, H, left) {
  // A frame that is wider than the standing pose (a lunge, a flung head) slides to fit rather than clip.
  const xs = px.map(p => p.x - pad + dx), lo = Math.min(...xs), hi = Math.max(...xs);
  if (hi - lo + 1 <= W) { if (lo < 0) dx -= lo; else if (hi >= W) dx -= hi - W + 1; }
  const cell = [];
  let clipped = 0; const where = new Set();
  for (const p of px) {
    const x = p.x - pad + dx;
    if (x < 0 || x >= W || p.y < 0 || p.y >= H) { clipped++; where.add(x < 0 ? 'left' : x >= W ? 'right' : p.y < 0 ? 'top' : 'bottom'); continue; }
    cell.push({ ...p, x });
  }
  return { cell: left ? mirrorPixels(cell, W) : cell, clipped, where: [...where].join('/') };
}

/** True when every frame (without its lunge) fits the cell once centred, so a preset size never clips. */
function fits(cfg, specs) {
  const { W, H } = cfg;
  for (const spec of specs) {
    const { px, pad } = renderFrame(cfg, spec, 0, 0);
    if (!px.length) return false;
    const b = boundsOf(px);
    if (b.right - b.left + 1 > W || b.top < 0 || b.bottom > H - 1) return false;
  }
  return true;
}

/** A deterministic creature recipe expands to ordinary named, editable rect operations. */
export function generateCreatureRecipe(config) {
  let cfg = normalise(config), { W, H } = cfg;
  const specs = frameSpecs(cfg), base = cfg.P;
  // Long bodies, big heads and tails shrink together until the whole animation fits the cell.
  for (let k = 1; !fits(cfg, specs); k -= 0.06) {
    if (k < 0.5) break;
    cfg = { ...cfg, P: { ...base, bodyLength: base.bodyLength * k, tailLength: base.tailLength * k, headSize: base.headSize * Math.max(k, 0.7), bodyHeight: base.bodyHeight * Math.max(k, 0.8) } };
  }
  // Centre each view on the standing silhouette so the ground anchor sits under the body.
  const shifts = {}, keyOf = spec => (spec.anim === 'down' ? 'down' : spec.view === 'left' ? 'right' : spec.view);
  for (const key of new Set(specs.map(keyOf))) {
    const { px, pad } = renderFrame(cfg, key === 'down' ? { view: 'right', anim: 'down', frame: 0 } : { view: key, anim: 'idle', frame: 0 }, 0);
    const b = boundsOf(px);
    shifts[key] = Math.round(W / 2 - ((b.left + b.right + 1) / 2 - pad));
  }
  // Pick the column count (6 to 16) that leaves the fewest empty cells, nearest ten on ties.
  const total = specs.length;
  const empty = n => Math.ceil(total / n) * n - total;
  const cols = total <= 12 ? total : [...Array(11).keys()].map(i => i + 6).sort((x, y) => empty(x) - empty(y) || Math.abs(x - 10) - Math.abs(y - 10))[0], rows = Math.ceil(total / cols);
  const operations = [{ command: 'new', name: cfg.name, size: `${W}x${H}`, cols, rows, palette: 'pico8' }];
  const frames = [], tags = new Map();
  let index = 0;
  for (const spec of specs) {
    const cell = `${Math.floor(index / cols)},${index % cols}`; index++;
    // Lunges that would leave the cell are shortened rather than clipped.
    let result, scale = 1;
    for (;;) {
      const { px, pad } = renderFrame(cfg, spec, 0, scale);
      result = place(px, pad, shifts[keyOf(spec)], W, H, spec.view === 'left');
      if (!result.clipped || scale <= 0) break;
      scale = Math.max(0, scale - 0.25);
    }
    if (result.clipped) throw Error(`Creature frame ${spec.alias} does not fit ${W}x${H} (${result.clipped} pixels clipped at the ${result.where} edge). Use a larger size or smaller proportions.`);
    const { ops, groups } = toOperations(result.cell, W, H, cell);
    operations.push({ command: 'clear', cell }, { command: 'name', cell, as: spec.alias }, ...ops);
    for (const [part, shapes] of Object.entries(groups)) operations.push({ command: 'shape-group', sub: 'create', cell, name: part, shapes });
    const bounds = boundsOf(result.cell);
    frames.push({ alias: spec.alias, cell, anim: spec.tag, direction: spec.view, frame: spec.frame, ...(spec.kind ? { attack: spec.kind } : {}), bounds, hurt: spec.anim === 'hurt' || undefined });
    if (!tags.has(spec.tagName)) tags.set(spec.tagName, { cells: [], anim: spec.anim, tag: spec.tag, direction: spec.view });
    tags.get(spec.tagName).cells.push(cell);
  }
  for (const [name, t] of tags) operations.push({ command: 'group', sub: 'create', name, cells: t.cells, fps: cfg.fps[t.anim] });
  operations.push({ command: 'pivot', x: W / 2, y: H });
  return { operations, report: buildReport(cfg, frames, tags, shifts) };
}

function buildReport(cfg, frames, tags, shifts) {
  const { W, H } = cfg;
  const standing = Object.fromEntries(frames.filter(f => f.alias === `idle_${f.direction}_0` || f.alias === 'down_0').map(f => [f.alias, f]));
  const footprints = {};
  for (const view of cfg.emitViews) {
    const f = standing[`idle_${view}_0`] ?? frames.find(fr => fr.direction === view) ?? frames[0];
    const bw = f.bounds.right - f.bounds.left + 1;
    const w = Math.max(2, Math.round(bw * 0.7)), h = Math.max(2, Math.round(H * 0.22));
    footprints[view] = { x: Math.round(W / 2 - w / 2), y: H - h, w, h };
  }
  const base = footprints.right ?? footprints.left ?? Object.values(footprints)[0];
  const direction = { right: [1, 0], left: [-1, 0], front: [0, 1], back: [0, -1] };
  const stride = Math.max(2, Math.round(W * 0.3));
  for (const f of frames) {
    if (f.anim === 'walk') f.locomotion = { direction: direction[f.direction], frameCount: WALK_FRAMES, frameDistance: stride / WALK_FRAMES, cycleDistance: stride, rootCompensation: 'none', fps: cfg.fps.walk };
    f.checks = [];
    if (f.bounds.bottom !== H - 1) f.checks.push('ground-contact');
  }
  return {
    version: 1, ok: true, kind: 'creature', plan: cfg.plan, name: cfg.name, palette: cfg.paletteName,
    cellSize: { width: W, height: H },
    // Source pixels. `ground` is the bottom edge of the cell, the row the feet stand on; x is the cell centre.
    ground: H, groundAnchor: { x: W / 2, y: H },
    footprint: base, footprints,
    features: [...cfg.F.keys()], attacks: cfg.attacks,
    directions: { down: 'front', up: 'back', left: 'left', right: 'right' },
    aliases: { idle: 'idle_{direction}_0', walk: 'walk_{direction}_{frame}', attack: 'attack_{direction}_{frame}', ...(cfg.attacks.length > 1 ? { attack2: 'attack2_{direction}_{frame}' } : {}), hurt: 'hurt_{direction}_0', down: 'down_0' },
    animations: Object.fromEntries([...tags].map(([name, t]) => [name, { frames: t.cells.length, fps: cfg.fps[t.anim], loop: t.anim === 'idle' || t.anim === 'walk' }])),
    frames,
  };
}

export { PALETTE_NAMES, GAITS, ATTACKS };
