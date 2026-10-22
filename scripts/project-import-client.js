import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';

const bounded = (error, length = 600) => String(error?.message ?? error).slice(0, length);

export async function importProjectFile(filePath, { baseUrl, name, sessionId, signal, onProgress = () => {}, pollMs = 200, fetchImpl = fetch } = {}) {
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error('Import source must be a regular file');
  const root = `${baseUrl}/api/workbench/imports`;
  let job, completed = false, activationSent = false, source, body;
  const finish = receipt => { completed = true; onProgress({ state: 'complete', phase: 'complete', receipt }); return receipt; };
  const json = async (method, url, data, { guarded = true, abortable = true } = {}) => {
    const response = await fetchImpl(url, { method, headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(guarded && sessionId ? { 'X-Sprite-Session': sessionId } : {}) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }), ...(abortable && signal ? { signal } : {}) });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(String(result.error ?? `Import request failed (${response.status})`).slice(0, 600));
    return result.data;
  };
  try {
    signal?.throwIfAborted();
    // Finish allocation before honoring cancellation so its ID is never lost.
    job = await json('POST', root, { filename: basename(filePath), encoding: /\.gz$/i.test(filePath) ? 'gzip' : 'json', ...(name ? { name } : {}) }, { abortable: false });
    signal?.throwIfAborted();
    source = createReadStream(filePath); let loaded = 0;
    body = Readable.from((async function* () {
      for await (const chunk of source) { loaded += chunk.length; onProgress({ state: 'uploading', phase: 'uploading', loaded, total: info.size }); yield chunk; }
    })());
    const upload = await fetchImpl(`${root}/${job.id}/file`, { method: 'PUT', headers: sessionId ? { 'X-Sprite-Session': sessionId } : {}, body, duplex: 'half', ...(signal ? { signal } : {}) });
    const result = await upload.json();
    if (!upload.ok || !result.ok) throw new Error(String(result.error ?? 'Project upload failed').slice(0, 600));
    while (true) {
      signal?.throwIfAborted();
      const status = await json('GET', `${root}/${job.id}`, undefined, { guarded: false });
      onProgress({ ...status, loaded: status.source?.bytes ?? loaded, total: info.size });
      signal?.throwIfAborted();
      if (status.state === 'failed' || status.state === 'canceled') throw new Error(status.error ?? 'Import canceled');
      if (status.state === 'ready') {
        onProgress({ state: 'activating', phase: 'activating' });
        signal?.throwIfAborted();
        // Once sent, receive the authoritative outcome: SIGINT may arrive after
        // the server commits while it is still cleaning up the import files.
        activationSent = true;
        return finish(await json('POST', `${root}/${job.id}/activate`, {}, { abortable: false }));
      }
      await delay(pollMs, undefined, { signal });
    }
  } catch (error) {
    body?.destroy(); source?.destroy();
    let status, cleanupError, statusError;
    if (job && !completed) {
      try { status = await json('DELETE', `${root}/${job.id}`, undefined, { guarded: false, abortable: false }); }
      catch (failure) { cleanupError = failure; }
    }
    if (activationSent && !completed) {
      // DELETE waits for activation and returns its final state. A lost cleanup
      // response can still leave the committed receipt available through GET.
      if (!(status?.state === 'complete' && status.receipt) && !['failed', 'canceled'].includes(status?.state)) {
        try { status = await json('GET', `${root}/${job.id}`, undefined, { guarded: false, abortable: false }); }
        catch (failure) { statusError = failure; }
      }
      if (status?.state === 'complete' && status.receipt) return finish(status.receipt);
      const importState = ['failed', 'canceled'].includes(status?.state) ? status.state : 'unconfirmed';
      const details = [bounded(error, 180), status?.error && `Job: ${bounded(status.error, 100)}`,
        cleanupError && `Cleanup: ${bounded(cleanupError, 90)}`, statusError && `Status: ${bounded(statusError, 90)}`].filter(Boolean).join(' ');
      const message = importState === 'unconfirmed' ? `Activation outcome unconfirmed; inspect the active project before retrying. ${details}` : details;
      throw Object.assign(new Error(message, { cause: error }), { importState });
    }
    if (cleanupError) throw Object.assign(new Error(`${bounded(error, 280)} Cleanup: ${bounded(cleanupError, 280)}`, { cause: error }), { importState: 'cleanup-failed' });
    throw error;
  } finally {
    body?.destroy(); source?.destroy();
  }
}
