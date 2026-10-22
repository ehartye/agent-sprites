import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { spoolBoundedInput } from '../io/bounded-input.js';
import { Project } from '../engine/project.js';
import { activateProjectCopy, projectName } from '../session-activation.js';

export const IMPORT_LIMITS = Object.freeze({ maxSourceBytes: 512 * 1024 * 1024, maxExpandedBytes: 512 * 1024 * 1024,
  maxCells: 10000, maxShapes: 200000, maxWorkers: 1, maxLiveJobs: 4, validationTimeoutMs: 120000, workerOldGenerationMb: 3072, expiryMs: 15 * 60 * 1000 });
const terminal = job => ['complete', 'failed', 'canceled'].includes(job.state);
const fail = (message, status = 409) => Object.assign(new Error(message), { status });

export class ProjectImportJobs {
  constructor(state, options = {}) {
    this.state = state; this.jobs = new Map(); this.running = 0; this.closed = false;
    this.directory = resolve(options.directory ?? tmpdir());
    this.limits = Object.fromEntries(Object.entries(IMPORT_LIMITS).map(([key, value]) => {
      const setting = options[key] ?? value;
      if (!Number.isSafeInteger(setting) || setting <= 0 || setting > value) throw new Error(`Invalid trusted import limit: ${key}`);
      return [key, setting];
    }));
    this.workerUrl = options.workerUrl ?? new URL('./project-import-worker.js', import.meta.url);
    this.timer = setInterval(() => { this.expire().catch(() => {}); }, Math.min(30000, this.limits.expiryMs)); this.timer.unref();
  }
  pins(job) {
    if (this.state.sessionId !== job.sessionId || this.state.project !== job.project) throw fail('The active session changed. Import this file again for the current design.');
  }
  get(id) { const job = this.jobs.get(id); if (!job) throw fail('Import job not found or expired', 404); job.touched = Date.now(); return job; }
  status(job) {
    return { id: job.id, filename: job.filename, encoding: job.encoding, state: job.state, phase: job.phase,
      source: { bytes: job.sourceBytes, ...(job.source ?? {}) }, expanded: { bytes: job.expandedBytes, ...(job.expanded ?? {}) },
      limits: this.limits, ...(job.summary ? { summary: job.summary, output: job.output } : {}),
      ...(job.cleanupWarning ? { cleanupWarning: job.cleanupWarning } : {}),
      ...(job.error ? { error: job.error } : {}), ...(job.receipt ? { receipt: job.receipt } : {}) };
  }
  async create({ filename, encoding, name } = {}) {
    if (this.closed) throw fail('Import service is shutting down', 503);
    await this.expire();
    if (this.closed) throw fail('Import service is shutting down', 503);
    if ([...this.jobs.values()].filter(job => !terminal(job)).length >= this.limits.maxLiveJobs) throw fail('Import queue is full', 429);
    if (typeof filename !== 'string' || filename.length > 240 || !['json', 'gzip'].includes(encoding)) throw fail('Provide a filename and json or gzip encoding', 400);
    if (name !== undefined) name = projectName(name);
    // Reserve capacity before the first asynchronous allocation.
    const job = { id: randomUUID(), filename, encoding, name, state: 'uploading', phase: 'waiting for file',
      sessionId: this.state.sessionId, project: this.state.project, sourceBytes: 0, expandedBytes: 0,
      touched: Date.now(), abort: new AbortController() };
    this.jobs.set(job.id, job);
    try {
      job.allocation = mkdtemp(join(this.directory, 'agent-sprites-import-')).then(dir => { job.dir = dir; });
      await job.allocation;
      if (this.closed || job.abort.signal.aborted) { await this.cleanup(job); throw fail('Import allocation canceled during shutdown', 503); }
    }
    catch (error) {
      if (!job.dir) this.jobs.delete(job.id);
      else await this.failed(job, error);
      throw new Error(this.diagnostic(error));
    }
    return job;
  }
  async cleanup(job) {
    if (!job.dir) return;
    // Only the exact directory returned by this service's mkdtemp is removable.
    if (dirname(resolve(job.dir)) !== this.directory) throw new Error('Import cleanup ownership mismatch');
    await rm(job.dir, { recursive: true, force: true }); job.dir = null;
  }
  async failed(job, error) {
    const message = this.diagnostic(error);
    await this.releaseFiles(job);
    if (job.state !== 'canceled') { job.state = 'failed'; job.phase = 'failed'; job.error = message; }
    job.touched = Date.now(); job.project = null;
  }
  async releaseFiles(job) {
    try { await this.cleanup(job); delete job.cleanupWarning; }
    catch (error) { job.cleanupWarning = this.diagnostic(error).slice(0, 300); }
  }
  diagnostic(error) {
    if (error?.code) return `Import storage or worker operation failed (${String(error.code).replace(/[^A-Z0-9_]/g, '').slice(0, 40)})`;
    return String(error?.message ?? error).replaceAll(this.directory, '[temporary storage]').slice(0, 600);
  }
  async upload(job, input) {
    this.pins(job);
    if (this.closed || job.state !== 'uploading' || job.operation) throw fail('This import is not accepting a file');
    job.phase = 'uploading';
    job.operation = (async () => {
      try {
        const receipts = await spoolBoundedInput(input, join(job.dir, 'expanded.json'), { encoding: job.encoding, ...this.limits, signal: job.abort.signal,
          onProgress: progress => { Object.assign(job, progress); job.touched = Date.now(); } });
        Object.assign(job, receipts);
        if (job.abort.signal.aborted) return;
        job.state = 'validating'; job.phase = 'queued';
      } catch (error) { await this.failed(job, error); }
    })();
    await job.operation; job.operation = null; this.pump();
  }
  pump() {
    if (this.closed || this.running >= this.limits.maxWorkers) return;
    const job = [...this.jobs.values()].find(j => j.state === 'validating' && !j.operation);
    if (!job) return;
    this.running++; job.phase = 'validating';
    let validated;
    job.operation = this.validate(job).then(result => { validated = result; }).catch(error => this.failed(job, error)).finally(() => {
      job.operation = null;
      if (validated && !job.abort.signal.aborted) {
        job.summary = validated.summary; job.output = validated.output; job.state = 'ready'; job.phase = 'ready'; job.touched = Date.now();
      }
      this.running--; this.pump();
    });
  }
  async validate(job) {
    const worker = new Worker(this.workerUrl, { workerData: { input: join(job.dir, 'expanded.json'), output: join(job.dir, 'validated.json'), limits: this.limits, name: job.name }, resourceLimits: { maxOldGenerationSizeMb: this.limits.workerOldGenerationMb } });
    job.worker = worker;
    let timeout;
    try {
      const result = await new Promise((resolve, reject) => {
        timeout = setTimeout(() => { reject(new Error('Import validation timed out')); }, this.limits.validationTimeoutMs);
        worker.once('message', resolve); worker.once('error', () => reject(new Error('Import validation worker failed')));
        worker.once('exit', code => reject(new Error(`Import validation worker exited (${code})`)));
      });
      if (job.abort.signal.aborted) return;
      if (result.error) throw new Error(result.error);
      return result;
    } finally { clearTimeout(timeout); await worker.terminate(); job.worker = null; }
  }
  async activate(job) {
    if (job.state === 'complete') return job.receipt;
    this.pins(job);
    if (job.state !== 'ready' || this.closed) throw fail('Import is not ready to activate');
    job.state = 'activating'; job.phase = 'activating';
    job.operation = (async () => {
      try {
        const bytes = await readFile(join(job.dir, 'validated.json'), { signal: job.abort.signal });
        if (bytes.length !== job.output.bytes || createHash('sha256').update(bytes).digest('hex') !== job.output.sha256) throw new Error('Validated import receipt mismatch');
        if (job.abort.signal.aborted) throw new Error('Import canceled');
        this.pins(job);
        const project = Project.fromJSON(JSON.parse(bytes.toString('utf8')));
        if (job.abort.signal.aborted) throw new Error('Import canceled');
        this.pins(job);
        job.receipt = activateProjectCopy(this.state, project); job.state = 'complete'; job.phase = 'complete'; job.touched = Date.now(); job.project = null;
        await this.releaseFiles(job); return job.receipt;
      } catch (error) { await this.failed(job, error); throw new Error(this.diagnostic(error)); }
    })();
    try { return await job.operation; } finally { job.operation = null; }
  }
  async cancel(job) {
    if (job.state === 'complete') { await job.operation?.catch(() => {}); await this.releaseFiles(job); return; }
    job.state = 'canceled'; job.phase = 'canceled'; job.touched = Date.now(); job.abort.abort();
    await job.allocation?.catch(() => {});
    await job.worker?.terminate(); await job.operation?.catch(() => {}); await this.releaseFiles(job); job.project = null; this.pump();
  }
  async expire() {
    const now = Date.now();
    for (const [id, job] of this.jobs) if (now - job.touched >= this.limits.expiryMs) {
      await this.cancel(job);
      if (!job.dir) this.jobs.delete(id);
    }
  }
  async close() {
    this.closed = true; clearInterval(this.timer);
    await Promise.all([...this.jobs.values()].map(job => this.cancel(job)));
    if ([...this.jobs.values()].some(job => job.dir)) throw new Error('Import cleanup could not remove all owned files; retry shutdown');
  }
  async dispose() { await this.close(); }
}
