const uncertain = message => `${message} Build outcome unconfirmed; inspect output before retrying.`;
const responseError = message => Object.assign(new Error(message), { buildResponse: true });

/** One offline build request. Its receipt remains authoritative after publishing starts. */
export class ProjectBuildController {
  constructor({ fetchImpl = (...args) => globalThis.fetch(...args), isCurrent = () => true, onUpdate = () => {} } = {}) {
    Object.assign(this, { fetchImpl, isCurrent, onUpdate });
    this.run = null;
    this.disposed = false;
  }
  get busy() { return Boolean(this.run && !this.run.done); }
  update(run, value) {
    if (this.disposed || this.run !== run) return;
    if (!this.isCurrent()) { this.dispose(); return; }
    this.onUpdate({ ...value, busy: !run.done, cancellable: !run.done && !run.committing && !run.cancelRequested });
  }
  cancel() {
    const run = this.run;
    if (!run || run.done || run.committing || run.cancelRequested) return false;
    run.cancelRequested = true;
    this.update(run, { state: 'canceling', message: 'Cancellation requested. Waiting for the build request to stop.' });
    run.abort.abort();
    return true;
  }
  dispose() {
    this.disposed = true;
    // Never abandon a publishing build merely because its view has closed.
    this.cancel();
  }
  async stream(run, response) {
    if (!response.body) throw new Error('Build response has no readable body.');
    const reader = run.reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    const consume = line => {
      if (!line.trim()) return null;
      let record;
      try { record = JSON.parse(line); }
      catch { throw new Error('Build response contained an unreadable record.'); }
      if (record?.type === 'progress' && typeof record.phase === 'string') {
        if (record.phase === 'committing' || record.phase === 'committed') run.committing = true;
        this.update(run, { ...record, state: 'building' });
        return null;
      }
      if (record?.type === 'result' && record.ok === true && record.data && typeof record.data === 'object' && !Array.isArray(record.data)) return record;
      if (record?.type === 'error' && record.ok === false && typeof record.error === 'string') throw responseError(record.error);
      throw new Error('Build response contained an unexpected record.');
    };
    while (true) {
      const { value, done } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline); pending = pending.slice(newline + 1);
        const result = consume(line);
        if (result) return result;
      }
      if (done) {
        const result = consume(pending);
        if (result) return result;
        throw new Error('Build response ended before its final report.');
      }
    }
  }
  async start(body, { sessionId } = {}) {
    if (this.busy) throw new Error('A build is already running');
    if (this.disposed) throw new Error('This build view is closed');
    const run = { abort: new AbortController(), done: false, committing: false, cancelRequested: false };
    this.run = run;
    this.update(run, { state: 'building', phase: 'prepare' });
    try {
      const response = await this.fetchImpl('/api/workbench/build', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson', ...(sessionId ? { 'X-Sprite-Session': sessionId } : {}) },
        body: JSON.stringify(body), signal: run.abort.signal });
      let result;
      if (response.headers.get('content-type')?.includes('application/x-ndjson')) result = await this.stream(run, response);
      else {
        // Validation and the localhost guard can reject before a stream starts.
        result = await response.json();
        if (!response.ok || result?.ok !== true) throw responseError(result?.error ?? `Build request failed (${response.status})`);
        if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) throw new Error('Build response has no final report.');
      }
      run.done = true;
      this.update(run, { state: result.data.ok === false ? 'failed' : 'complete', report: result.data });
      return result;
    } catch (error) {
      run.done = true;
      if (error.name === 'AbortError') {
        this.update(run, { state: 'canceled', message: 'Build request canceled; inspect output before retrying. Its outcome is unconfirmed.' });
        return null;
      }
      const message = error.buildResponse ? error.message : uncertain(error.message ?? 'Build connection failed.');
      this.update(run, { state: 'failed', error: message });
      throw new Error(message);
    } finally {
      run.done = true;
      if (run.reader) {
        try { await run.reader.cancel(); } catch { /* A disconnected reader may already be closed. */ }
        run.reader.releaseLock(); run.reader = null;
      }
    }
  }
}
