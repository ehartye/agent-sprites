import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';

export async function importProjectFile(filePath, { baseUrl, name, sessionId, signal, onProgress = () => {}, pollMs = 200, fetchImpl = fetch } = {}) {
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error('Import source must be a regular file');
  const root = `${baseUrl}/api/workbench/imports`;
  let job, completed = false, source, body;
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
        const receipt = await json('POST', `${root}/${job.id}/activate`, {}, { abortable: false });
        completed = true; onProgress({ state: 'complete', phase: 'complete', receipt }); return receipt;
      }
      await delay(pollMs, undefined, { signal });
    }
  } finally {
    body?.destroy(); source?.destroy();
    if (job && !completed) await json('DELETE', `${root}/${job.id}`, undefined, { guarded: false, abortable: false });
  }
}
