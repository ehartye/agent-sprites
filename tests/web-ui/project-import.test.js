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

test('a lost activation response uses the completed cleanup receipt without reporting failure', async () => {
  const original = fetchImpl.getMockImplementation(), receipt = { session_id: 'new-session', project_name: 'Imported' };
  fetchImpl.mockImplementation(async (path, options) => {
    if (path.endsWith('/activate')) { calls.push({ path, ...options }); session = 'new-session'; throw new Error('Activation response lost'); }
    if (options.method === 'DELETE') {
      calls.push({ path, ...options });
      expect(updates.at(-1).state).toBe('activating');
      return { ok: true, json: async () => ({ ok: true, data: { id: 'job', state: 'complete', receipt } }) };
    }
    return original(path, options);
  });
  const importer = controller(), importing = importer.start(new File(['x'], 'project.json'));
  await vi.waitFor(() => expect(xhrs).toHaveLength(1)); xhrs[0].done();
  expect(await importing).toEqual(receipt); expect(complete).toHaveBeenCalledExactlyOnceWith(receipt);
  expect(updates.at(-1)).toMatchObject({ state: 'complete', receipt, busy: false });
  expect(updates.some(update => update.state === 'failed')).toBe(false);
  expect(calls.filter(call => call.path.endsWith('/activate'))).toHaveLength(1);
  expect(calls.find(call => call.method === 'DELETE').headers['X-Sprite-Session']).toBeUndefined();
});

test('status can recover completion after cleanup transport fails without a stale completion callback', async () => {
  const original = fetchImpl.getMockImplementation(), receipt = { session_id: 'new-session', project_name: 'Imported' };
  let activationSent = false;
  fetchImpl.mockImplementation(async (path, options) => {
    if (path.endsWith('/activate')) { activationSent = true; current = false; throw new Error('Activation response lost'); }
    if (options.method === 'DELETE') throw new Error('Cleanup response lost');
    if (activationSent && options.method === 'GET') return { ok: true, json: async () => ({ ok: true, data: { id: 'job', state: 'complete', receipt } }) };
    return original(path, options);
  });
  const importer = controller(), importing = importer.start(new File(['x'], 'project.json'));
  await vi.waitFor(() => expect(xhrs).toHaveLength(1)); xhrs[0].done();
  expect(await importing).toEqual(receipt); expect(complete).not.toHaveBeenCalled();
  expect(updates.at(-1)).toMatchObject({ state: 'complete', receipt, busy: false });
});

test.each(['failed', 'canceled'])('a lost activation response honors authoritative %s recovery', async state => {
  const original = fetchImpl.getMockImplementation();
  fetchImpl.mockImplementation(async (path, options) => {
    if (path.endsWith('/activate')) throw new Error('Activation response lost');
    if (options.method === 'DELETE') return { ok: true, json: async () => ({ ok: true, data: { id: 'job', state, error: 'Activation rejected' } }) };
    return original(path, options);
  });
  const importer = controller(), importing = importer.start(new File(['x'], 'project.json'));
  const result = state === 'failed' ? expect(importing).rejects.toThrow(/Activation rejected/) : expect(importing).resolves.toBeNull();
  await vi.waitFor(() => expect(xhrs).toHaveLength(1)); xhrs[0].done(); await result;
  expect(updates.at(-1)).toMatchObject({ state, busy: false }); expect(complete).not.toHaveBeenCalled();
});

test('failed recovery reports a bounded unconfirmed activation with primary and cleanup diagnostics', async () => {
  const original = fetchImpl.getMockImplementation(); let activationSent = false;
  fetchImpl.mockImplementation(async (path, options) => {
    if (path.endsWith('/activate')) { activationSent = true; throw new Error(`Activation response lost ${'x'.repeat(1000)}`); }
    if (activationSent) throw new Error(`${options.method === 'DELETE' ? 'Cleanup unavailable' : 'Status unavailable'} ${'x'.repeat(1000)}`);
    return original(path, options);
  });
  const importer = controller(), importing = importer.start(new File(['x'], 'project.json'));
  const failure = expect(importing).rejects.toThrow(/activation outcome unconfirmed.*inspect.*before retrying/i);
  await vi.waitFor(() => expect(xhrs).toHaveLength(1)); xhrs[0].done(); await failure;
  expect(updates.at(-1)).toMatchObject({ state: 'unconfirmed', busy: false });
  expect(updates.at(-1).error).toContain('Activation response lost');
  expect(updates.at(-1).error).toContain('Cleanup unavailable'); expect(updates.at(-1).error).toContain('Status unavailable');
  expect(updates.at(-1).error.length).toBeLessThanOrEqual(600); expect(complete).not.toHaveBeenCalled();
});

test.each(['cancel', 'dispose'])('%s during activation preserves a committed receipt without completing a canceled view', async action => {
  const original = fetchImpl.getMockImplementation(), receipt = { session_id: 'new-session', project_name: 'Imported' };
  let rejectActivation;
  fetchImpl.mockImplementation(async (path, options) => {
    if (path.endsWith('/activate')) {
      session = 'new-session';
      return new Promise((_, reject) => { rejectActivation = reject; });
    }
    if (options.method === 'DELETE') return { ok: true, json: async () => ({ ok: true, data: { id: 'job', state: 'complete', receipt } }) };
    return original(path, options);
  });
  const importer = controller(), importing = importer.start(new File(['x'], 'project.json'));
  await vi.waitFor(() => expect(xhrs).toHaveLength(1)); xhrs[0].done();
  await vi.waitFor(() => expect(rejectActivation).toBeTypeOf('function'));
  await importer[action](); rejectActivation(new DOMException('Connection closed', 'AbortError'));
  expect(await importing).toEqual(receipt); expect(complete).not.toHaveBeenCalled();
  expect(updates.at(-1)).toMatchObject({ state: 'complete', receipt, busy: false });
  expect(updates.some(update => update.state === 'canceled')).toBe(false);
});

test('cancellation cannot turn an unconfirmed activation into a canceled outcome', async () => {
  const original = fetchImpl.getMockImplementation(); let rejectActivation, activationSent = false;
  fetchImpl.mockImplementation(async (path, options) => {
    if (path.endsWith('/activate')) {
      activationSent = true;
      return new Promise((_, reject) => { rejectActivation = reject; });
    }
    if (activationSent) throw new Error('Recovery unavailable');
    return original(path, options);
  });
  const importer = controller(), importing = importer.start(new File(['x'], 'project.json'));
  const failure = expect(importing).rejects.toThrow(/activation outcome unconfirmed.*inspect.*before retrying/i);
  await vi.waitFor(() => expect(xhrs).toHaveLength(1)); xhrs[0].done();
  await vi.waitFor(() => expect(rejectActivation).toBeTypeOf('function'));
  await expect(importer.cancel()).rejects.toThrow('Recovery unavailable');
  rejectActivation(new DOMException('Connection closed', 'AbortError')); await failure;
  expect(updates.at(-1)).toMatchObject({ state: 'unconfirmed', busy: false });
  expect(updates.some(update => update.state === 'canceled')).toBe(false); expect(complete).not.toHaveBeenCalled();
});
