import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

export const buildTool = Object.freeze({ name: 'agent-sprites', version: JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version });

export function resolveBuildSource(configPath, config) {
  const hasInline = ['character', 'environment', 'ui', 'creature', 'tileset'].some(key => Object.hasOwn(config, key));
  // Legacy file recipes permit an empty unused source. Inline declarations
  // remain strict so malformed/mixed declarations never select another source.
  const sources = hasInline
    ? ['ops', 'generator', 'character', 'environment', 'ui', 'creature', 'tileset'].filter(key => Object.hasOwn(config, key))
    : ['ops', 'generator'].filter(key => Boolean(config[key]));
  if (sources.length !== 1) throw new Error('Specify exactly one ops JSON file, Node generator script, character recipe, environment recipe, UI recipe, creature recipe, or tileset recipe.');
  const sourceKind = sources[0], inline = ['character', 'environment', 'ui', 'creature', 'tileset'].includes(sourceKind);
  if (config.trim && sourceKind === 'ui') throw new Error('trim is not supported for UI builds: the UI runtime composites whole glyph and skin cells.');
  if (inline) {
    if (!config[sourceKind] || typeof config[sourceKind] !== 'object' || Array.isArray(config[sourceKind])) throw new Error(`${sourceKind} source must be an inline object.`);
  } else if (typeof config[sourceKind] !== 'string' || !config[sourceKind]) throw new Error(`${sourceKind} source must be a nonempty file path.`);
  const source = inline ? configPath : realpathSync(resolve(dirname(configPath), config[sourceKind]));
  return { sourceKind, inline, source };
}

// Generator imports and external assets are explicit: inspecting a build must
// never run its generator merely to discover dependencies.
export function snapshotBuildInputs(configPath, config, source) {
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
  for (const path of [configPath, source, ...tilesetSources, ...(config.inputs ?? []).map(path => resolve(base, path))]) {
    const canonical = realpathSync(path), key = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
    if (seen.has(key)) continue;
    if (!statSync(canonical).isFile()) throw new Error(`Build input must be a file: ${path}`);
    seen.add(key);
    inputs.push({ path: relative(base, path).split(sep).join('/'), sha256: createHash('sha256').update(readFileSync(canonical)).digest('hex') });
  }
  return { tool: { ...buildTool }, inputs };
}
