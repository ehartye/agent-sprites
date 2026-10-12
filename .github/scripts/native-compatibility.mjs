// CI-only native install evidence. Managed homes, npm links and databases stay in runner.temp.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDependencies, describeSource } from '../../scripts/managed-runtime.js';

const source = fileURLToPath(new URL('../../', import.meta.url));
const destination = process.env.NATIVE_RECEIPT_DIR || (process.env.RUNNER_TEMP && join(process.env.RUNNER_TEMP, 'sprite-native-receipts'));
if (!destination) throw Error('NATIVE_RECEIPT_DIR is required');
mkdirSync(destination, { recursive: true });
const json = file => JSON.parse(readFileSync(join(source, file), 'utf8'));
const hash = file => createHash('sha256').update(readFileSync(join(source, file))).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: source, encoding: 'utf8', windowsHide: true }).trim();
const description = describeSource(source);
assert.equal(json('.claude-plugin/marketplace.json').plugins.find(plugin => plugin.name === 'agent-sprites').version, description.version);
const receipt = {
  sourceSHA: git('rev-parse', 'HEAD'), sourceTree: git('rev-parse', 'HEAD^{tree}'),
  trackedChanges: git('status', '--porcelain', '--untracked-files=no'),
  version: description.version, fingerprint: description.fingerprint, runtimeKey: description.key,
  platform: process.platform, arch: process.arch, node: process.version, abi: process.versions.modules,
  runnerLabel: process.env.NATIVE_RUNNER_LABEL ?? null,
  metadataHashes: Object.fromEntries(['package.json', 'package-lock.json', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json'].map(file => [file, hash(file)])),
  outcomes: Object.fromEntries(['install', 'dependencies', 'tests', 'managed'].map(name => [name, process.env[`NATIVE_${name.toUpperCase()}_RESULT`] ?? 'not-recorded'])),
};
const phase = process.argv[2];
try {
  if (phase === 'prepare') {
    if (!process.env.RUNNER_TEMP || !process.env.GITHUB_ENV) throw Error('prepare requires runner.temp and GITHUB_ENV');
    const root = resolve(process.env.RUNNER_TEMP, 'sprite-native');
    const env = { AGENT_SPRITES_HOME: join(root, 'managed'), npm_config_prefix: join(root, 'npm-prefix'), SPRITE_DB_PATH: join(root, 'db', 'sessions.db') };
    for (const directory of [env.AGENT_SPRITES_HOME, env.npm_config_prefix, join(root, 'db')]) mkdirSync(directory, { recursive: true });
    const port = await new Promise((done, reject) => {
      const server = net.createServer(); server.once('error', reject);
      server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(error => error ? reject(error) : done(port)); });
    });
    appendFileSync(process.env.GITHUB_ENV, Object.entries({ ...env, NATIVE_RECEIPT_DIR: destination, SPRITE_PORT: String(port) }).map(([name, value]) => `${name}=${value}\n`).join(''));
    receipt.privatePaths = env;
  } else if (phase === 'dependencies') {
    checkDependencies(source); receipt.nativeBindings = 'Canvas/SQLite/Sharp exercised';
  } else if (phase === 'managed') {
    if (!process.env.RUNNER_TEMP) throw Error('managed requires runner.temp');
    const privateRoot = resolve(process.env.RUNNER_TEMP, 'sprite-native');
    for (const name of ['AGENT_SPRITES_HOME', 'npm_config_prefix', 'SPRITE_DB_PATH']) {
      if (!process.env[name]) throw Error(`Missing private ${name}`);
      const path = relative(privateRoot, resolve(process.env[name]));
      if (isAbsolute(path) || path === '..' || path.startsWith(`..${sep}`)) throw Error(`${name} must remain under the private runner directory`);
    }
    const execute = (script, args) => execFileSync(process.execPath, [join(source, 'scripts', script), ...args], { cwd: source, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    const setup = JSON.parse(execute('setup.js', ['--json']));
    const check = JSON.parse(execute('setup.js', ['--check', '--json']));
    assert.equal(setup.ok, true); assert.equal(check.ok, true);
    assert.equal(check.pluginVersion, description.version); assert.equal(check.cliVersion, description.version);
    assert.equal(check.fingerprint, description.fingerprint);
    const cliVersion = execute('run-managed.js', ['--version']).trim();
    assert.equal(cliVersion, description.version);
    receipt.managed = { setup, check, cliVersion };
  } else if (phase !== 'receipt') throw Error('Expected prepare, dependencies, managed or receipt phase');
  receipt.phaseResult = 'passed';
} catch (error) {
  receipt.phaseResult = 'failed'; receipt.error = error.message;
  throw error;
} finally {
  const outcomes = Object.values(receipt.outcomes);
  receipt.nativeResult = receipt.phaseResult === 'failed' || outcomes.some(outcome => outcome === 'failure' || outcome === 'cancelled')
    ? 'failed' : outcomes.every(outcome => outcome === 'success') ? 'passed' : 'incomplete';
  writeFileSync(join(destination, `${phase}.json`), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ phase, phaseResult: receipt.phaseResult, nativeResult: receipt.nativeResult, version: receipt.version, platform: receipt.platform, arch: receipt.arch, node: receipt.node, abi: receipt.abi }));
}
