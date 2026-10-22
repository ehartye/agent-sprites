import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { byteCounter } from '../io/bounded-input.js';

const defaults = Object.freeze({ maxStdoutBytes: 512 * 1024 * 1024, maxStderrBytes: 64 * 1024, timeoutMs: 60000, killGraceMs: 1000 });
const canceled = () => new Error('Build canceled.');
const notify = (observer, event) => { try { observer?.(event); } catch { /* Observers cannot own build lifecycle. */ } };

function limits(policy) {
  return Object.fromEntries(Object.entries(defaults).map(([key, maximum]) => {
    const value = policy[key] ?? maximum;
    if (!Number.isSafeInteger(value) || value < (key === 'maxStderrBytes' ? 0 : 1) || value > maximum) throw new Error(`Generator ${key} must be an integer no greater than ${maximum}.`);
    return [key, value];
  }));
}

/** One exact child and one unique spool directory belong to this invocation. */
export async function readGeneratorInput({ source, args = [], cwd, signal, onProgress, policy = {}, temporaryRoot = tmpdir() }) {
  if (signal?.aborted) throw canceled();
  const bound = limits(policy), chunks = [];
  let owned, child, timeout, hardKill, failure, totalBytes = 0, retainedBytes = 0, closed;
  const controller = new AbortController();
  const stderr = () => ({ text: Buffer.concat(chunks, retainedBytes).toString('utf8'), totalBytes, truncated: totalBytes > retainedBytes });
  const stop = error => {
    failure ??= error;
    controller.abort();
    if (!child) return;
    // An exited child can leave inherited pipe handles open in a descendant.
    // Close our streams without touching that descendant or waiting for it.
    child.stdout.destroy(); child.stderr.destroy();
    if (child.exitCode !== null || child.signalCode !== null) return;
    // Never signal a PID discovered elsewhere, a process group, or a process tree.
    child.kill();
    hardKill ??= setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }, bound.killGraceMs);
  };
  const abort = () => stop(canceled());
  try {
    owned = await mkdtemp(join(temporaryRoot, 'agent-sprites-generator-'));
    if (signal?.aborted) throw canceled();
    child = spawn(process.execPath, [source, ...args], { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    closed = new Promise(resolve => {
      child.once('error', error => { stop(new Error(`Generator could not start: ${error.message}`)); });
      child.once('close', (code, exitSignal) => resolve({ code, signal: exitSignal }));
    });
    child.stderr.on('data', chunk => {
      totalBytes += chunk.length;
      const take = Math.min(chunk.length, bound.maxStderrBytes - retainedBytes);
      if (take > 0) { chunks.push(Buffer.from(chunk.subarray(0, take))); retainedBytes += take; }
    });
    child.stderr.on('error', error => stop(error));
    signal?.addEventListener('abort', abort, { once: true });
    notify(onProgress, { phase: 'generator', bytes: 0 });
    if (signal?.aborted) abort();
    timeout = setTimeout(() => stop(new Error(`Generator timed out after ${bound.timeoutMs} ms.`)), bound.timeoutMs);
    const counter = byteCounter({ limit: bound.maxStdoutBytes, label: 'Generator stdout', onProgress: bytes => notify(onProgress, { phase: 'generator', bytes }) });
    const spool = join(owned, 'stdout.json');
    const streamed = pipeline(child.stdout, counter, createWriteStream(spool, { flags: 'wx' }), { signal: controller.signal }).catch(error => { stop(error); });
    const [exit] = await Promise.all([closed, streamed]);
    clearTimeout(timeout); clearTimeout(hardKill);
    if (failure) throw failure;
    if (signal?.aborted) throw canceled();
    if (exit.code !== 0) throw new Error(`Generator exited with ${exit.signal ? `signal ${exit.signal}` : `code ${exit.code}`}.`);
    const receipt = counter.receipt();
    notify(onProgress, { phase: 'generator-parse', bytes: receipt.bytes });
    if (signal?.aborted) throw canceled();
    const text = await readFile(spool, 'utf8');
    if (signal?.aborted) throw canceled();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('Generator stdout is not valid JSON.'); }
    if (signal?.aborted) throw canceled();
    return { data, receipt, stderr: stderr() };
  } catch (error) {
    if (child) { stop(error); await closed; }
    error.message = error.message.replaceAll(owned ?? join(temporaryRoot, 'agent-sprites-generator-'), '[generator spool]');
    error.generatorStderr = stderr();
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    clearTimeout(timeout); clearTimeout(hardKill);
    child?.stdout.destroy(); child?.stderr.destroy();
    // Only the directory returned by this invocation's mkdtemp is removed.
    if (owned) {
      try { await rm(owned, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 }); }
      catch (cause) { const error = new Error(`Generator spool cleanup failed (${cause.code ?? 'I/O error'}).`, { cause }); error.generatorStderr = stderr(); throw error; }
    }
  }
}
