// Declared source and package metadata, not native-binary or loaded-byte closure.
// Load this before renderer modules; a long-lived producer must restart after edits.
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { fingerprintSource } from '../../scripts/source-fingerprint.js';

const producerRoot = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
const dependencyNames = ['canvas', 'better-sqlite3', 'sharp'];
const versionPattern = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;
const readJSON = path => JSON.parse(readFileSync(path, 'utf8'));
export const buildTool = Object.freeze({ name: 'agent-sprites', version: readJSON(join(producerRoot, 'package.json')).version });

// Resolve the actual main entry, then its package owner. sharp intentionally does
// not export sharp/package.json. Do not require entries or load native bindings.
export function resolveDependencyVersions(root) {
  const require = createRequire(join(root, 'package.json'));
  return Object.fromEntries(dependencyNames.map(name => {
    let directory = dirname(require.resolve(name));
    for (let depth = 0; depth < 16; depth++) {
      const path = join(directory, 'package.json');
      if (existsSync(path)) {
        const pkg = readJSON(path);
        if (pkg.name !== name || typeof pkg.version !== 'string' || !versionPattern.test(pkg.version)) throw new Error(`Invalid ${name} package metadata at ${path}`);
        return [name, pkg.version];
      }
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    throw new Error(`Missing ${name} package metadata for resolved entry`);
  }));
}

export function acquireBuildTool() {
  const pkg = readJSON(join(producerRoot, 'package.json'));
  if (pkg.name !== 'agent-sprites' || typeof pkg.version !== 'string' || !versionPattern.test(pkg.version)) throw new Error('Invalid agent-sprites package/version');
  const { fingerprint } = fingerprintSource(producerRoot);
  return { name: pkg.name, version: pkg.version, identity: {
    version: 1,
    source: { algorithm: 'sha256-runtime-source-v1', scope: 'package+lock+scripts+server', sha256: fingerprint },
    node: { version: process.version, modules: process.versions.modules, platform: process.platform, arch: process.arch },
    dependencies: resolveDependencyVersions(producerRoot),
  } };
}

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function validIdentity(identity) {
  return object(identity) && identity.version === 1 && object(identity.source)
    && identity.source.algorithm === 'sha256-runtime-source-v1' && identity.source.scope === 'package+lock+scripts+server'
    && typeof identity.source.sha256 === 'string' && /^[a-f0-9]{64}$/.test(identity.source.sha256)
    && object(identity.node) && typeof identity.node.version === 'string' && /^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(identity.node.version)
    && typeof identity.node.modules === 'string' && /^\d+$/.test(identity.node.modules)
    && ['platform', 'arch'].every(key => typeof identity.node[key] === 'string' && identity.node[key].length > 0)
    && object(identity.dependencies) && dependencyNames.every(name => typeof identity.dependencies[name] === 'string' && versionPattern.test(identity.dependencies[name]));
}

// Compare validated fixed fields; prior JSON property order is irrelevant.
export function compareBuildTool(prior, current) {
  const reasons = [], reason = (code, message) => reasons.push({ code, message });
  if (prior?.name !== current.name || prior?.version !== current.version) reason('tool-version', `Built with ${prior?.name} ${prior?.version}; current tool is ${current.name} ${current.version}.`);
  if (!prior || !Object.hasOwn(prior, 'identity')) reason('tool-identity-missing', 'Legacy output has no declared tool identity; rebuild to establish freshness.');
  else if (!validIdentity(prior.identity)) reason('tool-identity-invalid', 'Malformed declared tool identity; rebuild to establish freshness.');
  else {
    if (prior.identity.source.sha256 !== current.identity.source.sha256) reason('tool-source-changed', 'Declared producer source changed; rebuild with the current producer.');
    if (['version', 'modules', 'platform', 'arch'].some(key => prior.identity.node[key] !== current.identity.node[key])
      || dependencyNames.some(name => prior.identity.dependencies[name] !== current.identity.dependencies[name])) reason('toolchain-changed', 'Declared Node/process or resolved dependency versions changed; rebuild with the current toolchain.');
  }
  return reasons;
}

const loadedTool = acquireBuildTool();
Object.freeze(loadedTool.identity.source); Object.freeze(loadedTool.identity.node); Object.freeze(loadedTool.identity.dependencies);
Object.freeze(loadedTool.identity); Object.freeze(loadedTool);

export function assertLoadedProducer(current = acquireBuildTool()) {
  if (compareBuildTool(loadedTool, current).length) throw new Error('Producer source or dependency metadata changed after module load; restart required before building.');
  return current;
}

export function assertToolStable(before, current, context) {
  if (compareBuildTool(before, current).length) throw new Error(`Build tool changed during ${context}; retry with stable producer source and metadata (restart required).`);
}
