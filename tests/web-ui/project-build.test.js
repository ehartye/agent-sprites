import { expect, test, vi } from 'vitest';
import { ProjectBuildController } from '../../server/web/public/js/project-build.js';

const encoder = new TextEncoder();
const record = value => JSON.stringify(value) + '\n';
const success = { type: 'result', ok: true, data: { ok: true, name: '羽 🦉', artifacts: { project: '/out/project.json' } } };
function transport() {
  let source, options;
  const cancel = vi.fn();
  const body = new ReadableStream({ start(controller) { source = controller; }, cancel });
  const fetchImpl = vi.fn(async (_path, request) => {
    options = request;
    request.signal.addEventListener('abort', () => source.error(new DOMException('Request aborted', 'AbortError')), { once: true });
    return { ok: true, headers: new Headers({ 'content-type': 'application/x-ndjson; charset=utf-8' }), body };
  });
  return { fetchImpl, cancel, get signal() { return options?.signal; }, push(text) { source.enqueue(typeof text === 'string' ? encoder.encode(text) : text); }, end() { source.close(); }, fail(error) { source.error(error); } };
}
function setup(options = {}) {
  const wire = transport(), updates = [];
  const build = new ProjectBuildController({ fetchImpl: wire.fetchImpl, onUpdate: value => updates.push(value), ...options });
  const pending = build.start({ path: '/source/build.json' }, { sessionId: 'pinned' });
  return { wire, updates, build, pending };
}

