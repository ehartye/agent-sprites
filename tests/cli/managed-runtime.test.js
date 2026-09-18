import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, copyFileSync, realpathSync } from 'node:fs';
import { join, parse, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { describeSource, installRuntime, resolveRuntime, inspectInstallation, inspectServer } from '../../scripts/managed-runtime.js';

let sandbox, source, home, globalRoot;
function put(path, text) { writeFileSync(path, text); }
function npm(args, { cwd }) {
  if (args[0] === 'ci') mkdirSync(join(cwd, 'node_modules'), { recursive: true });
  if (args[0] === 'root') return globalRoot;
  if (args[0] === 'prefix') return sandbox;
  if (args[0] === 'link') {
    const link = join(globalRoot, 'agent-sprites');
    if (existsSync(link)) rmSync(link, { recursive: true, force: true });
    symlinkSync(cwd, link, process.platform === 'win32' ? 'junction' : 'dir');
  }
  return '';
}
const deps = () => {};

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'sprite-managed-test-'));
  source = join(sandbox, 'plugin cache'); home = join(sandbox, 'managed home');
  globalRoot = join(sandbox, 'npm', 'node_modules');
  for (const dir of [source, globalRoot, join(source, 'scripts'), join(source, 'server'), join(source, '.claude-plugin')]) mkdirSync(dir, { recursive: true });
  put(join(source, 'package.json'), JSON.stringify({ name: 'agent-sprites', version: '1.2.3', type: 'module', bin: { 'agent-sprites': 'scripts/sprite.js' } }));
  put(join(source, 'package-lock.json'), JSON.stringify({ name: 'agent-sprites', version: '1.2.3', lockfileVersion: 3, packages: { '': { name: 'agent-sprites', version: '1.2.3' } } }));
  put(join(source, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'agent-sprites', version: '1.2.3' }));
  put(join(source, 'scripts', 'sprite.js'), 'console.log(JSON.stringify({ root: import.meta.url, cwd: process.cwd(), args: process.argv.slice(2) }));');
  put(join(source, 'server', 'index.js'), '// server');
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

