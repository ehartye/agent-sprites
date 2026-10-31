// Shared by bootstrap and the skill launcher. Runtime selection never uses PATH.
import { fingerprintSource } from './source-fingerprint.js';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';

const RECEIPT = 'managed-install.json';
export const managedHome = () => resolve(process.env.AGENT_SPRITES_HOME || join(homedir(), '.agent-sprites'));
// Errors carry the stage that failed (runtime, dependencies, link or version) for the check report.
const fail = (boundary, message) => Object.assign(new Error(message), { boundary });
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const inside = (parent, child) => { const rel = relative(parent, child); return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)); };

function canonical(path) {
  if (existsSync(path)) return realpathSync(path);
  return join(canonical(dirname(path)), basename(path));
}

export function describeSource(source) {
  source = realpathSync(source);
  const pkg = readJson(join(source, 'package.json'));
  if (pkg.name !== 'agent-sprites' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(pkg.version)) throw fail('version', 'Invalid agent-sprites package/version');
  const pluginPath = join(source, '.claude-plugin', 'plugin.json');
  if (existsSync(pluginPath)) {
    const plugin = readJson(pluginPath);
    if (plugin.name !== pkg.name || plugin.version !== pkg.version) throw fail('version', 'Plugin and CLI package version mismatch');
  }
  const lock = readJson(join(source, 'package-lock.json'));
  if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) throw fail('version', 'Package and lockfile version mismatch');
  const { files, fingerprint } = fingerprintSource(source);
  const key = `${pkg.version}-${fingerprint.slice(0, 16)}-${process.platform}-${process.arch}-${process.versions.modules}`;
  return { source, version: pkg.version, fingerprint, key, files };
}

function location(source, home) {
  const expected = describeSource(source);
  home = canonical(resolve(home));
  if (inside(expected.source, home) || inside(home, expected.source)) throw fail('runtime', 'Managed installation must be outside the plugin/checkout, in a separate directory');
  const root = join(home, 'releases', expected.key);
  // Do not follow a replaced releases directory or release junction into a cache/checkout.
  if (!inside(home, canonical(root))) throw fail('runtime', 'Managed release resolves outside its installation home');
  return { ...expected, home, root, cli: join(root, 'scripts', 'sprite.js') };
}

export function resolveRuntime(source, { home = managedHome() } = {}) {
  const runtime = location(source, home);
  const receiptPath = join(runtime.root, RECEIPT);
  if (!existsSync(receiptPath)) throw fail('runtime', `Managed CLI ${runtime.version} is missing. Run the sprite-setup skill (node "${join(runtime.source, 'scripts', 'setup.js')}").`);
  const receipt = readJson(receiptPath);
  if (receipt.fingerprint !== runtime.fingerprint || receipt.key !== runtime.key || describeSource(runtime.root).fingerprint !== runtime.fingerprint) {
    throw fail('version', `Managed runtime modified or version mismatch at ${runtime.root}. Move this managed release aside and rerun sprite-setup.`);
  }
  return runtime;
}

