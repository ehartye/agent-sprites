import { spawn } from 'node:child_process';

async function bounded(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

export function ownedChildProcess(command, args, options = {}) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options, detached: false, windowsHide: true });
  let finished = false, spawnError, output = '', startupMessage, listeningConfirmed = false;
  // Attach immediately: startup can fail before the first health request or shutdown hook.
  const closed = new Promise(resolve => child.once('close', (code, signal) => {
    finished = true; resolve({ code, signal, ...(spawnError ? { error: spawnError } : {}) });
  }));
  child.once('error', error => { spawnError = error; });
  for (const stream of [child.stdout, child.stderr]) stream?.on('data', bytes => { output = (output + bytes).slice(-4096); });
  async function terminate() {
    if (!finished) child.kill('SIGKILL'); // Only the ChildProcess created above; never a process group or port owner.
    return bounded(closed, 5000, 'Owned child termination');
  }
  async function cleanupFailure(error) {
    try { await terminate(); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Owned child operation and cleanup failed'); }
    throw error;
  }
  return {
    child, closed, terminate,
    async waitUntilReady(check, { timeoutMs = 10000, intervalMs = 50, startupMessage: marker } = {}) {
      startupMessage = marker;
      const deadline = Date.now() + timeoutMs;
      try {
        while (Date.now() < deadline) {
          if (finished) throw Error(`Owned child closed before startup: ${JSON.stringify(await closed)}\n${output}`);
          const ready = await bounded(Promise.race([
            Promise.resolve().then(() => {
              // A matching HTTP identity cannot prove this child won the port-selection race.
              if (startupMessage && !listeningConfirmed) {
                listeningConfirmed = output.split(/\r?\n/).includes(startupMessage);
                if (!listeningConfirmed) return false;
              }
              return check();
            }),
            closed.then(result => { throw Error(`Owned child closed before startup: ${JSON.stringify(result)}\n${output}`); }),
          ]), Math.max(1, deadline - Date.now()), 'Owned child startup');
          if (ready) return;
          await new Promise(resolve => setTimeout(resolve, Math.min(intervalMs, Math.max(0, deadline - Date.now()))));
        }
        throw Error(`Owned child startup timed out after ${timeoutMs}ms\n${output}`);
      } catch (error) { return cleanupFailure(error); }
    },
    async shutdown(request, { timeoutMs = 5000 } = {}) {
      if (finished) return closed;
      if (startupMessage && !listeningConfirmed) return terminate(); // Never send HTTP to a port the child did not bind.
      try {
        await bounded(Promise.resolve().then(request), timeoutMs, 'Owned child shutdown acknowledgement');
        return await bounded(closed, timeoutMs, 'Owned child shutdown exit');
      } catch (error) { return cleanupFailure(error); }
    },
  };
}
