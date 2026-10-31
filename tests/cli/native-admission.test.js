import { test, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  classify, classifyRange, classifyEvent, isVersionOnlyChange, normalizePath, IDENTITY_FILES,
} from '../../scripts/native-admission.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const script = join(root, 'scripts', 'native-admission.mjs');
const workflow = readFileSync(join(root, '.github', 'workflows', 'native-compatibility.yml'), 'utf8').replace(/\r\n/g, '\n');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
const has = commit => { try { git('cat-file', '-e', `${commit}^{commit}`); git('cat-file', '-e', `${commit}^^{commit}`); return true; } catch { return false; } };
const changed = commit => git('diff', '--name-only', '--no-renames', `${commit}^`, commit).split('\n').filter(Boolean).sort();
const show = (rev, path) => git('show', `${rev}:${path}`);
const RELEASE = '1d4237c', FEATURE = '8df2727';

// The commits are on main. A shallow clone lacks them, so those cases skip and say why.
const commitCase = (name, commit, check) => {
  const available = has(commit);
  const title = available ? name : `${name} (skipped: commit ${commit} or its parent is not in this clone, probably shallow)`;
  test.skipIf(!available)(title, check);
};

commitCase('release commit changes only version fields in the four identity files and is identity-only', RELEASE, () => {
  expect(changed(RELEASE)).toEqual([...IDENTITY_FILES].sort());
  const result = classifyRange(`${RELEASE}^`, RELEASE, { cwd: root });
  expect(result.class).toBe('identity-only');
  expect(result.admitsNative).toBe(false);
  expect(result.identity).toBe(true);
  expect(result.files.map(file => file.class)).toEqual(Array(4).fill('identity-only'));
});

commitCase('release commit paths alone, without the version-only fact, are native', RELEASE, () => {
  const result = classify(changed(RELEASE));
  expect(result.class).toBe('native');
  expect(result.admitsNative).toBe(true);
});

commitCase('feature commit with server, scripts and tests admits the native matrix', FEATURE, () => {
  expect(changed(FEATURE)).toEqual(expect.arrayContaining(['server/engine/pixel-step.js', 'scripts/sprite.js', 'tests/engine/pixel-step.test.js']));
  const result = classifyRange(`${FEATURE}^`, FEATURE, { cwd: root });
  expect(result.class).toBe('native');
  expect(result.admitsNative).toBe(true);
  expect(result.identity).toBe(false);
});

commitCase('a dependency change in package-lock.json beyond the version fields is native', RELEASE, () => {
  const before = show(`${RELEASE}^`, 'package-lock.json');
  const after = show(RELEASE, 'package-lock.json');
  expect(isVersionOnlyChange('package-lock.json', before, after)).toBe(true);
  const lock = JSON.parse(after);
  const dependency = Object.keys(lock.packages).find(name => name.startsWith('node_modules/') && lock.packages[name].version);
  lock.packages[dependency].version = '0.0.0-changed';
  expect(isVersionOnlyChange('package-lock.json', before, JSON.stringify(lock, null, 2))).toBe(false);
  lock.packages[dependency].version = JSON.parse(after).packages[dependency].version;
  lock.packages[''].dependencies = { ...lock.packages[''].dependencies, 'added-dependency': '1.0.0' };
  expect(isVersionOnlyChange('package-lock.json', before, JSON.stringify(lock, null, 2))).toBe(false);
  // The file is only identity-only when the diff proved it; otherwise it admits the matrix.
  expect(classify(['package-lock.json'], []).admitsNative).toBe(true);
  expect(classify(['package-lock.json', 'package.json'], ['package.json']).class).toBe('native');
});