// The npm that setup runs: an inherited npm_execpath wins when it is a real npm-cli.js, so the report names it.
export function npmCli() {
  const candidates = [process.env.npm_execpath, join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')];
  for (const entry of (process.env.PATH || '').split(delimiter).filter(Boolean)) {
    candidates.push(join(entry, 'node_modules', 'npm', 'bin', 'npm-cli.js'));
    const npm = join(entry, 'npm');
    if (existsSync(npm)) candidates.push(realpathSync(npm));
  }
  const found = candidates.find(path => path && path.endsWith('npm-cli.js') && existsSync(path));
  if (!found) throw new Error('Cannot locate npm-cli.js. Install Node.js with npm, then rerun sprite-setup.');
  return found;
}

export function runNpm(args, { cwd, progress = false } = {}) {
  try {
    return execFileSync(process.execPath, [npmCli(), ...args], {
      cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024,
      stdio: progress ? ['ignore', 2, 2] : ['ignore', 'pipe', 'pipe'],
    })?.trim() || '';
  } catch (error) {
    throw new Error(`npm ${args.join(' ')} failed: ${error.stderr || error.message}`);
  }
}

export function checkDependencies(root) {
  // Exercise native bindings, not only package-directory existence.
  execFileSync(process.execPath, ['--input-type=module', '-e',
    "import {createRequire} from 'node:module'; const require=createRequire(process.cwd()+'/package.json'); require('canvas').createCanvas(1,1); const db=new (require('better-sqlite3'))(':memory:'); db.close(); require('express'); require('ws'); await require('sharp')({create:{width:1,height:1,channels:4,background:'#000000'}}).png().toBuffer();"],
  { cwd: root, windowsHide: true, stdio: 'pipe' });
}

export function installRuntime(source, { home = managedHome(), npm = runNpm, checkDependencies: check = checkDependencies } = {}) {
  const runtime = location(source, home);
  mkdirSync(runtime.home, { recursive: true });
  const lock = join(runtime.home, 'setup.lock');
  let fd;
  try { fd = openSync(lock, 'wx'); } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Another setup may be running (${lock}). Remove a stale lock only after confirming no setup is active.`);
    throw error;
  }
  let stage;
  try {
    writeFileSync(fd, JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
    if (!existsSync(runtime.root)) {
      const releases = join(runtime.home, 'releases');
      mkdirSync(releases, { recursive: true });
      stage = mkdtempSync(join(releases, '.install-'));
      for (const name of runtime.files) {
        mkdirSync(dirname(join(stage, name)), { recursive: true });
        copyFileSync(join(runtime.source, name), join(stage, name));
      }
      npm(['ci', '--omit=dev', '--no-audit', '--no-fund'], { cwd: stage, progress: true });
      check(stage);
      if (describeSource(stage).fingerprint !== runtime.fingerprint) throw new Error('Runtime source changed during installation; rerun setup');
      writeFileSync(join(stage, RECEIPT), JSON.stringify({ key: runtime.key, version: runtime.version, fingerprint: runtime.fingerprint }, null, 2));
      renameSync(stage, runtime.root);
      stage = undefined;
    } else {
      resolveRuntime(source, { home });
      try { check(runtime.root); } catch {
        npm(['ci', '--omit=dev', '--no-audit', '--no-fund'], { cwd: runtime.root, progress: true });
        check(runtime.root);
      }
    }
    npm(['link', '--omit=dev', '--no-audit', '--no-fund'], { cwd: runtime.root, progress: true });
    const globalRoot = npm(['root', '--global'], { cwd: runtime.root });
    const linked = join(globalRoot, 'agent-sprites');
    if (!existsSync(linked) || !samePath(realpathSync(linked), realpathSync(runtime.root))) throw new Error('npm link did not select the managed runtime');
    return runtime;
  } finally {
    closeSync(fd);
    if (stage && inside(join(runtime.home, 'releases'), realpathSync(stage))) rmSync(stage, { recursive: true, force: true });
    unlinkSync(lock);
  }
}

export function inspectInstallation(source, { home = managedHome(), npm = runNpm, checkDependencies: check = checkDependencies } = {}) {
  const expected = location(source, home);
  const report = { ok: false, runtimeOk: false, linkOk: false, pluginVersion: expected.version, cliVersion: null, runtimeRoot: expected.root, fingerprint: expected.fingerprint, linked: false, dependencies: false, node: process.version, npm: null, prefix: null, npmExecpath: null, errors: [] };
  try { report.npmExecpath = npmCli(); } catch { /* reported as null; a real npm call below records the failure */ }
  if (report.npmExecpath) {
    try { const meta = readJson(join(dirname(report.npmExecpath), '..', 'package.json')); if (meta.name === 'npm') report.npm = meta.version; } catch { /* version stays null */ }
  }
  let stage = 'runtime';
  try {
    const runtime = resolveRuntime(source, { home });
    report.cliVersion = runtime.version;
    stage = 'dependencies';
    check(runtime.root); report.dependencies = true;
    report.runtimeOk = true;
    stage = 'link';
    const globalRoot = npm(['root', '--global'], { cwd: runtime.root });
    const linked = join(globalRoot, 'agent-sprites');
    report.linkedRoot = existsSync(linked) ? realpathSync(linked) : null;
    report.linked = !!report.linkedRoot && samePath(report.linkedRoot, realpathSync(runtime.root));
    if (!report.linked) report.errors.push('npm link points elsewhere or is missing; rerun sprite-setup');
    const prefix = npm(['prefix', '--global'], { cwd: runtime.root });
    report.prefix = prefix;
    report.pathDirectory = process.platform === 'win32' ? prefix : join(prefix, 'bin');
    report.pathConfigured = (process.env.PATH || '').split(delimiter).filter(Boolean).some(path => samePath(resolve(path), resolve(report.pathDirectory)));
    if (!report.pathConfigured) report.pathHint = `Add ${report.pathDirectory} to your user PATH for the optional bare agent-sprites command. Skills use the checked launcher regardless of PATH.`;
  } catch (error) { report.errors.push(error.message); report.boundary = error.boundary || stage; }
  if (!report.boundary && report.errors.length) report.boundary = 'link';
  report.linkOk = report.linked && report.boundary !== 'link';
  report.ok = report.dependencies && report.linked && report.errors.length === 0;
  return report;
}

export async function inspectServer(runtime, port = process.env.SPRITE_PORT || '3377') {
  let response;
  try { response = await fetch(`http://localhost:${port}/health`, { redirect: 'manual', signal: AbortSignal.timeout(1500) }); }
  catch (error) {
    // Only connection refusal establishes that no server is running.
    if (error.cause?.code === 'ECONNREFUSED') return { ok: true, state: 'stopped' };
    return { ok: false, state: 'unreachable', error: error.message };
  }
  let body;
  try { body = await response.json(); } catch { return { ok: false, state: 'unidentified' }; }
  const ok = response.ok && body.ok === true && body.service === 'agent-sprites' && body.protocol === 1 && body.version === runtime.version && typeof body.runtimeRoot === 'string' && samePath(body.runtimeRoot, realpathSync(runtime.root));
  return { ok, state: ok ? 'matched' : 'mismatch', version: body.version ?? null, runtimeRoot: body.runtimeRoot ?? null };
}
