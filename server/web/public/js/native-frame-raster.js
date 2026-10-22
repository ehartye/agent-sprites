import { renderCellNative } from './cell-raster.js';

const identities = new WeakMap();
let nextIdentity = 0;
const identity = value => {
  if (!value || typeof value !== 'object') return value;
  if (!identities.has(value)) identities.set(value, ++nextIdentity);
  return identities.get(value);
};
const stable = value => JSON.stringify(value, (_, item) => item && !Array.isArray(item) && typeof item === 'object'
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const close = image => { if (image?.close) image.close(); else if (image) image.width = image.height = 0; };
const taskBytes = task => task.width * task.height * 4 + stable(task).length * 2;
const fallbackVariant = task => `|fallback:${task.fallbackColor ?? '#888'}`;
const rasterKey = task => {
  const base = nativeFrameKey(task);
  if (!base || !task.cell?.shapes) return base;
  const unresolved = ref => !ref || !ref.startsWith('#') && !(task.palette ?? {})[ref];
  const usesFallback = task.cell.shapes.some(shape => shape.visible !== false &&
    (unresolved(shape.color) || shape.params?.color2 != null && unresolved(shape.params.color2)));
  return usesFallback ? base + fallbackVariant(task) : base;
};

/** Explicit versions cover geometry and lighting, permitting hits after geometry
 * is evicted. Legacy callers
 * share ordered shape identities, independent of view-created cell wrappers.
 * In-place edits must invalidate the descriptor, or supply a new cellVersion. */
export function nativeFrameKey(task) {
  const version = task.cellVersion ?? (Array.isArray(task.cell?.shapes) ? task.cell.shapes.map(identity) : null);
  if (version === null) return null;
  return stable([task.projectId ?? 'legacy', task.ref, version, task.width, task.height,
    task.palette ?? {}, task.background ?? { mode: 'transparent' }, task.viewKey ?? '', task.channel ?? 'color', task.lighting ?? (task.cellVersion == null ? task.cell?.lighting : undefined)]);
}

/** null denotes a project/view switch; otherwise only changed frame versions. */
export function changedFrameRefs(previous, next) {
  if ((previous.projectId ?? 'legacy') !== (next.projectId ?? 'legacy') || (previous.viewKey ?? '') !== (next.viewKey ?? '')) return null;
  const before = previous.cellVersions ?? {}, after = next.cellVersions ?? {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(ref => before[ref] !== after[ref]);
}

/** The worker and scheduled fallback call precisely the same canonical code. */
export function rasterNativeFrame(task, createCanvas) {
  const palette = task.palette ?? {};
  const shapes = [...task.cell.shapes].filter(s => s.visible !== false || s.params?.layers?.length).sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const fallback = task.fallbackColor ?? '#888';
  return renderCellNative(shapes, task.width, task.height, ref => !ref ? fallback : ref.startsWith('#') ? ref : palette[ref] || fallback,
    { createCanvas, lighting: task.cell.lighting ?? task.lighting, background: task.background, palette, channel: task.channel });
}

const defaultWorker = () => typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && typeof OffscreenCanvas.prototype.transferToImageBitmap === 'function'
  ? new Worker(new URL('./native-frame-worker.js', import.meta.url), { type: 'module' }) : null;

/** One serial native raster lane. Queue: 32 / 16 MiB (task JSON UTF-16 plus
 * output bytes); one in-flight task at the same byte ceiling. Native bitmap
 * LRU: 256 / 64 MiB. Borrowed images survive eviction until release(). */
export class NativeRasterService {
  constructor({ workerFactory = defaultWorker, maxQueue = 32, maxQueueBytes = 16 * 1024 * 1024,
    maxEntries = 256, maxBytes = 64 * 1024 * 1024 } = {}) {
    this._workerFactory = workerFactory; this._workerDisabled = false; this._worker = null;
    this._maxQueue = maxQueue; this._maxQueueBytes = maxQueueBytes; this._maxEntries = maxEntries; this._maxBytes = maxBytes;
    this._queue = []; this._jobs = new Map(); this._cache = new Map(); this._bytes = 0;
    this._consumers = new Set(); this._running = null; this._timer = null; this._sequence = 0;
  }

  get stats() { return { queued: this._queue.length, queuedBytes: this._queue.reduce((n, job) => n + job.bytes, 0), inFlight: this._running ? 1 : 0, entries: this._cache.size, bytes: this._bytes }; }
  canRetainFrames(count, width, height) { return count <= this._maxEntries && count * width * height * 4 <= this._maxBytes; }

  createConsumer({ onAvailable, onInvalidate } = {}) {
    const owner = { project: null, subscriptions: new Set(), disposed: false, onAvailable, onInvalidate, capacityBlocked: false };
    this._consumers.add(owner);
    return {
      // onReady borrows synchronously; the service releases in finally. peek
      // callers own their lease until release. Consumers never own the image.
      request: (task, options = {}) => this._request(owner, task, options),
      peek: task => { if (owner.disposed) return null; this._setProject(owner, task.projectId); return this._peek(task); },
      invalidate: task => { if (!owner.disposed) this._invalidate(task); },
      setProject: project => this._setProject(owner, project),
      dispose: () => {
        if (owner.disposed) return;
        owner.disposed = true; this._cancelOwner(owner); this._consumers.delete(owner); this._releaseProject(owner.project);
        if (!this._consumers.size) this._reset();
      },
    };
  }

  _setProject(owner, project) {
    project ??= 'legacy';
    if (owner.disposed || owner.project === project) return;
    this._cancelOwner(owner); owner.capacityBlocked = false; const old = owner.project; owner.project = project; this._releaseProject(old);
  }

  _lease(entry) {
    entry.borrowers++;
    let released = false;
    return { image: entry.image, release: () => { if (released) return; released = true; entry.borrowers--; if (!entry.retained && !entry.borrowers) close(entry.image); } };
  }

  _peek(task) {
    let key = rasterKey(task), entry = this._cache.get(key);
    if (!entry && !task.cell?.shapes && key) { key += fallbackVariant(task); entry = this._cache.get(key); }
    if (!entry) return null;
    this._cache.delete(key); this._cache.set(key, entry); return this._lease(entry);
  }

  _deliver(subscriber, entry) {
    if (!subscriber.active) return;
    subscriber.active = false; subscriber.owner.subscriptions.delete(subscriber);
    subscriber.job?.subscribers.delete(subscriber);
    const lease = this._lease(entry);
    try { subscriber.onReady?.(lease); } finally { lease.release(); }
  }

  _request(owner, task, { priority = 2, onReady, onMissing } = {}) {
    if (owner.disposed) return () => {};
    const project = task.projectId ?? 'legacy';
    this._setProject(owner, project);
    const key = rasterKey(task), lease = this._peek(task);
    if (lease) { try { onReady?.(lease); } finally { lease.release(); } return () => {}; }
    if (!key || !Array.isArray(task.cell?.shapes)) { onMissing?.(task.ref, 'unloaded'); return () => {}; }
    let job = this._jobs.get(key);
    // An invalidated job retains its live subscribers in one bounded slot,
    // even if a source edit splits or merges their fallback-color variants.
    job ??= [...this._jobs.values()].find(candidate => candidate.refreshed && nativeFrameKey(candidate.task) === nativeFrameKey(task));
    if (job?.refreshed) task = { ...task, cell: job.task.cell };
    const bytes = taskBytes(task);
    if (!Number.isSafeInteger(bytes) || bytes < 1) { onMissing?.(task.ref, 'invalid'); return () => {}; }
    if (bytes > this._maxQueueBytes || this._maxQueue < 1) { onMissing?.(task.ref, 'oversize'); return () => {}; }
    if (!job) {
      job = { key, task, project, priority, bytes, subscribers: new Set(), id: ++this._sequence };
      while (this._queue.length >= this._maxQueue || this.stats.queuedBytes + bytes > this._maxQueueBytes) {
        const worst = [...this._queue].sort((a, b) => b.priority - a.priority || b.id - a.id)[0];
        if (!worst || worst.priority <= priority) { owner.capacityBlocked = true; onMissing?.(task.ref, 'capacity'); return () => {}; }
        this._drop(worst, 'capacity');
      }
      this._jobs.set(key, job); this._queue.push(job);
    } else if (bytes > job.bytes) {
      if (this._queue.includes(job) && this.stats.queuedBytes - job.bytes + bytes > this._maxQueueBytes) {
        owner.capacityBlocked = true; onMissing?.(task.ref, 'capacity'); return () => {};
      }
      job.bytes = bytes;
    }
    const subscriber = { owner, onReady, onMissing, active: true, task, priority };
    job.priority = Math.min(job.priority, priority); job.subscribers.add(subscriber); subscriber.job = job; owner.subscriptions.add(subscriber);
    this._schedule();
    return () => this._cancel(subscriber);
  }

  _cancel(subscriber) {
    subscriber.active = false; subscriber.owner.subscriptions.delete(subscriber); subscriber.job?.subscribers.delete(subscriber);
    const job = subscriber.job;
    if (job && job !== this._running && !job.subscribers.size) this._drop(job);
  }
  _cancelOwner(owner) { for (const subscriber of [...owner.subscriptions]) this._cancel(subscriber); }
  _drop(job, reason) {
    this._queue = this._queue.filter(item => item !== job); if (this._jobs.get(job.key) === job) this._jobs.delete(job.key);
    const subscribers = [...job.subscribers];
    job.subscribers.clear();
    for (const sub of subscribers) { sub.active = false; sub.owner.subscriptions.delete(sub); }
    if (reason) for (const sub of subscribers) { if (reason === 'capacity') sub.owner.capacityBlocked = true; sub.onMissing?.(job.task.ref, reason); }
  }
  _invalidate(task) {
    const key = nativeFrameKey(task), ref = task.ref, project = task.projectId ?? 'legacy';
    if (!key) return;
    for (const candidate of this._cache.keys()) if (candidate === key || candidate.startsWith(key + '|fallback:')) this._evict(candidate);
    for (const [candidate, job] of [...this._jobs]) if (candidate === key || candidate.startsWith(key + '|fallback:')) {
      const refreshed = [...job.subscribers].map(sub => ({ sub, task: { ...sub.task, cell: task.cell ?? sub.task.cell } }));
      const bytes = refreshed.reduce((max, item) => Math.max(max, taskBytes(item.task)), taskBytes({ ...job.task, cell: task.cell ?? job.task.cell }));
      job.refreshed = true; job.invalid = job === this._running;
      if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > this._maxQueueBytes) {
        this._drop(job, Number.isSafeInteger(bytes) && bytes > 0 ? 'oversize' : 'invalid');
        job.task = { ...job.task, cell: undefined };
        continue;
      }
      job.bytes = bytes; job.task = { ...job.task, cell: task.cell ?? job.task.cell };
      for (const item of refreshed) item.sub.task = item.task;
    }
    while (this.stats.queuedBytes > this._maxQueueBytes) {
      const worst = [...this._queue].sort((a, b) => b.priority - a.priority || b.id - a.id)[0];
      this._drop(worst, 'capacity');
    }
    // Consumers may request replacements or cancel subscriptions here; the
    // cache, refreshed jobs and byte accounting are coherent before notifying.
    for (const owner of [...this._consumers]) if (!owner.disposed && owner.project === project) {
      owner.onInvalidate?.({ key, ref });
    }
  }
  _evict(key) {
    const entry = this._cache.get(key); this._cache.delete(key); this._bytes -= entry.bytes; entry.retained = false;
    if (!entry.borrowers) close(entry.image);
  }
  _releaseProject(project) {
    if (project === null || [...this._consumers].some(owner => owner.project === project)) return;
    for (const [key, entry] of this._cache) if (entry.project === project) this._evict(key);
    for (const job of [...this._queue]) if (job.project === project) this._drop(job);
    if (this._running?.project === project) {
      this._worker?.terminate(); this._worker = null; this._jobs.delete(this._running.key); this._running = null; this._schedule();
    }
  }
  _reset() {
    clearTimeout(this._timer); this._timer = null; this._worker?.terminate(); this._worker = null;
    this._running = null; this._jobs.clear(); this._queue = [];
    for (const key of this._cache.keys()) this._evict(key);
  }
  _schedule() {
    if (this._running || this._timer !== null || !this._queue.length) return;
    this._timer = setTimeout(() => { this._timer = null; this._pump(); }, 0);
  }
  _pump() {
    if (this._running || !this._queue.length) return;
    this._queue.sort((a, b) => a.priority - b.priority || a.id - b.id);
    const job = this._running = this._queue.shift();
    this._dispatch(job);
  }
  _dispatch(job) {
    if (this._running !== job) { this._schedule(); return; }
    if (job.refreshed) {
      const next = [...job.subscribers].sort((a, b) => a.priority - b.priority)[0];
      if (!next) { this._finishOrRepeat(job); return; }
      job.task = next.task;
    }
    job.invalid = false; job.renderKey = rasterKey(job.task);
    const cached = this._cache.get(job.renderKey);
    if (cached) {
      this._cache.delete(job.renderKey); this._cache.set(job.renderKey, cached);
      const lease = this._lease(cached);
      try { this._deliverMatching(job, cached); } finally { lease.release(); }
      this._finishOrRepeat(job); return;
    }
    if (!this._workerDisabled && !this._worker) {
      try {
        this._worker = this._workerFactory();
        if (!this._worker) this._workerDisabled = true;
        else {
          const worker = this._worker;
          worker.onmessage = event => { if (this._worker === worker) this._receive(event.data); else close(event.data.image); };
          worker.onerror = event => { event.preventDefault?.(); if (this._worker === worker) this._workerFailed(); };
          worker.onmessageerror = () => { if (this._worker === worker) this._workerFailed(); };
        }
      } catch { this._workerFailed(); return; }
    }
    if (this._worker) {
      try { this._worker.postMessage({ id: job.id, task: job.task }); } catch { this._workerFailed(); }
      return;
    }
    this._fallback(job);
  }
  _fallback(job) {
    if (this._running !== job) { this._schedule(); return; }
    try { this._receive({ id: job.id, image: rasterNativeFrame(job.task) }); }
    catch (error) { this._receive({ id: job.id, error: error.message }); }
  }
  _workerFailed() {
    this._workerDisabled = true; this._worker?.terminate(); this._worker = null;
    const job = this._running;
    if (job) this._timer = setTimeout(() => { this._timer = null; this._dispatch(job); }, 0);
    else this._schedule();
  }
  _receive({ id, image, error }) {
    const job = this._running;
    if (!job || id !== job.id) { close(image); return; }
    if (error && this._worker) { close(image); this._workerFailed(); return; }
    if (job.invalid) {
      close(image);
    } else if (error) {
      close(image); this._drop(job, 'error');
    } else {
      const entry = { image, bytes: job.task.width * job.task.height * 4, project: job.project, borrowers: 1, retained: true };
      if (this._cache.has(job.renderKey)) this._evict(job.renderKey);
      this._cache.set(job.renderKey, entry); this._bytes += entry.bytes;
      while (this._cache.size > this._maxEntries || this._bytes > this._maxBytes) this._evict(this._cache.keys().next().value);
      try { this._deliverMatching(job, entry); }
      finally { entry.borrowers--; if (!entry.retained && !entry.borrowers) close(image); }
    }
    this._finishOrRepeat(job);
  }
  _deliverMatching(job, entry) {
    for (const sub of [...job.subscribers]) {
      if (job.invalid) break;
      if (!job.refreshed || rasterKey(sub.task) === job.renderKey) this._deliver(sub, entry);
    }
  }
  _finishOrRepeat(job) {
    if (this._running !== job) return;
    if (job.subscribers.size && (job.invalid || job.refreshed)) {
      job.id = ++this._sequence;
      this._timer = setTimeout(() => { this._timer = null; this._dispatch(job); }, 0);
      return;
    }
    this._running = null; if (this._jobs.get(job.key) === job) this._jobs.delete(job.key);
    this._schedule();
    for (const owner of this._consumers) if (owner.capacityBlocked) {
      owner.capacityBlocked = false; owner.onAvailable?.();
    }
  }
}

export const nativeRasterService = new NativeRasterService();
