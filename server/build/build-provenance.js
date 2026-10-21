import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

import { acquireBuildTool } from './producer-identity.js';
export { buildTool } from './producer-identity.js';

export function resolveBuildSource(configPath, config) {
  const hasInline = ['character', 'environment', 'native', 'ui', 'creature', 'tileset', 'animation'].some(key => Object.hasOwn(config, key));
  // Legacy file recipes permit an empty unused source. Inline declarations
  // remain strict so malformed/mixed declarations never select another source.
  const sources = hasInline
    ? ['ops', 'generator', 'character', 'environment', 'native', 'ui', 'creature', 'tileset', 'animation'].filter(key => Object.hasOwn(config, key))
    : ['ops', 'generator'].filter(key => Boolean(config[key]));
  if (sources.length !== 1) throw new Error('Specify exactly one ops JSON file, Node generator script, character recipe, environment recipe, native recipe, UI recipe, creature recipe, tileset recipe, or animation composition.');
  const sourceKind = sources[0], inline = ['character', 'environment', 'native', 'ui', 'creature', 'tileset', 'animation'].includes(sourceKind);
  if (config.trim && sourceKind === 'ui') throw new Error('trim is not supported for UI builds: the UI runtime composites whole glyph and skin cells.');
  if (inline) {
    if (!config[sourceKind] || typeof config[sourceKind] !== 'object' || Array.isArray(config[sourceKind])) throw new Error(`${sourceKind} source must be an inline object.`);
  } else if (typeof config[sourceKind] !== 'string' || !config[sourceKind]) throw new Error(`${sourceKind} source must be a nonempty file path.`);
  const source = inline ? configPath : realpathSync(resolve(dirname(configPath), config[sourceKind]));
  return { sourceKind, inline, source };
}

// Generator imports and external assets are explicit: inspecting a build must
// never run its generator merely to discover dependencies.
export function snapshotBuildInputs(configPath, config, source, tool = acquireBuildTool()) {
  if (config.inputs !== undefined && (!Array.isArray(config.inputs) || config.inputs.some(path => typeof path !== 'string' || !path.trim()))) {
    throw new Error('inputs must be an array of nonempty file paths relative to the build config.');
  }
  const base = dirname(configPath), seen = new Set(), inputs = [];
  // A tileset's .pxl sources are its real inputs; tracking them needs no separate declaration.
  const tilesetSources = Array.isArray(config.tileset?.sources) ? config.tileset.sources.filter(path => typeof path === 'string' && path).map((path, n) => {
    const full = resolve(base, path);
    if (!existsSync(full) || !statSync(full).isFile()) throw new Error(`tileset.sources[${n}] "${path}" is not a file.`);
    return full;
  }) : [];
  // Another set's built atlas and sheet are inputs too, so a rebuilt source set makes this one stale.
  const tilesetImports = config.tileset?.imports && typeof config.tileset.imports === 'object' ? Object.entries(config.tileset.imports).flatMap(([name, path]) => {
    const atlas = resolve(base, String(path));
    if (!existsSync(atlas) || !statSync(atlas).isFile()) throw new Error(`tileset.imports.${name} "${path}" is not a file; build that set first.`);
    const image = JSON.parse(readFileSync(atlas, 'utf8'))?.meta?.image;
    return typeof image === 'string' ? [atlas, resolve(dirname(atlas), image)] : [atlas];
  }) : [];
  // Child projects are actual animation inputs, even when the declaration has no explicit inputs list.
  const animationSources = config.animation?.parts && typeof config.animation.parts === 'object'
    ? Object.entries(config.animation.parts).flatMap(([name, part]) => {
      if (!part || typeof part !== 'object' || !Object.hasOwn(part, 'project')) return [];
      const path = part.project;
      if (typeof path !== 'string' || !path.length || path.includes('\\') || path.includes('\0') || /^(?:\/|[a-z]:)/i.test(path)) throw new Error(`animation.parts.${name}.project must use a portable relative path.`);
      const full = resolve(base, path);
      if (!existsSync(full) || !statSync(full).isFile()) throw new Error(`animation.parts.${name}.project "${path}" is not a file.`);
      return [full];
    }) : [];
  for (const path of [configPath, source, ...tilesetSources, ...tilesetImports, ...animationSources, ...(config.inputs ?? []).map(path => resolve(base, path))]) {
    const canonical = realpathSync(path), key = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
    if (seen.has(key)) continue;
    if (!statSync(canonical).isFile()) throw new Error(`Build input must be a file: ${path}`);
    seen.add(key);
    inputs.push({ path: relative(base, path).split(sep).join('/'), sha256: createHash('sha256').update(readFileSync(canonical)).digest('hex') });
  }
  return { tool, inputs };
}
