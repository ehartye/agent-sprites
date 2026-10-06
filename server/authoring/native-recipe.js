import { costumeTemplate } from './native/costume-template.mjs';
import { finishNative } from './native/native-mannequin.mjs';
import { drawNativeGear, parseGear } from './native/native-gear.mjs';
import { nativeReport } from './native/native-report.mjs';
import { expandMotifs, MOTIF_NAMES } from './native/wasteland-motifs.mjs';
import { NATIVE_PRESETS, PRESET_NAMES, SKIN_RAMPS, HAIR_RAMPS } from './native/wasteland-presets.mjs';
import { addActionFrames, ACTIONS, TOOLS, POSTURES } from './native/native-actions.mjs';
import { SKIN_TONES } from '../engine/skin-tones.js';

const KEYS = ['name', 'id', 'preset', 'kind', 'outfit', 'tone', 'wig', 'materials', 'colors', 'motifs', 'omit', 'gear', 'actions', 'tool', 'skin', 'hair', 'posture', 'armMaterial', 'handMaterial', 'bodyMaterial', 'replaceHead', 'only'];
const HEX = /^#[\da-f]{6}$/i;
const ID = /^[a-z][a-z0-9-]*$/;
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const ROLES = ['outline', 'shadow', 'base', 'highlight'];
// Garment palette the jacket outfit starts from; '@cloth.role' motif slots follow it until overridden.
const CLOTH_DEFAULT = { outline: '#243449', shadow: '#32576a', base: '#467f8a', highlight: '#7db4ab' };
const TROUSERS_DEFAULT = { outline: '#283140', shadow: '#394755', base: '#526673', highlight: '#7d9098' };

const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
function check(value, label, keys) {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`Unknown ${label} field: ${key}`);
}
const motifName = entry => (typeof entry === 'string' ? entry : entry?.name);

/** Merge a named preset under the caller's fields. Caller motifs replace preset motifs of the same name. */
function resolveConfig(config) {
  const preset = config.preset === undefined ? {} : (Object.hasOwn(NATIVE_PRESETS, config.preset) ? NATIVE_PRESETS[config.preset] : undefined);
  if (config.preset !== undefined && !preset) throw new Error(`Unknown native preset "${config.preset}". Choose from: ${PRESET_NAMES.join(', ')}.`);
  const own = config.motifs ?? [];
  if (!Array.isArray(own)) throw new Error('motifs must be an array');
  if (config.omit !== undefined && (!Array.isArray(config.omit) || config.omit.some(n => typeof n !== 'string'))) throw new Error('native.omit must be an array of motif names.');
  if (config.materials !== undefined && !isObject(config.materials)) throw new Error('native.materials must be an object of material ramps.');
  if (config.colors !== undefined && !isObject(config.colors)) throw new Error('native.colors must be an object.');
  if (config.gear !== undefined && !Array.isArray(config.gear)) throw new Error('native.gear must be an array.');
  const dropped = new Set([...(config.omit ?? []), ...own.map(motifName)]);
  const merged = { ...preset, ...config };
  // Overriding the body of a preset also overrides its wardrobe default (a large brute becomes a jacketed adult).
  if (config.outfit === undefined && config.kind !== undefined && config.kind !== preset.kind) delete merged.outfit;
  const named = (value, ramps, label) => (typeof value === 'string' ? (Object.hasOwn(ramps, value) ? ramps[value] : undefined) ?? (() => { throw new Error(`Unknown ${label} ramp "${value}". Choose from: ${Object.keys(ramps).join(', ')}.`); })() : value);
  merged.materials = { ...preset.materials, ...config.materials };
  if (config.skin !== undefined) merged.materials.skin = named(config.skin, SKIN_RAMPS, 'skin');
  // Hair only applies to a wig: a wigless character ignores a hair shorthand (so one hair choice can be set on every NPC).
  if (config.hair !== undefined && (merged.wig ?? 'none') !== 'none') merged.materials.hair = named(config.hair, HAIR_RAMPS, 'hair');
  merged.colors = { ...preset.colors, ...config.colors };
  merged.motifs = [...(preset.motifs ?? []).filter(entry => !dropped.has(motifName(entry))), ...own];
  return merged;
}

/**
 * Inline native-character recipe: declarative costume JSON in, a 16x32 four-direction
 * sheet out. `native: {name, kind, outfit, tone, wig, materials, colors, motifs, ...}`
 * runs the same pipeline as the cast example, with no copied scripts. Returns
 * ordinary editable operations plus the native character report.
 */
