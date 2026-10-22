// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';
import { CanvasEditor } from '../../server/web/public/js/canvas-editor.js';
import { ToolManager } from '../../server/web/public/js/tools.js';
import { ShapeGroupPanel } from '../../server/web/public/js/panels.js';
import { Workbench } from '../../server/web/public/js/workbench.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
test('actual app loads sparse selected cell once; unrelated arrivals/metadata do not repaint it; edit refreshes it', async () => {
  document.body.innerHTML = readFileSync('server/web/public/index.html', 'utf8').match(/<body>([\s\S]*)<\/body>/)[1];
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', () => 1);
  const sockets = []; vi.stubGlobal('WebSocket', class { static OPEN = 1; readyState = 1; sent = []; constructor(url) { this.url = url; sockets.push(this); } send(raw) { this.sent.push(JSON.parse(raw)); } });
  const calls = [], waiting = [], writes = []; let serverSummary, holdSummary = false, releaseSummary;
  const fetch = vi.fn(async (url, options) => {
    calls.push(url); const q = new URL(url, 'http://local').searchParams;
    if (url.includes('/frames?')) return new Promise(resolve => waiting.push({ q, options, resolve }));
    if (url === '/api/group/shape/delete') {
      writes.push({ body: JSON.parse(options.body), headers: options.headers });
      serverSummary = { ...serverSummary, revision: serverSummary.revision + 1 };
      return { ok: true, json: async () => ({ ok: true, data: 'ok' }) };
    }
    if (url === '/api/session/open-session') {
      serverSummary = { ...summary, sessionId: 'opened', projectId: 'opened' };
      return { ok: true, json: async () => ({ ok: true, data: 'opened' }) };
    }
    if (url === '/api/workbench/project-summary') {
      if (holdSummary) return new Promise(resolve => { releaseSummary = data => resolve({ ok: true, json: async () => ({ ok: true, data }) }); });
      if (options.headers['X-Sprite-Session'] && options.headers['X-Sprite-Session'] !== serverSummary.sessionId) return { ok: false, status: 409, json: async () => ({ ok: false, error: 'Session changed' }) };
      return { ok: true, json: async () => ({ ok: true, data: serverSummary }) };
    }
    throw new Error(`Unexpected full/read request ${url}`);
  }); vi.stubGlobal('fetch', fetch);
  const cells = { '0,0': { shapeCount: 1 }, '0,1': { shapeCount: 1 } };
  const summary = { sessionId: 's', projectId: 'p', revision: 1, name: 'Sparse', grid: { rows: 1, cols: 2 }, cellWidth: 8, cellHeight: 8,
    cells, cellVersions: { '0,0': 1, '0,1': 1 }, palette: [], groups: {}, shapeGroups: { '0,0': ['__proto__'], '0,1': ['__proto__'] } };
  serverSummary = summary;
  const cell = { name: null, reference: null, shapes: [{ id: 'dot', name: 'dot', type: 'point', params: { x: 1, y: 1 }, color: '#f00', zIndex: 0 }] };
  const setCell = vi.spyOn(CanvasEditor.prototype, 'setCell'), render = vi.spyOn(CanvasEditor.prototype, 'render');
  const click = vi.spyOn(ToolManager.prototype, 'handleClick');
  const shapeGroups = vi.spyOn(ShapeGroupPanel.prototype, 'init');
  const workbench = vi.spyOn(Workbench.prototype, 'init');
  await import('../../server/web/public/js/app.js'); document.dispatchEvent(new Event('DOMContentLoaded'));
  const ws = sockets[0]; const push = data => ws.onmessage({ data: JSON.stringify({ type: 'project_summary', data }) });
  push(summary); await vi.waitFor(() => expect(waiting.length).toBeGreaterThan(0));
  const editor = setCell.mock.instances[0]; editor._pixelClickCb(1, 1); expect(click).not.toHaveBeenCalled();
  expect(document.querySelector('.group-create-pattern-btn').disabled).toBe(true);
  const answer = request => request.resolve({ ok: true, status: 200, json: async () => ({ ok: true, data: { ...summary, revision: Number(request.q.get('revision')),
    cells: Object.fromEntries(request.q.get('refs').split('|').map(ref => [ref, { ...cell, shapes: ref === '0,0' ? cell.shapes : [] }])), cellVersions: summary.cellVersions, shapeGroups: {} } }) });
  answer(waiting[0]); await vi.waitFor(() => expect(setCell.mock.calls.some(([c]) => c?.shapes?.length === 1)).toBe(true));
  // Both gestures are queued before the server sends either a summary or receipt.
  editor._pixelClickCb(2, 2); editor._pixelClickCb(3, 3);
  await vi.waitFor(() => expect(ws.sent).toHaveLength(1));
  expect(ws.sent[0]).toMatchObject({ action: 'draw', projectId: 'p', revision: 1, params: { cell: '0,0', x: 2 } });
  const receipt = (message, revision) => ws.onmessage({ data: JSON.stringify({ type: 'result', requestId: message.requestId, pins: { sessionId: 's', projectId: 'p', revision } }) });
  receipt(ws.sent[0], 2); await vi.waitFor(() => expect(ws.sent).toHaveLength(2));
  expect(ws.sent[1]).toMatchObject({ revision: 2, params: { x: 3 } }); receipt(ws.sent[1], 3);
  setCell.mockClear(); render.mockClear();
  push({ ...summary, revision: 2, review: { note: 'metadata' } });
  await new Promise(resolve => setTimeout(resolve, 20));
  for (const request of waiting.slice(1)) answer(request);
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(setCell).not.toHaveBeenCalled(); expect(render).not.toHaveBeenCalled();
  push({ ...summary, revision: 3, cellVersions: { '0,0': 3, '0,1': 1 } });
  await vi.waitFor(() => expect(setCell).toHaveBeenCalledWith(null));
  expect(document.getElementById('cell-ref').textContent).toContain('Loading');
  await vi.waitFor(() => expect(waiting.at(-1).q.get('revision')).toBe('3'));
  const selectedRequest = waiting.at(-1);
  selectedRequest.resolve({ ok: true, status: 200, json: async () => ({ ok: true, data: { ...summary, revision: 3, cells: { '0,0': cell }, cellVersions: { '0,0': 3 }, shapeGroups: {} } }) });
  await vi.waitFor(() => expect(setCell.mock.calls.filter(([c]) => c?.shapes?.length === 1)).toHaveLength(1));
  serverSummary = { ...summary, revision: 3, cellVersions: { '0,0': 3, '0,1': 1 } };
  shapeGroups.mock.calls[0][0].onDelete('__proto__', { allCells: true });
  await vi.waitFor(() => expect(writes).toHaveLength(2));
  expect(writes.map(write => write.body)).toEqual([{ cell: '0,0', name: '__proto__' }, { cell: '0,1', name: '__proto__' }]);
  expect(writes.map(write => write.headers['X-Sprite-Revision'])).toEqual(['3', '4']);
  expect(writes.every(write => write.headers['X-Sprite-Project'] === 'p')).toBe(true);
  // A session change during a queued pair never sends the second old intent.
  editor._pixelClickCb(4, 4); editor._pixelClickCb(5, 5);
  await vi.waitFor(() => expect(ws.sent).toHaveLength(3));
  const sessionPaints = [], clearRect = editor.ctx.clearRect;
  const paint = vi.spyOn(editor.ctx, 'clearRect').mockImplementation((...args) => { sessionPaints.push(editor._shapes.length); return clearRect.apply(editor.ctx, args); });
  push({ ...summary, sessionId: 'other', projectId: 'other' }); receipt(ws.sent[2], 4);
  await new Promise(resolve => setTimeout(resolve, 10)); expect(ws.sent).toHaveLength(3);
  expect(sessionPaints.length).toBeGreaterThan(0); expect(sessionPaints.every(count => count === 0)).toBe(true); paint.mockRestore();
  expect(document.getElementById('workbench-status').textContent).toContain('changed');
  const bench = workbench.mock.instances[0];
  holdSummary = true; const refresh = bench.request('/workbench/project-summary');
  await vi.waitFor(() => expect(releaseSummary).toBeTypeOf('function'));
  push({ ...summary, sessionId: 'newest', projectId: 'newest', name: 'Newest' });
  releaseSummary({ ...summary, sessionId: 'other', projectId: 'other', name: 'Old HTTP read' });
  await refresh; expect(document.getElementById('project-name').textContent).toBe('Newest');
  holdSummary = false;
  await expect(bench.request('/session/open-session', { ref: 'opened' })).resolves.toMatchObject({ ok: true });
  expect(document.getElementById('project-name').textContent).toBe('Sparse');
  await vi.waitFor(() => expect(waiting.at(-1).q.get('projectId')).toBe('opened'));
  waiting.at(-1).resolve({ ok: false, status: 413 });
  await vi.waitFor(() => expect(document.getElementById('cell-ref').textContent).toContain('too large'));
  const beforeRetry = waiting.length;
  serverSummary = { ...serverSummary, revision: 2, cellVersions: { '0,0': 2, '0,1': 1 } }; push(serverSummary);
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(waiting.slice(beforeRetry).some(request => request.q.get('refs').split('|').includes('0,0'))).toBe(false);
  // Packet-driven selection stays terminal; an actual navigator click retries.
  document.querySelector('.cell-thumb[data-ref="0,0"]').click();
  await vi.waitFor(() => expect(waiting.slice(beforeRetry).some(request => request.q.get('refs').split('|').includes('0,0'))).toBe(true));
  const retry = waiting.at(-1);
  retry.resolve({ ok: true, status: 200, json: async () => ({ ok: true, data: { ...serverSummary,
    cells: Object.fromEntries(retry.q.get('refs').split('|').map(ref => [ref, { shapes: [] }])), shapeGroups: {} } }) });
  await vi.waitFor(() => expect(document.getElementById('cell-ref').textContent).toBe('Cell 0,0'));
  expect(calls.some(path => /\/workbench\/project(?:$|\?)|group\/shape\/list-all/.test(path))).toBe(false);
});
