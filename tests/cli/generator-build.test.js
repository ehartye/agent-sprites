import { afterEach, beforeEach, expect, test } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildProject } from '../../server/build/project-build.js';

let dir, config, generator;
const operations = [
  { command: 'new', name: 'tiny', size: 8, rows: 1, cols: 1 },
  { command: 'draw', type: 'rect', cell: '0,0', name: 'body', x: 1, y: 1, w: 5, h: 5, color: '#29adff', filled: true },
];
const generated = JSON.stringify(operations);
const hashes = (output = join(dir, 'dist')) => Object.fromEntries(readdirSync(output).sort().map(name => [name, createHash('sha256').update(readFileSync(join(output, name))).digest('hex')]));
const write = code => writeFileSync(generator, code);
const clean = () => expect(readdirSync(dir).filter(name => /staging|previous|build-lock/.test(name))).toEqual([]);
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sprite-generator-build-')); config = join(dir, 'sprite-project.json'); generator = join(dir, 'generate.mjs');
  writeFileSync(config, JSON.stringify({ version: 1, generator: 'generate.mjs', output: 'dist', scale: 1 }));
  write(`process.stdout.write(${JSON.stringify(generated)});`);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('normal build accepts more than 8 MiB of streamed generator stdout and records portable byte identity', async () => {
  const padding = 9 * 1024 * 1024;
  write(`process.stdout.write(${JSON.stringify(generated)}); process.stdout.write(' '.repeat(${padding}));`);
  const progress = [], result = await buildProject(config, { onProgress: event => progress.push(event) });
  expect(result.errors).toEqual([]); expect(result.ok).toBe(true);
  expect(JSON.parse(readFileSync(result.artifacts.operations))).toEqual(operations);
  const sha256 = createHash('sha256').update(generated).update(' '.repeat(padding)).digest('hex');
  expect(result.generatorInput).toMatchObject({ bytes: Buffer.byteLength(generated) + padding, sha256, stderr: { text: '', totalBytes: 0, truncated: false } });
  const manifest = JSON.parse(readFileSync(result.artifacts.manifest));
  expect(manifest.generatorInput).toEqual(result.generatorInput);
  expect(manifest.build).not.toHaveProperty('generatorInput');
  expect(JSON.stringify(result.generatorInput)).not.toMatch(/generator-|staging|[A-Z]:\\/);
  expect(progress).toEqual(expect.arrayContaining([expect.objectContaining({ phase: 'generator', bytes: expect.any(Number) }), expect.objectContaining({ phase: 'operations', completed: 2, total: 2 }), expect.objectContaining({ phase: 'prepublication' }), expect.objectContaining({ phase: 'committed' })]));
  clean();
}, 20000);

test('preaborted build does not run generator or acquire output ownership', async () => {
  write(`import { writeFileSync } from 'node:fs'; writeFileSync('started','bad'); process.stdout.write(${JSON.stringify(generated)});`);
  const abort = new AbortController(); abort.abort();
  const result = await buildProject(config, { signal: abort.signal });
  expect(result.ok).toBe(false); expect(result.errors).toEqual([expect.objectContaining({ code: 'build', message: expect.stringMatching(/cancel/i) })]);
  expect(existsSync(join(dir, 'started'))).toBe(false); expect(existsSync(join(dir, 'dist'))).toBe(false); clean();
});

test('trusted stdout cap rejects replacement, keeps every published hash and preserves a foreign sentinel', async () => {
  expect((await buildProject(config)).ok).toBe(true); const before = hashes();
  const foreign = join(dir, 'foreign-spool'); writeFileSync(foreign, 'keep');
  write(`process.stdout.write(${JSON.stringify(generated)}); process.stdout.write(' '.repeat(4096));`);
  const result = await buildProject(config, { generatorPolicy: { maxStdoutBytes: 1024 } });
  expect(result.ok).toBe(false); expect(result.errors[0].message).toMatch(/stdout.*1024/i);
  expect(hashes()).toEqual(before); expect(readFileSync(foreign, 'utf8')).toBe('keep'); clean();
});