// Synthetic change sets: [name, paths, versionOnly, class, admitsNative]
test.each([
  ['README only', ['README.md'], [], 'documentation-only', false],
  ['docs tree', ['docs/testing/plan.md', 'docs/img/a.png'], [], 'documentation-only', false],
  ['README, docs and skill prose', ['README.md', 'docs/a.md', 'skills/sprite-export/SKILL.md', 'LICENSE'], [], 'documentation-only', false],
  ['four version-only files', IDENTITY_FILES, IDENTITY_FILES, 'identity-only', false],
  ['version-only files with docs', ['package.json', 'README.md'], ['package.json'], 'identity-only', false],
  ['version fact for one file does not cover another', ['package.json', 'package-lock.json'], ['package.json'], 'native', true],
  ['dependency change in package-lock.json', ['package-lock.json'], [], 'native', true],
  ['package.json with scripts or dependency change', ['package.json', 'README.md'], [], 'native', true],
  ['plugin manifest beyond version', ['.claude-plugin/plugin.json'], [], 'native', true],
  ['server engine source', ['server/engine/pixel-step.js'], [], 'native', true],
  ['native test list file', ['tests/cli/owned-cli.test.js'], [], 'native', true],
  ['native test list file with docs', ['tests/engine/raster.test.js', 'README.md'], [], 'native', true],
  ['workflow', ['.github/workflows/native-compatibility.yml'], [], 'native', true],
  ['no rule names this path', ['some-new-dir/x.bin'], [], 'unknown', true],
  ['unknown beside docs', ['README.md', 'some-new-dir/x.bin'], [], 'unknown', true],
  ['unknown beside version-only', ['package.json', 'some-new-dir/x.bin'], ['package.json'], 'unknown', true],
  ['skill json is not prose', ['skills/sprite-export/data.json'], [], 'unknown', true],
  ['site content only', ['site/index.html', 'site/assets/app.css', 'site/img/logo.png'], [], 'documentation-only', false],
  ['site content beside docs', ['site/index.html', 'README.md', 'docs/a.md'], [], 'documentation-only', false],
  ['site content beside native source', ['site/index.html', 'server/index.js'], [], 'native', true],
  ['site content beside an unknown path', ['site/index.html', 'some-new-dir/x.bin'], [], 'unknown', true],
  ['examples are not named by a rule', ['examples/demo/index.html'], [], 'unknown', true],
  ['examples beside site content', ['examples/demo/index.html', 'site/index.html'], [], 'unknown', true],
  ['empty change set', [], [], 'unknown', true],
  ['path escaping the repo', ['docs/../../outside.md'], [], 'unknown', true],
  ['dot-dot path into native source', ['docs/../server/index.js'], [], 'native', true],
])('classify %s', (_name, paths, versionOnly, expectedClass, admits) => {
  const result = classify(paths, versionOnly);
  expect(result.class).toBe(expectedClass);
  expect(result.admitsNative).toBe(admits);
  expect(result.identity).toBe(expectedClass === 'identity-only');
});

const NATIVE_PATHS = [
  'server/engine/raster.js', 'server/engine/atlas-verifier.js', 'server/index.js', 'server/db/schema.js', 'server/commands/catalog.js',
  'scripts/sprite.js', 'scripts/native-admission.mjs', 'scripts/setup.js',
  'tests/cli/owned-cli.test.js', 'tests/engine/raster.test.js', 'tests/db/session.test.js', 'tests/support/owned-cli.js', 'tests/fixtures/delayed-cli.js', 'tests/setup-session-db.js',
  '.github/workflows/native-compatibility.yml', '.github/workflows/pages.yml', '.github/scripts/native-compatibility.mjs',
  '.claude-plugin/other.json', 'vitest.config.js',
  './scripts/sprite.js', 'scripts\\sprite.js', 'server\\engine\\raster.js', 'Scripts/Sprite.js', 'SERVER/Engine/raster.js', 'Tests/CLI/x.test.js', '.GitHub/workflows/x.yml',
];

test.each(NATIVE_PATHS)('native source path %s is never classified as not admitting', path => {
  const filler = ['README.md', 'docs/a.md', 'package.json'];
  const sets = [[path], [path, ...filler], [...filler, path]];
  for (const paths of sets) {
    // Even a claim that the path is a version-only change cannot make a non-identity path pass.
    for (const versionOnly of [[], paths]) {
      const result = classify(paths, versionOnly);
      expect(result.admitsNative, `${paths.join(', ')} with versionOnly ${versionOnly.length}`).toBe(true);
      expect(['native', 'unknown']).toContain(result.class);
    }
  }
});

