import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
export function ownedCli(command, prefix = [], options = {}) {
  const pending = new Set();
  let closing = false, teardown;
  async function waitForClose(children, timeoutMs) {
    let timer;
    try {
      await Promise.race([
        Promise.all(children.map(record => record.closed)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Owned CLI close timed out')), timeoutMs); }),
      ]);
    } finally { clearTimeout(timer); }
  }
  return {
    run(...args) {
      if (closing) return Promise.reject(Error('CLI owner is closing'));
      const controller = new AbortController();
      const execution = execute(command, [...prefix, ...args], { ...options, signal: controller.signal, windowsHide: true });
      const child = execution.child;
      // Abort can settle execFile's callback before the process closes. Track that event independently.
      const record = { controller, child, closed: new Promise(resolve => child.once('close', resolve)) };
      pending.add(record);
      const promise = execution.then(async result => { await record.closed; return result; }, async error => { await record.closed; throw error; });
      promise.child = child;
      promise.then(() => pending.delete(record), () => pending.delete(record));
      return promise;
    },
    close() {
      closing = true; // Synchronous: a timed-out body's continuation must never launch another CLI.
      return teardown ??= (async () => {
        const children = [...pending];
        for (const record of children) record.controller.abort();
        try { await waitForClose(children, 2000); }
        catch {
          for (const record of children) record.child.kill('SIGKILL');
          await waitForClose(children, 2000);
        }
      })();
    },
  };
}
