#!/usr/bin/env node
// Native CI admission: decide whether a change set needs the native platform matrix.
//
// A change set is classified as one of:
//   native             native source, dependency, test or workflow change. Admits the matrix.
//   unknown            a path no rule names, or an input that cannot be read. Admits the matrix.
//   identity-only      only the version fields of package.json, package-lock.json (both places),
//                      .claude-plugin/plugin.json and .claude-plugin/marketplace.json changed.
//                      Gets the cheap version identity check instead of the matrix.
//   documentation-only only prose and docs. Needs neither.
//
// Unknown widens: anything not positively recognised as identity or documentation admits the matrix.
//
//   node scripts/native-admission.mjs classify --event <name> [--base <sha> --head <sha>]
//   node scripts/native-admission.mjs check-identity [--root <dir>]

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const CLASSES = Object.freeze({
  NATIVE: 'native',
  UNKNOWN: 'unknown',
  IDENTITY: 'identity-only',
  DOCS: 'documentation-only',
});

// Events that always run the matrix: every release and every manual dispatch.
export const ALWAYS_ADMIT_EVENTS = Object.freeze(['release', 'workflow_dispatch']);

// Remove the fields that a version bump is allowed to change, in place.
const VERSION_FIELDS = {
  'package.json': json => { delete json.version; },
  'package-lock.json': json => {
    delete json.version;
    if (json.packages && typeof json.packages === 'object' && json.packages['']) delete json.packages[''].version;
  },
  '.claude-plugin/plugin.json': json => { delete json.version; },
  '.claude-plugin/marketplace.json': json => {
    for (const plugin of Array.isArray(json.plugins) ? json.plugins : []) {
      if (plugin && typeof plugin === 'object') delete plugin.version;
    }
  },
};
export const IDENTITY_FILES = Object.freeze(Object.keys(VERSION_FIELDS));

// Matched case-insensitively so a differently cased checkout can never hide a native path.
const NATIVE_PREFIXES = ['.github/', '.claude-plugin/', 'scripts/', 'server/', 'tests/'];
const NATIVE_EXACT = new Set(['vitest.config.js']);
const NATIVE_PATTERNS = [/^package[^/]*\.json$/];