test.each(['invalid-json', 'exit', 'timeout', 'cancel'])('generator %s failure cleans owned resources and preserves published bytes', async kind => {
  expect((await buildProject(config)).ok).toBe(true); const before = hashes(), abort = new AbortController();
  const payload = `process.stderr.write('x'.repeat(200000));`;
  if (kind === 'invalid-json') write(`${payload} process.stdout.write('not json');`);
  if (kind === 'exit') write(`${payload} process.stdout.write(${JSON.stringify(generated)}); process.exitCode=7;`);
  if (kind === 'timeout' || kind === 'cancel') write(`${payload} setInterval(()=>process.stdout.write(' '.repeat(1024)),10);`);
  const result = await buildProject(config, { signal: abort.signal, generatorPolicy: { timeoutMs: kind === 'timeout' ? 250 : 3000 }, onProgress: progress => {
    if (kind === 'cancel' && progress.phase === 'generator' && progress.bytes > 0) abort.abort();
  } });
  expect(result.ok).toBe(false);
  expect(result.errors[0].message).toMatch(kind === 'invalid-json' ? /valid JSON/i : kind === 'exit' ? /code 7/i : kind === 'timeout' ? /timed out/i : /cancel/i);
  expect(result.generatorStderr).toMatchObject({ totalBytes: 200000, truncated: true });
  expect(Buffer.byteLength(result.generatorStderr.text)).toBe(64 * 1024);
  expect(hashes()).toEqual(before); clean();
}, 10000);

test('character object reports and bounded successful stderr survive generator spooling', async () => {
  const report = { kind: 'character', frames: [], marker: 'keep-me' };
  write(`process.stderr.write('é'.repeat(100000));process.stdout.write(${JSON.stringify(JSON.stringify({ operations, report }))});`);
  const result = await buildProject(config, { generatorPolicy: { maxStderrBytes: 32 } });
  expect(result.errors).toEqual([]); expect(result.ok).toBe(true);
  expect(JSON.parse(readFileSync(result.artifacts.characterReport))).toEqual(report);
  expect(result.generatorInput.stderr).toEqual({ text: 'é'.repeat(16), totalBytes: 200000, truncated: true });
});

test('observer exceptions cannot interrupt a successful build', async () => {
  const result = await buildProject(config, { onProgress: () => { throw new Error('observer bug'); } });
  expect(result.ok).toBe(true); expect(result.generatorInput).toBeDefined(); clean();
});

test.each(['operations', 'render', 'verify', 'artifacts', 'prepublication'])('cancel at %s boundary preserves the previous publication', async phase => {
  expect((await buildProject(config)).ok).toBe(true); const before = hashes(), abort = new AbortController();
  const result = await buildProject(config, { signal: abort.signal, onProgress: event => { if (event.phase === phase) abort.abort(); } });
  expect(result.ok).toBe(false); expect(result.errors[0].message).toMatch(/cancel/i);
  expect(hashes()).toEqual(before); clean();
});

test('cancellation after commit truthfully returns published success', async () => {
  const abort = new AbortController(), phases = [];
  const result = await buildProject(config, { signal: abort.signal, onProgress: event => { phases.push(event.phase); if (event.phase === 'committed') abort.abort(); } });
  expect(result.ok).toBe(true); expect(abort.signal.aborted).toBe(true);
  expect(phases).toContain('committing'); expect(existsSync(result.artifacts.sheet)).toBe(true); clean();
});

