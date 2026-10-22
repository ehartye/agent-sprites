const ROOT = '/api/workbench/imports';
const bounded = error => String(error?.message ?? error).slice(0, 600);

export class ProjectImportController {
  constructor({ getSessionId, isCurrent, onUpdate = () => {}, onComplete = () => {}, fetchImpl = globalThis.fetch.bind(globalThis), XMLHttpRequestImpl = globalThis.XMLHttpRequest, pollMs = 250 }) {
    Object.assign(this, { getSessionId, isCurrent, onUpdate, onComplete, fetchImpl, XMLHttpRequestImpl, pollMs });
    this.run = null;
  }
  async json(method, path, body, sessionId, signal) {
    const response = await this.fetchImpl(path, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(sessionId ? { 'X-Sprite-Session': sessionId } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...(signal ? { signal } : {}) });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(bounded(result.error ?? `Import request failed (${response.status})`));
    return result.data;
  }
  current(run) { return this.run === run && !run.canceled && this.isCurrent() && this.getSessionId() === run.sessionId; }
  isActivating() { return Boolean(this.run?.activating && !this.run.done); }
  update(run, data) { if (this.run === run) this.onUpdate({ ...data, busy: !run.done }); }
  async remove(run) {
    if (!run.id) return;
    // Cleanup deliberately carries no optimistic active-session header.
    run.removal ??= this.json('DELETE', `${ROOT}/${run.id}`).catch(error => { run.removal = null; throw error; });
    await run.removal;
  }
  async ensureCurrent(run) {
    if (this.current(run)) return true;
    run.canceled = true; await this.remove(run); return false;
  }
  async start(file, { name } = {}) {
    if (this.run && !this.run.done) throw new Error('An import is already running');
    const run = { sessionId: this.getSessionId(), canceled: false, done: false, abort: new AbortController() };
    this.run = run;
    this.update(run, { state: 'uploading', phase: 'allocating', loaded: 0, total: file.size });
    try {
      // Let allocation finish even if canceled, so its resulting ID can be deleted.
      run.creation = this.json('POST', ROOT, { filename: file.name, encoding: /\.gz$/i.test(file.name) ? 'gzip' : 'json', ...(name ? { name } : {}) }, run.sessionId);
      run.id = (await run.creation).id;
      if (!await this.ensureCurrent(run)) return null;
      await new Promise((resolve, reject) => {
        const xhr = run.xhr = new this.XMLHttpRequestImpl();
        xhr.open('PUT', `${ROOT}/${run.id}/file`);
        if (run.sessionId) xhr.setRequestHeader('X-Sprite-Session', run.sessionId);
        xhr.upload.onprogress = event => this.update(run, { state: 'uploading', phase: 'uploading', loaded: event.loaded, total: event.lengthComputable ? event.total : file.size });
        xhr.onload = () => {
          if (xhr.status === 202) resolve();
          else { let message = `Upload failed (${xhr.status})`; try { message = JSON.parse(xhr.responseText).error ?? message; } catch {} reject(new Error(bounded(message))); }
        };
        xhr.onerror = () => reject(new Error('Project upload failed'));
        xhr.onabort = () => reject(new DOMException('Import canceled', 'AbortError'));
        xhr.send(file);
      });
      run.xhr = null;
      while (await this.ensureCurrent(run)) {
        const job = await this.json('GET', `${ROOT}/${run.id}`, undefined, undefined, run.abort.signal);
        if (!await this.ensureCurrent(run)) return null;
        this.update(run, { ...job, loaded: job.source?.bytes ?? file.size, total: file.size });
        if (job.state === 'failed' || job.state === 'canceled') throw new Error(bounded(job.error ?? 'Import canceled'));
        if (job.state === 'ready') {
          if (!await this.ensureCurrent(run)) return null;
          run.activating = true;
          this.update(run, { state: 'activating', phase: 'activating' });
          if (!await this.ensureCurrent(run)) return null;
          // The commit's project broadcast may change the active session before
          // its HTTP receipt arrives. Keep that committed receipt authoritative.
          const receipt = await this.json('POST', `${ROOT}/${run.id}/activate`, {}, run.sessionId);
          run.done = true; this.update(run, { state: 'complete', phase: 'complete', receipt });
          if (this.run === run && !run.canceled && this.isCurrent()) this.onComplete(receipt);
          return receipt;
        }
        await new Promise((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(new DOMException('Import canceled', 'AbortError')); };
          const timer = setTimeout(() => { run.abort.signal.removeEventListener('abort', abort); resolve(); }, this.pollMs);
          run.abort.signal.addEventListener('abort', abort, { once: true });
          if (run.abort.signal.aborted) abort();
        });
      }
      return null;
    } catch (error) {
      if (run.canceled || error.name === 'AbortError') return null;
      run.done = true; this.update(run, { state: 'failed', phase: 'failed', error: bounded(error) });
      // Free live job capacity after client-side network or session errors.
      try { await this.remove(run); } catch {}
      throw new Error(bounded(error));
    } finally {
      run.xhr = null;
      if (!run.done) { run.done = true; this.update(run, { state: 'canceled', phase: 'canceled' }); }
    }
  }
  async cancel() {
    const run = this.run;
    if (!run || run.done) return;
    run.canceled = true; run.abort.abort(); run.xhr?.abort();
    if (run.creation) { try { run.id = (await run.creation).id; } catch { return; } }
    await this.remove(run);
  }
  async dispose() { await this.cancel(); }
}