test('every path under a native root admits, whatever the file type', () => {
  for (const root of ['server', 'scripts', 'tests', '.github']) {
    for (const file of ['a.js', 'a.mjs', 'a.json', 'a.md', 'a.yml', 'deep/er/a.png', 'a']) {
      expect(classify([`${root}/${file}`]).admitsNative, `${root}/${file}`).toBe(true);
    }
  }
});

test('paths are normalized before matching', () => {
  expect(normalizePath('.\\docs\\a.md')).toBe('docs/a.md');
  expect(normalizePath('../x')).toBeNull();
  expect(normalizePath('/etc/x')).toBeNull();
  expect(normalizePath('C:/x')).toBeNull();
  expect(normalizePath('')).toBeNull();
});

test.each([
  ['package.json', { name: 'a', version: '1.0.0', scripts: { test: 'x' } }, o => { o.version = '1.0.1'; }, true],
  ['package.json', { name: 'a', version: '1.0.0', scripts: { test: 'x' } }, o => { o.scripts.test = 'y'; }, false],
  ['package-lock.json', { version: '1.0.0', packages: { '': { version: '1.0.0', dependencies: { a: '1' } }, 'node_modules/a': { version: '1.0.0' } } },
    o => { o.version = '2.0.0'; o.packages[''].version = '2.0.0'; }, true],
  ['package-lock.json', { version: '1.0.0', packages: { '': { version: '1.0.0' }, 'node_modules/a': { version: '1.0.0' } } },
    o => { o.packages['node_modules/a'].version = '1.0.1'; }, false],
  ['.claude-plugin/plugin.json', { name: 'a', version: '1.0.0', description: 'd' }, o => { o.version = '1.1.0'; }, true],
  ['.claude-plugin/plugin.json', { name: 'a', version: '1.0.0', description: 'd' }, o => { o.description = 'e'; }, false],
  ['.claude-plugin/marketplace.json', { plugins: [{ name: 'a', version: '1.0.0', source: './' }] }, o => { o.plugins[0].version = '1.1.0'; }, true],
  ['.claude-plugin/marketplace.json', { plugins: [{ name: 'a', version: '1.0.0', source: './' }] }, o => { o.plugins[0].source = './x'; }, false],
  ['.claude-plugin/marketplace.json', { plugins: [{ name: 'a', version: '1.0.0' }] }, o => { o.plugins[0].version = '1.1.0'; o.plugins.push({ name: 'b' }); }, false],
  ['server/index.js', { version: '1.0.0' }, o => { o.version = '1.0.1'; }, false],
])('version-only detection %s mutation %#', (path, before, mutate, expected) => {
  const after = structuredClone(before); mutate(after);
  expect(isVersionOnlyChange(path, JSON.stringify(before), JSON.stringify(after))).toBe(expected);
});

test('unparseable or missing content is never version-only', () => {
  expect(isVersionOnlyChange('package.json', '{"version":"1"}', 'not json')).toBe(false);
  expect(isVersionOnlyChange('package.json', '', '{"version":"1"}')).toBe(false);
  expect(isVersionOnlyChange('package.json', 'null', 'null')).toBe(false);
});

test('an unreachable or absent range widens instead of skipping', () => {
  for (const [base, head] of [['0'.repeat(40), 'HEAD'], [undefined, undefined], ['deadbeef'.repeat(5), 'HEAD']]) {
    const result = classifyRange(base, head, { cwd: root });
    expect(result.class).toBe('unknown');
    expect(result.admitsNative).toBe(true);
  }
});

test.each(['release', 'workflow_dispatch'])('%s always admits the native matrix', event => {
  const result = classifyEvent(event, () => { throw new Error('range must not be consulted'); });
  expect(result).toMatchObject({ class: 'native', admitsNative: true, identity: false });
});

function run(args, options = {}) {
  try { return { status: 0, stdout: execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 20000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], ...options }) }; }
  catch (error) { return { status: error.status, stdout: String(error.stdout ?? ''), stderr: String(error.stderr ?? '') }; }
}

