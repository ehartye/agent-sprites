import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

export const buildTool = Object.freeze({ name: 'agent-sprites', version: JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version });

export function resolveBuildSource(configPath, config) {
  const hasInline = ['character', 'environment', 'ui', 'creature'].some(key => Object.hasOwn(config, key));
  // Legacy file recipes permit an empty unused source. Inline declarations
  // remain strict so malformed/mixed declarations never select another source.
  const sources = hasInline
    ? ['ops', 'generator', 'character', 'environment', 'ui', 'creature'].filter(key => Object.hasOwn(config, key))
    : ['ops', 'generator'].filter(key => Boolean(config[key]));
  if (sources.length !== 1) throw new Error('Specify exactly one ops JSON file, Node generator script, character recipe, environment recipe, UI recipe, or creature recipe.');
  const sourceKind = sources[0], inline = ['character', 'environment', 'ui', 'creature'].includes(sourceKind);
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
  for (const path of [configPath, source, ...(config.inputs ?? []).map(path => resolve(base, path))]) {
    const canonical = realpathSync(path), key = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
    if (seen.has(key)) continue;
    if (!statSync(canonical).isFile()) throw new Error(`Build input must be a file: ${path}`);
    seen.add(key);
    inputs.push({ path: relative(base, path).split(sep).join('/'), sha256: createHash('sha256').update(readFileSync(canonical)).digest('hex') });
  }
  return { tool: { ...buildTool }, inputs };
}
