import { afterEach, beforeEach, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { readGeneratorInput } from '../../server/build/generator-input.js';

let dir, source;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sprite-generator-input-')); source = join(dir, 'generate.mjs');
  mkdirSync(join(dir, 'agent-sprites-generator-foreign')); writeFileSync(join(dir, 'agent-sprites-generator-foreign', 'sentinel'), 'keep');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const invoke = options => readGeneratorInput({ source, cwd: dir, temporaryRoot: dir, ...options });
const assertClean = () => {
  expect(readdirSync(dir).filter(name => name.startsWith('agent-sprites-generator-'))).toEqual(['agent-sprites-generator-foreign']);
  expect(readFileSync(join(dir, 'agent-sprites-generator-foreign', 'sentinel'), 'utf8')).toBe('keep');
};

test('owned spool is gone after parsing while executable arguments and working directory are preserved', async () => {
  writeFileSync(source, `process.stdout.write(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}));`);
  const result = await invoke({ args: ['a space', '芽'] });
  expect(result.data.args).toEqual(['a space', '芽']);
  expect(realpathSync(result.data.cwd)).toBe(realpathSync(dir));
  expect(result.receipt.sha256).toMatch(/^[a-f0-9]{64}$/); assertClean();
});

test.each(['parse', 'exit', 'limit', 'timeout', 'abort'])('%s closes its exact child and removes only its owned spool', async kind => {
  const pidFile = join(dir, 'pid'), abort = new AbortController();
  const start = `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(pidFile)},String(process.pid));`;
  const body = kind === 'parse' ? `process.stdout.write('invalid');` : kind === 'exit' ? `process.stdout.write('[]');process.exitCode=9;` : `const timer=setInterval(()=>process.stdout.write(' '.repeat(64)),5);setTimeout(()=>clearInterval(timer),2000);`;
  writeFileSync(source, start + body);
  // This separate child belongs to this test. A generator failure must leave it alive.
  const other = spawn(process.execPath, ['-e', 'setTimeout(()=>{},5000)'], { windowsHide: true, stdio: 'ignore' });
  const otherClosed = new Promise(resolve => other.once('close', resolve));
  try {
    await expect(invoke({ signal: abort.signal, policy: { maxStdoutBytes: kind === 'limit' ? 32 : 1024 * 1024, timeoutMs: kind === 'timeout' ? 500 : 3000 }, onProgress: event => { if (kind === 'abort' && event.bytes > 0) abort.abort(); } })).rejects.toThrow(kind === 'parse' ? /valid JSON/ : kind === 'exit' ? /code 9/ : kind === 'limit' ? /stdout exceeds 32/ : kind === 'timeout' ? /timed out/ : /canceled/);
    const pid = Number(readFileSync(pidFile, 'utf8')); expect(() => process.kill(pid, 0)).toThrow();
    expect(() => process.kill(other.pid, 0)).not.toThrow(); assertClean();
  } finally { other.kill(); await otherClosed; }
}, 10000);

test('preabort and oversized trusted policies do not create a spool or start a child', async () => {
  writeFileSync(source, `import {writeFileSync} from 'node:fs';writeFileSync('started','bad');console.log('[]');`);
  const abort = new AbortController(); abort.abort();
  await expect(invoke({ signal: abort.signal })).rejects.toThrow(/canceled/);
  await expect(invoke({ policy: { maxStdoutBytes: 512 * 1024 * 1024 + 1 } })).rejects.toThrow(/no greater than/);
  await expect(invoke({ policy: { timeoutMs: 60001 } })).rejects.toThrow(/no greater than/);
  expect(existsSync(join(dir, 'started'))).toBe(false); assertClean();
});

test.skipIf(process.platform === 'win32')('a child ignoring graceful termination receives only its exact bounded hard kill', async () => {
  writeFileSync(source, `process.on('SIGTERM',()=>{});setInterval(()=>process.stdout.write(' '),10);`);
  const start = Date.now(); await expect(invoke({ policy: { timeoutMs: 500, killGraceMs: 25 } })).rejects.toThrow(/timed out/);
  expect(Date.now() - start).toBeLessThan(3000); assertClean();
});

test.skipIf(process.platform === 'win32')('timeout closes inherited pipes even when the exact generator child already exited', async () => {
  writeFileSync(source, `import {spawn} from 'node:child_process';const child=spawn(process.execPath,['-e','setTimeout(()=>{},2000)'],{stdio:['ignore',process.stdout,process.stderr],windowsHide:true});child.unref();process.stdout.write('[]');`);
  const start = Date.now(); await expect(invoke({ policy: { timeoutMs: 500 } })).rejects.toThrow(/timed out/);
  expect(Date.now() - start).toBeLessThan(1500); assertClean();
}, 5000);

test('generator phase is reported before stdout arrives so a silent generator can be canceled', async () => {
  // The generator would answer after 10 s; a cancel that returns within 3 s cannot have waited for it. The wide gap keeps a loaded machine from failing the bound.
  writeFileSync(source, `setTimeout(()=>process.stdout.write('[]'),10000);`);
  const abort = new AbortController(), start = Date.now();
  await expect(invoke({ signal: abort.signal, policy: { timeoutMs: 5000 }, onProgress: event => { if (event.phase === 'generator' && event.bytes === 0) abort.abort(); } })).rejects.toThrow(/canceled/);
  expect(Date.now() - start).toBeLessThan(3000); assertClean();
});

test('spool read failures disclose no temporary absolute path and still remove owned files', async () => {
  writeFileSync(source, `process.stdout.write('[]');`);
  let failure;
  try { await invoke({ onProgress: event => {
    if (event.phase !== 'generator-parse') return;
    const spool = readdirSync(dir).find(name => name.startsWith('agent-sprites-generator-') && !name.endsWith('foreign'));
    rmSync(join(dir, spool, 'stdout.json'));
  } }); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(Error); expect(failure.message).not.toContain(dir); assertClean();
});