test.each(['release', 'workflow_dispatch'])('CLI writes native=true for a %s with no commits', event => {
  const directory = mkdtempSync(join(tmpdir(), 'sprite-admission-'));
  const output = join(directory, 'output.txt');
  try {
    const { status } = run(['classify', '--event', event], { env: { ...process.env, GITHUB_OUTPUT: output } });
    expect(status).toBe(0);
    expect(readFileSync(output, 'utf8').split('\n').filter(Boolean)).toEqual(['class=native', 'native=true', 'identity=false']);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

commitCase('CLI writes native=false and identity=true for the release commit range', RELEASE, () => {
  const directory = mkdtempSync(join(tmpdir(), 'sprite-admission-'));
  const output = join(directory, 'output.txt');
  try {
    const { status } = run(['classify', '--event', 'push', '--base', git('rev-parse', `${RELEASE}^`).trim(), '--head', RELEASE],
      { cwd: root, env: { ...process.env, GITHUB_OUTPUT: output } });
    expect(status).toBe(0);
    expect(readFileSync(output, 'utf8').split('\n').filter(Boolean)).toEqual(['class=identity-only', 'native=false', 'identity=true']);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

function identityTree(mutate) {
  const directory = mkdtempSync(join(tmpdir(), 'sprite-identity-'));
  mkdirSync(join(directory, '.claude-plugin'));
  const files = {
    'package.json': { name: 'agent-sprites', version: '1.2.3' },
    'package-lock.json': { name: 'agent-sprites', version: '1.2.3', packages: { '': { name: 'agent-sprites', version: '1.2.3' } } },
    '.claude-plugin/plugin.json': { name: 'agent-sprites', version: '1.2.3' },
    '.claude-plugin/marketplace.json': { name: 'agent-sprites', plugins: [{ name: 'agent-sprites', version: '1.2.3' }] },
  };
  mutate(files);
  for (const [name, value] of Object.entries(files)) writeFileSync(join(directory, name), JSON.stringify(value));
  return directory;
}

test.each([
  ['all four agree', () => {}, 0],
  ['package.json lags', files => { files['package.json'].version = '1.2.2'; }, 1],
  ['package-lock root lags', files => { files['package-lock.json'].version = '1.2.2'; }, 1],
  ['package-lock packages entry lags', files => { files['package-lock.json'].packages[''].version = '1.2.2'; }, 1],
  ['plugin.json lags', files => { files['.claude-plugin/plugin.json'].version = '1.2.2'; }, 1],
  ['marketplace.json lags', files => { files['.claude-plugin/marketplace.json'].plugins[0].version = '1.2.2'; }, 1],
  ['marketplace lists no matching plugin', files => { files['.claude-plugin/marketplace.json'].plugins[0].name = 'other'; }, 1],
  ['version is not semantic', files => { for (const f of Object.values(files)) { if (f.version) f.version = 'latest'; } files['package-lock.json'].packages[''].version = 'latest'; files['.claude-plugin/marketplace.json'].plugins[0].version = 'latest'; }, 1],
])('check-identity: %s', (_name, mutate, status) => {
  const directory = identityTree(mutate);
  try { expect(run(['check-identity', '--root', directory]).status).toBe(status); }
  finally { rmSync(directory, { recursive: true, force: true }); }
});

test('check-identity passes on this repository', () => {
  expect(run(['check-identity', '--root', root]).status).toBe(0);
});

test('workflow wires the admission script and keeps release and manual triggers', () => {
  const triggers = workflow.slice(workflow.indexOf('\non:'), workflow.indexOf('\npermissions:'));
  expect(triggers).toMatch(/\n  workflow_dispatch:/);
  expect(triggers).toMatch(/\n  release:\n    types: \[published\]/);
  expect(triggers).toMatch(/\n  pull_request:/);
  expect(triggers).toMatch(/\n  push:\n    branches: \[main\]/);
  expect(workflow).not.toMatch(/\bschedule:/);
  expect(workflow).not.toMatch(/paths-ignore/);
  expect(workflow).toMatch(/node scripts\/native-admission\.mjs classify --event/);
  expect(workflow).toMatch(/node scripts\/native-admission\.mjs check-identity/);
  const nativeJob = workflow.slice(workflow.indexOf('\n  native:'));
  expect(nativeJob).toMatch(/needs: admit\n    if: needs\.admit\.outputs\.native == 'true'/);
  const identityJob = workflow.slice(workflow.indexOf('\n  identity:'), workflow.indexOf('\n  native:'));
  expect(identityJob).toMatch(/if: needs\.admit\.outputs\.identity == 'true'/);
});