describe('managed CLI installation', () => {
  test('copies runtime outside plugin, links only after dependency validation, and resolves exact release', () => {
    const order = [];
    const runtime = installRuntime(source, { home, npm: (args, opts) => { order.push(args[0]); return npm(args, opts); }, checkDependencies: () => order.push('deps') });
    expect(runtime.root.startsWith(join(home, 'releases'))).toBe(true);
    expect(order.indexOf('ci')).toBeLessThan(order.indexOf('deps'));
    expect(order.indexOf('deps')).toBeLessThan(order.indexOf('link'));
    expect(resolveRuntime(source, { home }).root).toBe(runtime.root);
    expect(existsSync(join(source, 'node_modules'))).toBe(false);
    expect(inspectInstallation(source, { home, npm, checkDependencies: deps }).linked).toBe(true);
  });

  test('rerun reuses a complete runtime and repairs an outdated link', () => {
    const first = installRuntime(source, { home, npm, checkDependencies: deps });
    const calls = [];
    const second = installRuntime(source, { home, npm: (args, opts) => { calls.push(args[0]); return npm(args, opts); }, checkDependencies: deps });
    expect(first.root).toBe(second.root);
    expect(calls).not.toContain('ci');
    expect(calls).toContain('link');
  });

  test('npm normalizing a Windows bin shebang does not make the runtime stale', () => {
    put(join(source, 'scripts', 'sprite.js'), '#!/usr/bin/env node\r\nconsole.log("ready");\r\n');
    const runtime = installRuntime(source, { home, checkDependencies: deps, npm: (args, opts) => {
      if (args[0] === 'link') {
        const bin = join(opts.cwd, 'scripts', 'sprite.js');
        put(bin, readFileSync(bin, 'utf8').replace(/^#!([^\r\n]*)\r\n/, '#!$1\n'));
      }
      return npm(args, opts);
    } });
    expect(resolveRuntime(source, { home }).root).toBe(runtime.root);
  });

  test('actual skill launcher selects managed copy and fails closed after source update', () => {
    for (const file of ['managed-runtime.js', 'run-managed.js']) copyFileSync(join(process.cwd(), 'scripts', file), join(source, 'scripts', file));
    installRuntime(source, { home, npm, checkDependencies: deps });
    const launch = () => execFileSync(process.execPath, [join(source, 'scripts', 'run-managed.js'), 'batch', 'ops with spaces.json'], {
      cwd: sandbox, encoding: 'utf8', env: { ...process.env, AGENT_SPRITES_HOME: home }, stdio: 'pipe',
    });
    const output = JSON.parse(launch());
    expect(output.root).toContain('/releases/');
    expect(output.cwd).toBe(sandbox);
    expect(output.args).toEqual(['batch', 'ops with spaces.json']);
    put(join(source, 'server', 'index.js'), '// plugin updated');
    expect(launch).toThrow(/sprite-setup/);
  });

  test('rejects missing installs and same-version runtime changes instead of falling back to PATH', () => {
    expect(() => resolveRuntime(source, { home })).toThrow(/setup/i);
    const old = installRuntime(source, { home, npm, checkDependencies: deps });
    put(join(source, 'server', 'index.js'), '// different build of same version');
    expect(() => resolveRuntime(source, { home })).toThrow(/setup/i);
    const next = installRuntime(source, { home, npm, checkDependencies: deps });
    expect(next.root).not.toBe(old.root);
    expect(existsSync(old.cli)).toBe(true);
  });

  test('version sync rejects inconsistent plugin and package metadata', () => {
    put(join(source, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'agent-sprites', version: '9.0.0' }));
    expect(() => describeSource(source)).toThrow(/version/i);
  });

  test('failed native install never links or promotes an incomplete runtime', () => {
    const calls = [];
    expect(() => installRuntime(source, { home, npm: args => { calls.push(args[0]); throw new Error('native install failed'); }, checkDependencies: deps })).toThrow(/native install failed/);
    expect(calls).not.toContain('link');
    expect(() => resolveRuntime(source, { home })).toThrow(/setup/i);
    expect(existsSync(join(home, 'setup.lock'))).toBe(false);
  });

  test('rejects install paths inside the plugin and concurrent setup', () => {
    expect(() => installRuntime(source, { home: join(source, 'runtime'), npm, checkDependencies: deps })).toThrow(/outside/i);
    mkdirSync(home); put(join(home, 'setup.lock'), 'another setup');
    expect(() => installRuntime(source, { home, npm, checkDependencies: deps })).toThrow(/setup.*running|lock/i);
    expect(readFileSync(join(home, 'setup.lock'), 'utf8')).toBe('another setup');
  });

  test('a missing managed home directly under a filesystem root retains its full basename', () => {
    const rootHome = join(parse(sandbox).root, `agent-sprites-missing-${basename(sandbox)}`);
    // Read-only resolution; this test never creates a directory under the root.
    expect(() => resolveRuntime(source, { home: rootHome })).toThrow(/Managed CLI.*missing/);
  });

  test('detects edited installed runtime and a stale npm link', () => {
    const runtime = installRuntime(source, { home, npm, checkDependencies: deps });
    rmSync(join(globalRoot, 'agent-sprites'), { recursive: true });
    symlinkSync(source, join(globalRoot, 'agent-sprites'), process.platform === 'win32' ? 'junction' : 'dir');
    expect(inspectInstallation(source, { home, npm, checkDependencies: deps }).linked).toBe(false);
    put(runtime.cli, '// changed');
    expect(() => resolveRuntime(source, { home })).toThrow(/modified|mismatch/i);
  });

  test('resolved CLI executes installed copy, preserving arguments and project working directory', () => {
    const runtime = installRuntime(source, { home, npm, checkDependencies: deps });
    const output = JSON.parse(execFileSync(process.execPath, [runtime.cli, 'batch', 'file with spaces.json'], { cwd: sandbox, encoding: 'utf8' }));
    expect(output.root).toContain('/releases/');
    expect(output.cwd).toBe(sandbox);
    expect(output.args).toEqual(['batch', 'file with spaces.json']);
  });

  test.each(['matched', 'old version', 'different root', 'unidentified'])('setup server sync check reports %s', async scenario => {
    const runtime = installRuntime(source, { home, npm, checkDependencies: deps });
    const body = { ok: true, service: 'agent-sprites', protocol: 1, version: runtime.version, runtimeRoot: realpathSync(runtime.root) };
    if (scenario === 'old version') body.version = '0.0.1';
    if (scenario === 'different root') body.runtimeRoot = source;
    const server = http.createServer((_req, res) => res.end(scenario === 'unidentified' ? '<html>other app</html>' : JSON.stringify(body)));
    await new Promise(resolve => server.listen(0, resolve));
    try {
      const report = await inspectServer(runtime, server.address().port);
      expect(report.ok).toBe(scenario === 'matched');
      expect(report.state).toBe(scenario === 'matched' ? 'matched' : scenario === 'unidentified' ? 'unidentified' : 'mismatch');
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
});