test('actual CLI build keeps JSON stdout readable and reports progress on stderr', async () => {
  write(`process.stdout.write(${JSON.stringify(generated)});process.stdout.write(' '.repeat(9*1024*1024));`);
  const child = spawn(process.execPath, [join(process.cwd(), 'scripts/sprite.js'), 'build', config, '--json'], { cwd: dir, windowsHide: true });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  const code = await new Promise(resolve => child.once('close', resolve));
  expect(code).toBe(0); expect(JSON.parse(stdout).ok).toBe(true);
  expect(stderr).toMatch(/generator.*bytes/i); expect(stderr).toMatch(/operations.*2.*2/i); expect(stderr).toContain('committed'); clean();
  expect(stderr.split('\n').filter(line => line.startsWith('generator ·')).length).toBeLessThan(10);
});

test('actual CLI SIGINT handler cancels its build with JSON failure and status 130', async () => {
  write(`setTimeout(()=>process.stdout.write(${JSON.stringify(generated)}),1500);`);
  // Node cannot synthesize a console Ctrl+C on Windows; preload emits the same
  // process event when the real CLI reports it has started its generator.
  const preload = join(dir, 'interrupt.mjs');
  writeFileSync(preload, `const write=process.stderr.write.bind(process.stderr);let sent=false;process.stderr.write=(chunk,...args)=>{const result=write(chunk,...args);if(!sent&&String(chunk).startsWith('generator ·')){sent=true;setImmediate(()=>process.emit('SIGINT'));}return result;};`);
  const child = spawn(process.execPath, ['--import', pathToFileURL(preload).href, join(process.cwd(), 'scripts/sprite.js'), 'build', config, '--json'], { cwd: dir, windowsHide: true });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  const code = await new Promise(resolve => child.once('close', resolve));
  expect(code).toBe(130); expect(JSON.parse(stdout)).toMatchObject({ ok: false, errors: [expect.objectContaining({ message: expect.stringMatching(/cancel/i) })] });
  expect(stderr).toMatch(/Build canceled/); expect(existsSync(join(dir, 'dist'))).toBe(false); clean();
});

async function cliBuild(...args) {
  return cliBuildWithPreload(null, ...args);
}

async function cliBuildWithPreload(preload, ...args) {
  const nodeArgs = preload ? ['--import', pathToFileURL(preload).href] : [];
  const child = spawn(process.execPath, [...nodeArgs, join(process.cwd(), 'scripts/sprite.js'), 'build', config, ...args], { cwd: dir, windowsHide: true });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  const code = await new Promise(resolve => child.once('close', resolve));
  return { code, stdout, stderr };
}

test.each([['JSON', ['--json']], ['human', []]])('actual %s CLI reports publication failure despite SIGINT after backing up output', async (format, args) => {
  expect((await buildProject(config)).ok).toBe(true);
  const before = hashes(), output = realpathSync(join(dir, 'dist')), preload = join(dir, 'publication-failure.mjs');
  // Patch the builtin before the real CLI imports its builder. Emit Node's
  // portable signal event only after the previous output has actually moved.
  writeFileSync(preload, `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const rename = fs.renameSync, output = ${JSON.stringify(output)};
    let backedUp = false;
    fs.renameSync = (from, to) => {
      if (from === output) {
        const result = rename(from, to);
        backedUp = true;
        if (!process.emit('SIGINT')) throw new Error('Build SIGINT handler missing');
        return result;
      }
      if (backedUp && to === output) throw Object.assign(new Error('Injected publication or restoration failure'), { code: 'EIO' });
      return rename(from, to);
    };
    syncBuiltinESMExports();
  `);
  const result = await cliBuildWithPreload(preload, ...args);
  const backupName = readdirSync(dir).find(name => name.endsWith('.previous'));
  expect(backupName).toBeDefined();
  const backup = join(realpathSync(dir), backupName);
  expect(existsSync(output)).toBe(false); expect(hashes(backup)).toEqual(before);
  if (format === 'JSON') {
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({ ok: false, artifacts: {}, errors: [expect.objectContaining({ message: expect.stringContaining(backup) })] });
    expect(report.errors[0].message).toContain('restoring it failed');
  } else {
    expect(result.stdout.split('\n')[0]).toBe('Build failed');
    expect(result.stdout).toContain(backup);
  }
  expect(result.code).toBe(1);
  expect(result.stderr).not.toMatch(/Build canceled|previous output preserved/i);
  expect(result.stdout).not.toMatch(/previous output preserved/i);
  expect(readdirSync(dir).filter(name => /staging|previous|build-lock/.test(name))).toEqual([backupName]);
});

