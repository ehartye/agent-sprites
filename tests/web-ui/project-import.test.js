// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { ProjectImportController } from '../../server/web/public/js/project-import.js';

let calls, xhrs, fetchImpl, session, current, complete, updates;
class Upload {
  constructor() { this.upload = {}; this.headers = {}; xhrs.push(this); }
  open(method, path) { this.method = method; this.path = path; }
  setRequestHeader(name, value) { this.headers[name] = value; }
  send(file) { this.file = file; }
  abort() { this.onabort?.(); }
  done() { this.status = 202; this.responseText = '{"ok":true}'; this.onload(); }
}
beforeEach(() => {
  calls = []; xhrs = []; session = 'original'; current = true; complete = vi.fn(); updates = [];
  fetchImpl = vi.fn(async (path, options = {}) => {
    calls.push({ path, ...options });
    let data = { id: 'job', state: 'uploading' };
    if (options.method === 'GET') data = { id: 'job', state: 'ready', source: { bytes: 123 } };
    if (path.endsWith('/activate')) data = { session_id: 'new-session', project_name: 'Imported' };
    return { ok: true, json: async () => ({ ok: true, data }) };
  });
});
const controller = () => new ProjectImportController({ fetchImpl, XMLHttpRequestImpl: Upload, getSessionId: () => session,
  isCurrent: () => current, onComplete: complete, onUpdate: value => updates.push(value), pollMs: 1 });
test('uploads the File directly with real byte progress, then polls and activates the pinned session', async () => {
  const importer = controller(), file = new File(['x'], 'project.json.gz');
  file.text = () => { throw new Error('must not buffer the file'); };
  const importing = importer.start(file);
  await vi.waitFor(() => expect(xhrs).toHaveLength(1));
  expect(xhrs[0].file).toBe(file); expect(xhrs[0].headers['X-Sprite-Session']).toBe('original');
  expect(JSON.parse(calls[0].body)).toEqual({ filename: 'project.json.gz', encoding: 'gzip' });
  xhrs[0].upload.onprogress({ loaded: 123, total: 456, lengthComputable: true });
  expect(updates.at(-1)).toMatchObject({ state: 'uploading', loaded: 123, total: 456, busy: true });
  await expect(importer.start(file)).rejects.toThrow(/already/i);
  xhrs[0].done(); await importing;
  expect(complete).toHaveBeenCalledWith({ session_id: 'new-session', project_name: 'Imported' });
  expect(calls.find(call => call.path.endsWith('/activate')).headers['X-Sprite-Session']).toBe('original');
  expect(updates.at(-1).busy).toBe(false);
});
test.each(['closed', 'session changed', 'superseded'])('%s handoff cancels and cannot autoactivate', async reason => {
  const importer = controller(), importing = importer.start(new File(['x'], 'project.json'));
  await vi.waitFor(() => expect(xhrs).toHaveLength(1));
  if (reason === 'session changed') session = 'other';
  else if (reason === 'closed') current = false;
  else { await importer.cancel(); }
  xhrs[0].done(); await importing;
  expect(complete).not.toHaveBeenCalled(); expect(calls.some(call => call.path.endsWith('/activate'))).toBe(false);
  expect(calls.filter(call => call.method === 'DELETE')).not.toHaveLength(0);
  expect(calls.find(call => call.method === 'DELETE').headers['X-Sprite-Session']).toBeUndefined();
});
test('cancel during allocation waits for its job ID and deletes it without a stale session guard', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  fetchImpl.mockImplementationOnce(() => pending);
  const importer = controller(), importing = importer.start(new File(['x'], 'project.json'));
  const canceling = importer.cancel(); session = 'other';
  release({ ok: true, json: async () => ({ ok: true, data: { id: 'allocated-late' } }) });
  await canceling; await importing;
  expect(xhrs).toHaveLength(0);
  expect(calls.some(call => call.method === 'DELETE' && call.path.endsWith('/allocated-late'))).toBe(true);
});
test('failed validation exposes a bounded message and never activates', async () => {
  fetchImpl.mockImplementation(async (path, options = {}) => ({ ok: true, json: async () => ({ ok: true,
    data: options.method === 'GET' ? { id: 'job', state: 'failed', error: 'bad '.repeat(1000) } : { id: 'job' } }) }));
  const importer = controller(), importing = importer.start(new File(['x'], 'bad.json'));
  const failure = expect(importing).rejects.toThrow(/bad/);
  await vi.waitFor(() => expect(xhrs).toHaveLength(1)); xhrs[0].done(); await failure;
  expect(updates.at(-1).error.length).toBeLessThan(1000); expect(complete).not.toHaveBeenCalled();
});
test('own activation broadcast can arrive before its HTTP receipt without canceling success', async () => {
  const original = fetchImpl.getMockImplementation();
  fetchImpl.mockImplementation(async (path, options) => {
    if (path.endsWith('/activate')) session = 'new-session';
    return original(path, options);
  });
  const importer = controller(), importing = importer.start(new File(['x'], 'project.json'));
  await vi.waitFor(() => expect(xhrs).toHaveLength(1)); xhrs[0].done();
  expect(await importing).toMatchObject({ session_id: 'new-session' });
  expect(complete).toHaveBeenCalledOnce(); expect(updates.at(-1).state).toBe('complete');
  expect(calls.some(call => call.method === 'DELETE')).toBe(false);
});
