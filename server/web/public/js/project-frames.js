const priority = { selected: 0, current: 1, adjacent: 2, visible: 3, preparation: 4 };
export const FRAME_CACHE_DEFAULTS = Object.freeze({ maxEntries: 32, maxBytes: 16 * 1024 * 1024, maxPending: 64, batchSize: 8 });
const identity = p => `${p?.sessionId}\0${p?.projectId}`;
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;

/** Bounded geometry staging, independent of the longer-lived native bitmap cache.
 * 32 cells / 16 MiB of serialized cells+members; 64 waiting refs, one <=8-ref
 * request. Selection preempts offscreen work. Eviction leaves metadata intact. */
export class ProjectFrames {
  constructor({ fetch = globalThis.fetch.bind(globalThis), onChange = () => {}, refresh = async () => {}, ...limits } = {}) {
    Object.assign(this, FRAME_CACHE_DEFAULTS, limits, { fetch, onChange, refresh });
    this.batchSize = Math.min(8, this.batchSize);
    this.entries = new Map(); this.pending = new Map(); this.errors = new Map(); this.attempts = new Map();
    this.bytes = 0; this.generation = 0; this.project = null; this.selected = null;
  }
  get pins() { const { sessionId, projectId, revision } = this.project ?? {}; return { sessionId, projectId, revision }; }
  setSummary(summary) {
    if (this.project && identity(summary) === identity(this.project) && summary.revision < this.project.revision) return false;
    if (identity(summary) !== identity(this.project)) {
      this.generation++; this.inflight?.controller.abort(); this.inflight = null;
      this.entries.clear(); this.pending.clear(); this.errors.clear(); this.attempts.clear(); this.bytes = 0;
    }
    const previous = this.project;
    this.metadata = summary.cells;
    this.project = { ...summary, cells: { ...summary.cells } };
    for (const [ref, entry] of this.entries) {
      if (entry.version !== summary.cellVersions[ref]) this._evict(ref);
      else this.project.cells[ref] = entry.cell;
    }
    for (const ref of new Set([...this.errors.keys(), ...this.attempts.keys()])) if (previous?.cellVersions[ref] !== summary.cellVersions[ref]) { this.errors.delete(ref); this.attempts.delete(ref); }
    this.onChange(this.project);
    if (this.selected) this.demand(this.selected, 'selected');
    this._schedule(); return true;
  }
  select(ref) { this.selected = ref; this.demand(ref, 'selected'); }
  status(ref) {
    if (this.errors.has(ref)) return { state: 'error', error: this.errors.get(ref) };
    return { state: Array.isArray(this.project?.cells[ref]?.shapes) ? 'ready' : 'loading' };
  }
  groups(ref) { return this.entries.get(ref)?.groups ?? {}; }
  demand(ref, demand = 'visible') {
    if (!Object.hasOwn(this.project?.cellVersions ?? {}, ref) || this.errors.has(ref)) return;
    if (this.entries.has(ref)) { const entry = this.entries.get(ref); this.entries.delete(ref); this.entries.set(ref, entry); return; }
    const rank = priority[demand] ?? priority.visible;
    if (this.inflight?.refs.includes(ref)) return;
    if (rank === 0 && this.inflight && !this.inflight.refs.includes(this.selected)) {
      const old = this.inflight; old.controller.abort(); this.inflight = null;
      for (const item of old.refs) this._enqueue(item, priority.visible);
    }
    this._enqueue(ref, rank); this._schedule();
  }
  _enqueue(ref, rank) {
    if (this.pending.has(ref)) { this.pending.set(ref, Math.min(rank, this.pending.get(ref))); return; }
    if (this.pending.size >= this.maxPending) {
      const worst = [...this.pending].sort((a, b) => b[1] - a[1])[0];
      if (!worst || worst[1] <= rank) return;
      this.pending.delete(worst[0]);
    }
    this.pending.set(ref, rank);
  }
  _schedule() {
    if (this.scheduled || this.inflight || !this.pending.size) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (this.inflight || !this.pending.size || !this.project) return;
      const refs = [...this.pending].sort((a, b) => a[1] - b[1]).slice(0, this.batchSize).map(([ref]) => ref);
      for (const ref of refs) this.pending.delete(ref);
      const job = { refs, controller: new AbortController(), pins: this.pins, generation: this.generation };
      this.inflight = job;
      void this._load(job, refs).finally(() => { if (this.inflight === job) this.inflight = null; this._schedule(); });
    });
  }
  _current(job) { return !job.controller.signal.aborted && job.generation === this.generation && identity(job.pins) === identity(this.project); }
  async _load(job, refs) {
    if (!this._current(job)) return;
    try {
      const query = new URLSearchParams({ refs: refs.join('|'), ...job.pins });
      if (bytes(query.toString()) > 2048) throw new Error('Frame request is too long');
      const response = await this.fetch(`/api/workbench/frames?${query}`, { signal: job.controller.signal });
      if (!this._current(job)) return;
      if (response.status === 413 && refs.length > 1) {
        const mid = Math.ceil(refs.length / 2);
        await this._load(job, refs.slice(0, mid)); await this._load(job, refs.slice(mid)); return;
      }
      if (response.status === 409) {
        const retry = refs.filter(ref => (this.attempts.get(ref) ?? 0) < 1);
        for (const ref of refs) this.attempts.set(ref, (this.attempts.get(ref) ?? 0) + 1);
        if (retry.length) {
          for (const ref of refs) if (!retry.includes(ref)) this.errors.set(ref, 'The project changed again. Refresh before loading this frame.');
          this.onChange(this.project);
          await this.refresh();
          if (!this._current(job)) return;
          for (const ref of retry) this._enqueue(ref, ref === this.selected ? 0 : 3);
          return;
        }
        throw new Error('The project changed again. Select the frame again after refreshing.');
      }
      if (!response.ok) throw new Error(response.status === 413 ? 'This frame is too large to load (8 MiB response limit).' : `Frame request failed (${response.status})`);
      const result = await response.json(), data = result.data;
      if (!this._current(job)) return;
      if (!result.ok || identity(data) !== identity(this.project)) throw new Error('Frame response belongs to another project');
      for (const ref of refs) {
        if (data.cellVersions[ref] !== this.project.cellVersions[ref]) { this._enqueue(ref, ref === this.selected ? 0 : 3); continue; }
        const cell = data.cells[ref], groups = data.shapeGroups?.[ref] ?? {};
        if (!Array.isArray(cell?.shapes)) throw new Error('Incomplete frame response');
        const size = bytes([cell, groups]);
        if (size > this.maxBytes) { this.errors.set(ref, 'This frame is too large for the geometry cache.'); continue; }
        if (!this.entries.has(ref)) {
          this.entries.set(ref, { cell, groups, version: data.cellVersions[ref], bytes: size }); this.bytes += size;
          this.project.cells[ref] = cell;
        }
      }
      while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
        const ref = [...this.entries.keys()].find(ref => ref !== this.selected);
        if (!ref) break; this._evict(ref);
      }
      this.onChange(this.project);
    } catch (error) {
      if (!this._current(job)) return;
      for (const ref of refs) this.errors.set(ref, error.message);
      this.onChange(this.project);
    }
  }
  _evict(ref) {
    const entry = this.entries.get(ref); if (!entry) return;
    this.bytes -= entry.bytes; this.entries.delete(ref);
    if (this.metadata?.[ref]) this.project.cells[ref] = this.metadata[ref];
    else if (this.project) delete this.project.cells[ref];
  }
  destroy() { this.generation++; this.inflight?.controller.abort(); this.inflight = null; this.pending.clear(); this.entries.clear(); this.errors.clear(); this.attempts.clear(); this.bytes = 0; this.project = this.metadata = null; }
}