test('actual CLI keeps successful publication and its receipt after SIGINT at the swap', async () => {
  expect((await buildProject(config)).ok).toBe(true);
  const output = realpathSync(join(dir, 'dist')), preload = join(dir, 'publication-interrupt.mjs');
  writeFileSync(preload, `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const rename = fs.renameSync, output = ${JSON.stringify(output)};
    fs.renameSync = (from, to) => {
      const result = rename(from, to);
      if (to === output && !from.endsWith('.previous')) {
        if (!process.emit('SIGINT')) throw new Error('Build SIGINT handler missing');
        process.stderr.write('Injected SIGINT after publication\\n');
      }
      return result;
    };
    syncBuiltinESMExports();
  `);
  const result = await cliBuildWithPreload(preload, '--json'), report = JSON.parse(result.stdout);
  expect(result.code).toBe(0); expect(report.ok).toBe(true); expect(report.errors).toEqual([]);
  const manifest = JSON.parse(readFileSync(report.artifacts.manifest, 'utf8'));
  expect(manifest.generatorInput).toEqual(report.generatorInput);
  expect(existsSync(report.artifacts.sheet)).toBe(true);
  expect(result.stderr).toContain('Injected SIGINT after publication');
  expect(result.stderr).toContain('committed'); expect(result.stderr).not.toContain('Build canceled'); clean();
});

test('human CLI exposes a failed generator diagnostic with honest bounded truncation', async () => {
  const diagnostic = 'Required generator input is missing.\n';
  write(`process.stderr.write(${JSON.stringify(diagnostic)}+'x'.repeat(${200000 - Buffer.byteLength(diagnostic)}));process.exitCode=7;`);
  const result = await cliBuild();
  expect(result.code).toBe(1); expect(result.stdout).toContain('Generator exited with code 7.');
  expect(result.stderr).toContain(diagnostic);
  expect(result.stderr).toMatch(/Generator stderr.*200000 bytes total.*truncated/);
  expect(Buffer.byteLength(result.stderr)).toBeLessThan(64 * 1024 + 1024);
  expect(result.stderr).not.toContain('agent-sprites-generator-');
  expect(existsSync(join(dir, 'dist'))).toBe(false); clean();
});

test('human CLI preserves successful generator diagnostics and omits empty diagnostic noise', async () => {
  const quiet = await cliBuild();
  expect(quiet.code).toBe(0); expect(quiet.stderr).not.toContain('Generator stderr');
  const diagnostic = 'Generated optional detail omitted.\n';
  write(`process.stderr.write(${JSON.stringify(diagnostic)});process.stdout.write(${JSON.stringify(generated)});`);
  const result = await cliBuild();
  expect(result.code).toBe(0); expect(result.stderr).toContain(diagnostic);
  expect(result.stderr).toContain(`Generator stderr (${Buffer.byteLength(diagnostic)} bytes total):`);
  expect(result.stderr).not.toContain('truncated'); clean();
});

test('JSON CLI retains bounded generator diagnostics in its exact report without human diagnostic lines', async () => {
  const diagnostic = 'Check the declared generator input.\n';
  write(`process.stderr.write(${JSON.stringify(diagnostic)});process.exitCode=3;`);
  const result = await cliBuild('--json'), report = JSON.parse(result.stdout);
  expect(result.code).toBe(1); expect(report).toMatchObject({ ok: false, generatorStderr: { text: diagnostic, totalBytes: Buffer.byteLength(diagnostic), truncated: false } });
  expect(result.stdout).toBe(JSON.stringify(report) + '\n');
  expect(result.stderr).not.toContain(diagnostic); expect(result.stderr).not.toContain('Generator stderr'); clean();
});