test('incrementally reads split records and UTF-8 with a terminal record at EOF', async () => {
  const { wire, updates, pending } = setup();
  const bytes = encoder.encode(record({ type: 'progress', phase: 'generator', bytes: 12345 }) + JSON.stringify(success));
  // Every byte is a separate transport chunk, including each byte of the emoji.
  for (const byte of bytes) wire.push(Uint8Array.of(byte));
  wire.end();
  await expect(pending).resolves.toEqual(success);
  expect(updates).toContainEqual(expect.objectContaining({ phase: 'generator', bytes: 12345, busy: true, cancellable: true }));
  expect(updates.at(-1)).toMatchObject({ state: 'complete', busy: false, cancellable: false, report: success.data });
  expect(wire.fetchImpl).toHaveBeenCalledWith('/api/workbench/build', expect.objectContaining({ method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson', 'X-Sprite-Session': 'pinned' }, body: '{"path":"/source/build.json"}' }));
  expect(wire.signal.aborted).toBe(false);
});

test('a terminal report with ok false is a completed request with an authoritative failure report', async () => {
  const { wire, updates, pending } = setup();
  const result = { type: 'result', ok: true, data: { ok: false, errors: ['Verification failed'], artifacts: {} } };
  wire.push('\r\n' + record(result)); wire.end();
  await expect(pending).resolves.toEqual(result);
  expect(updates.at(-1)).toMatchObject({ state: 'failed', busy: false, report: result.data });
});

test('a server stream error exposes its message', async () => {
  const { wire, updates, pending } = setup();
  const rejected = expect(pending).rejects.toThrow('Generator exited with code 2');
  wire.push(record({ type: 'progress', phase: 'generator', bytes: 8 }) + record({ type: 'error', ok: false, error: 'Generator exited with code 2' })); wire.end();
  await rejected;
  expect(updates.at(-1)).toMatchObject({ state: 'failed', busy: false, error: 'Generator exited with code 2' });
});

test.each([200, 403])('ordinary JSON rejection before streaming is truthful at HTTP %s', async status => {
  const updates = [];
  const fetchImpl = vi.fn(async () => ({ ok: status === 200, status, headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ ok: false, error: 'Local file tools require localhost' }) }));
  const build = new ProjectBuildController({ fetchImpl, onUpdate: value => updates.push(value) });
  await expect(build.start({ path: '' })).rejects.toThrow('Local file tools require localhost');
  expect(updates.at(-1).error).toBe('Local file tools require localhost');
  expect(fetchImpl.mock.calls[0][1].headers).not.toHaveProperty('X-Sprite-Session');
});

test.each(['', record({ type: 'progress', phase: 'render' }), '{"type":"result"', '{bad}\n', record({ type: 'mystery' })])('missing or malformed terminal receipt leaves outcome unconfirmed (%j)', async text => {
  const { wire, updates, pending } = setup();
  const rejected = expect(pending).rejects.toThrow(/outcome unconfirmed.*inspect output before retrying/i);
  if (text) wire.push(text); wire.end();
  await rejected;
  expect(updates.at(-1)).toMatchObject({ state: 'failed', busy: false });
});

test('large valid report records are retained in full', async () => {
  const { wire, pending } = setup();
  const result = { type: 'result', ok: true, data: { ok: true, details: 'x'.repeat(1024 * 1024) } };
  wire.push(record(result)); wire.end();
  await expect(pending).resolves.toEqual(result);
});

test('precommit cancellation aborts only the owned request and never promises rollback', async () => {
  const { wire, updates, build, pending } = setup();
  await expect(build.start({ path: '/other.json' })).rejects.toThrow(/already running/i);
  expect(build.cancel()).toBe(true);
  expect(wire.signal.aborted).toBe(true);
  await expect(pending).resolves.toBeNull();
  expect(updates.some(update => update.state === 'canceling' && /Cancellation requested/.test(update.message))).toBe(true);
  expect(updates.at(-1)).toMatchObject({ state: 'canceled', busy: false, cancellable: false });
  expect(updates.at(-1).message).toMatch(/inspect output before retrying/i);
  expect(updates.at(-1).message).not.toMatch(/rolled back|no outputs|unchanged/i);
});

test.each(['committing', 'committed'])('observed %s disables cancel and retains the receipt after disposal', async phase => {
  const { wire, updates, build, pending } = setup();
  wire.push(record({ type: 'progress', phase }));
  await vi.waitFor(() => expect(updates.at(-1)).toMatchObject({ phase, cancellable: false }));
  expect(build.cancel()).toBe(false); build.dispose();
  expect(wire.signal.aborted).toBe(false);
  const count = updates.length;
  wire.push(record(success)); wire.end();
  await expect(pending).resolves.toEqual(success);
  expect(updates).toHaveLength(count);
  expect(build.busy).toBe(false);
  expect(build.cancel()).toBe(false);
});

test('disposal before commit cancels and suppresses all stale updates', async () => {
  const { wire, updates, build, pending } = setup();
  const count = updates.length; build.dispose();
  await expect(pending).resolves.toBeNull();
  expect(wire.signal.aborted).toBe(true); expect(updates).toHaveLength(count);
});

test('a stale identity cancels its request at the next progress boundary', async () => {
  let current = true;
  const { wire, updates, pending } = setup({ isCurrent: () => current });
  const count = updates.length; current = false;
  wire.push(record({ type: 'progress', phase: 'operations', completed: 2, total: 9 }));
  await expect(pending).resolves.toBeNull();
  expect(wire.signal.aborted).toBe(true); expect(updates).toHaveLength(count);
});

test('transport failure after commit leaves the outcome unconfirmed without replay', async () => {
  const { wire, updates, pending } = setup();
  const rejected = expect(pending).rejects.toThrow(/connection lost.*outcome unconfirmed/i);
  wire.push(record({ type: 'progress', phase: 'committing' }));
  await vi.waitFor(() => expect(updates.at(-1).cancellable).toBe(false));
  wire.fail(new Error('Connection lost'));
  await rejected;
  expect(wire.fetchImpl).toHaveBeenCalledOnce(); expect(updates.at(-1).busy).toBe(false);
});

test('a cancellation racing a received terminal receipt reports the actual outcome', async () => {
  const wire = transport(), updates = [];
  // Simulate a transport that has already received its terminal bytes when abort is requested.
  wire.fetchImpl.mockImplementationOnce(async () => {
    const bytes = encoder.encode(record(success));
    return { ok: true, headers: new Headers({ 'content-type': 'application/x-ndjson' }), body: new ReadableStream({ start(source) { source.enqueue(bytes); source.close(); } }) };
  });
  const build = new ProjectBuildController({ fetchImpl: wire.fetchImpl, onUpdate: value => updates.push(value) });
  const pending = build.start({ path: '/race.json' }); build.cancel();
  await expect(pending).resolves.toEqual(success);
  expect(updates.at(-1)).toMatchObject({ state: 'complete', report: success.data });
});