export function generateNativeRecipe(config) {
  check(config, 'native', KEYS);
  const c = resolveConfig(config);
  if (typeof c.name !== 'string' || !NAME.test(c.name)) throw new Error('native.name must be a project name of letters, digits, hyphens or underscores.');
  const id = c.id ?? c.name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^[^a-z]+/, 'c');
  if (!ID.test(id)) throw new Error('native.id must be lowercase letters, digits and hyphens.');
  const kind = c.kind ?? 'adult';
  if (!['adult', 'child', 'large'].includes(kind)) throw new Error('native.kind must be adult, child or large.');
  const outfit = c.outfit ?? (kind === 'large' ? 'none' : 'jacket');
  if (!['jacket', 'dress', 'none'].includes(outfit)) throw new Error('native.outfit must be jacket, dress or none (large body only).');
  const tone = c.tone ?? 'peach';
  if (!SKIN_TONES.some(t => t.id === tone)) throw new Error(`native.tone must be one of ${SKIN_TONES.map(t => t.id).join(', ')}.`);
  const wig = c.wig ?? 'none';
  // A preset's ramps for garments this body does not have are skipped; the caller's own must exist.
  const present = ['skin', 'cloth', 'trim', 'shoes', ...(outfit === 'jacket' ? ['trousers'] : []), ...(wig !== 'none' ? ['hair'] : [])];
  const own = config.materials ?? {};
  for (const material of Object.keys(c.materials)) if (!present.includes(material) && !(material in own)) delete c.materials[material];
  if (kind === 'large') for (const material of Object.keys(c.materials)) if (material !== 'skin' && !(material in own)) delete c.materials[material];
  for (const [key, value] of Object.entries(c.colors)) if (!HEX.test(value)) throw new Error(`native.colors.${key} must be a six-digit hex.`);
  for (const [material, ramp] of Object.entries(c.materials)) {
    check(ramp, `native.materials.${material}`, ROLES);
    if (ROLES.some(role => !HEX.test(ramp[role] ?? ''))) throw new Error(`native.materials.${material}: provide four hex colour roles (${ROLES.join(', ')}).`);
  }
  const skinRamp = c.materials.skin ?? SKIN_TONES.find(t => t.id === tone).colors;
  const { motifs, meta } = expandMotifs(c.motifs, { materials: c.materials, kind, fallbackRamps: { cloth: CLOTH_DEFAULT, trousers: TROUSERS_DEFAULT, hair: HAIR_RAMPS.brown, skin: skinRamp } });
  if (c.bodyMaterial !== undefined && (typeof c.bodyMaterial !== 'string' || !ID.test(c.bodyMaterial))) throw new Error('native.bodyMaterial must be a lowercase material name such as casing.');
  const profile = {
    id, projectName: c.name, kind, outfit, tone, wig,
    // a hair ramp on a wigless body, or trousers under a dress, still colour motifs ('@hair.base') but have no body group to recolour
    materials: Object.fromEntries(Object.entries(c.materials).filter(([m]) => !(m === 'hair' && wig === 'none') && !(m === 'trousers' && outfit !== 'jacket'))),
    colors: { o: '#26333f', ...c.colors }, motifs,
    ...(c.replaceHead || meta.some(m => m.replaceHead) ? { replaceHead: true } : {}),
    ...(c.bodyMaterial ? { bodyMaterial: c.bodyMaterial } : {}),
  };
  if (profile.replaceHead && !motifs.some(m => m.part === 'head')) throw new Error('replaceHead needs a replacement head motif (a motif with part: "head"), for example grey-alien-head.');
  let ops = costumeTemplate(profile);
  const gear = parseGear(c.gear ?? []);
  ops = drawNativeGear(ops, kind, gear);
  let actionInfo = {};
  const wanted = c.actions === undefined || c.actions === false ? [] : c.actions === true ? [...ACTIONS] : c.actions;
  if (!Array.isArray(wanted) || wanted.some(a => !ACTIONS.includes(a))) throw new Error(`native.actions must be true or a list of: ${ACTIONS.join(', ')}.`);
  if (c.tool !== undefined && !TOOLS.includes(c.tool)) throw new Error(`native.tool must be one of ${TOOLS.join(', ')}.`);
  if (c.posture !== undefined && !POSTURES.includes(c.posture)) throw new Error(`native.posture must be one of ${POSTURES.join(', ')}.`);
  if (wanted.length || c.posture) {
    if (kind === 'child') throw new Error('Action poses and postures are authored for the adult and large bodies, not child.');
    ({ ops, info: actionInfo } = addActionFrames(ops, {
      kind, actions: wanted, tool: c.tool ?? 'hoe', posture: c.posture,
      armMaterial: c.armMaterial, handMaterial: c.handMaterial,
      overArms: new Map(meta.map((m, index) => [index, m.overArms])),
      outline: profile.colors.o,
    }));
  }
  // Costume edge pixels use the profile's outline colour without an outline group.
  const finished = finishNative(ops, [profile.colors.o]);
  // The report describes the whole character even when the sheet is an overlay of it.
  const report = nativeReport(finished, kind, { gear, actions: actionInfo });
  return { operations: c.only === undefined ? finished : overlayOnly(finished, motifs, c.only), report };
}

/**
 * Keep only the pixels of the named motifs: the sheet becomes a transparent overlay with the same frame layout as the full
 * character, for games that composite a body, hair, facial hair and headwear at runtime. Every other pixel and its shape
 * group is dropped; the frames, names and poses stay, so the overlay lines up with the body built from the same recipe.
 */
function overlayOnly(ops, motifs, only) {
  if (!Array.isArray(only) || !only.length || only.some(n => typeof n !== 'string')) throw new Error('native.only must be a non-empty array of motif names.');
  const used = new Set(motifs.map(m => m.name));
  for (const name of only) if (!used.has(name)) throw new Error(`native.only names "${name}", which is not one of the character's motifs.`);
  const keep = motifs.map((m, index) => (only.includes(m.name) ? index : -1)).filter(index => index >= 0);
  const kept = name => keep.some(index => name.startsWith(`costume-${index}-`));
  const out = [];
  for (const op of ops) {
    if (op.command === 'draw' && !kept(op.name)) continue;
    if (op.command === 'shape-group') {
      const shapes = op.shapes.filter(kept);
      if (!shapes.length) continue;
      out.push({ ...op, shapes });
      continue;
    }
    out.push(op);
  }
  return out;
}

export { MOTIF_NAMES, PRESET_NAMES };