const DOC_EXACT = new Set(['LICENSE']);
const DOC_PATTERNS = [/^[^/]+\.md$/, /^docs\//, /^(skills|recipes)\/.+\.md$/];

export function normalizePath(raw) {
  if (typeof raw !== 'string') return null;
  let path = raw.replace(/\\/g, '/').trim();
  while (path.startsWith('./')) path = path.slice(2);
  if (!path || path.startsWith('/') || /^[a-z]:/i.test(path)) return null;
  path = posix.normalize(path);
  if (path === '.' || path === '..' || path.startsWith('../')) return null;
  return path;
}

function classifyPath(path, versionOnly) {
  if (path === null) return CLASSES.UNKNOWN;
  const lower = path.toLowerCase();
  if (IDENTITY_FILES.includes(lower)) return versionOnly.has(path) ? CLASSES.IDENTITY : CLASSES.NATIVE;
  if (NATIVE_EXACT.has(lower) || NATIVE_PREFIXES.some(prefix => lower.startsWith(prefix))
      || NATIVE_PATTERNS.some(pattern => pattern.test(lower))) return CLASSES.NATIVE;
  if (DOC_EXACT.has(path) || DOC_PATTERNS.some(pattern => pattern.test(path))) return CLASSES.DOCS;
  return CLASSES.UNKNOWN;
}

function summarize(files, reason) {
  const present = new Set(files.map(file => file.class));
  let result = CLASSES.UNKNOWN;
  if (present.has(CLASSES.NATIVE)) result = CLASSES.NATIVE;
  else if (present.has(CLASSES.UNKNOWN) || files.length === 0) result = CLASSES.UNKNOWN;
  else if (present.has(CLASSES.IDENTITY)) result = CLASSES.IDENTITY;
  else result = CLASSES.DOCS;
  return {
    class: result,
    admitsNative: result === CLASSES.NATIVE || result === CLASSES.UNKNOWN,
    identity: result === CLASSES.IDENTITY,
    files,
    ...(reason ? { reason } : {}),
  };
}

// paths: changed file paths. versionOnly: the identity files whose diff touches nothing but
// version fields (an iterable of paths). Without that fact an identity file is a native change.
export function classify(paths, versionOnly = []) {
  const trusted = new Set([...versionOnly].map(normalizePath).filter(Boolean));
  const files = [...paths].map(raw => {
    const path = normalizePath(raw);
    return { path: path ?? String(raw), class: classifyPath(path, trusted) };
  });
  return summarize(files);
}

export function isVersionOnlyChange(path, before, after) {
  const strip = VERSION_FIELDS[normalizePath(path)?.toLowerCase()];
  if (!strip) return false;
  try {
    const a = JSON.parse(before), b = JSON.parse(after);
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    strip(a); strip(b);
    return isDeepStrictEqual(a, b);
  } catch { return false; }
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
}

// Classify what `head` adds on top of its merge base with `base` (the three dot range).
// Anything git cannot answer, such as a missing or unreachable commit, is unknown.
export function classifyRange(base, head, { cwd = process.cwd() } = {}) {
  try {
    if (!base || !head || /^0+$/.test(base) || /^0+$/.test(head)) throw new Error('no usable base and head commits');
    const mergeBase = git(['merge-base', base, head], cwd).trim();
    const changed = git(['diff', '--name-only', '--no-renames', '-z', mergeBase, head], cwd).split('\0').filter(Boolean);
    const versionOnly = changed.filter(path => {
      if (!IDENTITY_FILES.includes(path)) return false;
      try { return isVersionOnlyChange(path, git(['show', `${mergeBase}:${path}`], cwd), git(['show', `${head}:${path}`], cwd)); }
      catch { return false; }
    });
    return classify(changed, versionOnly);
  } catch (error) {
    return summarize([], `cannot read the change set (${String(error.message).split('\n')[0]}); widening`);
  }
}

export function classifyEvent(event, range) {
  if (ALWAYS_ADMIT_EVENTS.includes(event)) {
    return { class: CLASSES.NATIVE, admitsNative: true, identity: false, files: [], reason: `${event} always runs the native matrix` };
  }
  return range();
}

// The four version files must agree. Returns { versions, problems }.
export function checkIdentity(root = process.cwd()) {
  const read = file => JSON.parse(readFileSync(resolve(root, file), 'utf8'));
  const problems = [], versions = [];
  const take = (file, field, value) => {
    versions.push({ file, field, version: value });
    if (typeof value !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value)) {
      problems.push(`${file} ${field} is not a semantic version: ${JSON.stringify(value)}`);
    }
  };
  const load = file => { try { return read(file); } catch (error) { problems.push(`${file} cannot be read: ${error.message}`); return null; } };
  const pkg = load('package.json'), lock = load('package-lock.json');
  const plugin = load('.claude-plugin/plugin.json'), market = load('.claude-plugin/marketplace.json');
  if (pkg) take('package.json', 'version', pkg.version);
  if (lock) { take('package-lock.json', 'version', lock.version); take('package-lock.json', 'packages[""].version', lock.packages?.['']?.version); }
  if (plugin) take('.claude-plugin/plugin.json', 'version', plugin.version);
  if (market) {
    const entries = (Array.isArray(market.plugins) ? market.plugins : []).filter(entry => entry?.name === (pkg?.name ?? plugin?.name));
    if (entries.length === 0) problems.push('.claude-plugin/marketplace.json lists no plugin named like the package');
    entries.forEach((entry, index) => take('.claude-plugin/marketplace.json', `plugins[${index}].version`, entry.version));
  }
  const distinct = [...new Set(versions.map(entry => entry.version))];
  if (distinct.length > 1) {
    problems.push(`versions disagree: ${versions.map(entry => `${entry.file} ${entry.field}=${entry.version}`).join(', ')}`);
  }
  return { versions, problems };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith('--')) throw new Error(`unexpected argument ${arg}`);
    options[arg.slice(2)] = argv[++index];
  }
  return options;
}

function main(argv) {
  const [command, ...rest] = argv;
  const options = parseArgs(rest);
  if (command === 'classify') {
    const result = classifyEvent(options.event, () => classifyRange(options.base, options.head));
    const lines = [`class=${result.class}`, `native=${result.admitsNative}`, `identity=${result.identity}`];
    console.log(JSON.stringify({ event: options.event ?? null, ...result }, null, 2));
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
    return 0;
  }
  if (command === 'check-identity') {
    const { versions, problems } = checkIdentity(options.root);
    for (const entry of versions) console.log(`${entry.file} ${entry.field} ${entry.version}`);
    for (const problem of problems) console.error(`error: ${problem}`);
    return problems.length ? 1 : 0;
  }
  console.error('usage: native-admission.mjs classify --event <name> [--base <sha> --head <sha>] | check-identity [--root <dir>]');
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(`error: ${error.message}`); process.exitCode = 2; }
}
