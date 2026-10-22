const same = (a, b) => Boolean(a && b) && a.sessionId === b.sessionId && a.projectId === b.projectId;
/** One owned live-write lane shared by HTTP and WS. Never replay uncertain writes. */
export class LiveMutations {
  constructor({ getPins, refresh = async () => {}, maxPending = 32 }) {
    Object.assign(this, { getPins, refresh, maxPending }); this.tail = Promise.resolve(); this.pending = 0;
  }
  enqueue(operation, expectedSession, { allowUnbound = false } = {}) {
    const captured = { ...this.getPins() };
    if ((!captured.projectId && !allowUnbound) || (expectedSession && captured.sessionId !== expectedSession)) return Promise.reject(new Error('The active project changed. Refresh before editing.'));
    if (this.pending >= this.maxPending) return Promise.reject(new Error('Too many pending edits. Wait for the current edit.'));
    this.pending++;
    const result = this.tail.then(async () => {
      const current = this.getPins();
      if (!same(captured, current)) throw new Error('The active project changed. Queued edit was not sent.');
      const pins = { ...current, revision: same(this.receipt, current) ? Math.max(this.receipt.revision, current.revision) : current.revision };
      try {
        const result = await operation(pins);
        if (same(result?.pins, pins)) this.receipt = result.pins;
        return result;
      } catch (error) {
        if (error.status === 409 && same(captured, this.getPins())) await Promise.resolve().then(() => this.refresh()).catch(() => {});
        throw error;
      }
    });
    this.tail = result.catch(() => {}).finally(() => { this.pending--; });
    return result;
  }
}
