// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';
import { COMMANDS } from '../../server/commands/catalog.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('actual catalog geometry forms reject unloaded selection and retain pinned loaded success paths', async () => {
  document.body.innerHTML = readFileSync('server/web/public/index.html', 'utf8').match(/<body>([\s\S]*)<\/body>/)[1];
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', () => 1);
  const sockets = []; vi.stubGlobal('WebSocket', class { static OPEN = 1; readyState = 1; constructor() { sockets.push(this); } send() {} });
  let summary = { sessionId: 's', projectId: 'p', revision: 1, name: 'Catalog guards', grid: { rows: 1, cols: 3 }, cellWidth: 8, cellHeight: 8,
    cells: { '0,0': { shapeCount: 1 }, '0,1': { shapeCount: 0 }, '0,2': { shapeCount: 0 } },
    cellVersions: { '0,0': 1, '0,1': 1, '0,2': 1 }, palette: [], groups: {}, shapeGroups: {} };
  const shape = { id: 'body', name: 'body', type: 'point', color: '#fff', zIndex: 0,
    params: { x: 1, y: 1, layers: [{ id: 'scene:child', x: 0, y: 0, w: 8, h: 8, z: 0, background: { mode: 'transparent' } }] } };
  const posts = [], held = []; let holdGeometry = true;
  const frameResponse = url => {
    const refs = new URL(url, 'http://local').searchParams.get('refs').split('|');
    const data = { sessionId: summary.sessionId, projectId: summary.projectId, revision: summary.revision,
      cells: Object.fromEntries(refs.map(ref => [ref, { name: null, reference: null, shapes: ref === '0,0' ? [shape] : [] }])),
      cellVersions: Object.fromEntries(refs.map(ref => [ref, summary.cellVersions[ref]])), shapeGroups: {} };
    return { ok: true, status: 200, json: async () => ({ ok: true, data }) };
  };
  vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
    if (url === '/api/workbench/commands') return { ok: true, json: async () => ({ ok: true, data: COMMANDS }) };
    if (url === '/api/workbench/project-summary') return { ok: true, json: async () => ({ ok: true, data: structuredClone(summary) }) };
    if (url.includes('/workbench/frames?')) return holdGeometry ? new Promise(resolve => held.push({ url, resolve })) : frameResponse(url);
    if (options.method === 'POST') {
      posts.push({ url, body: JSON.parse(options.body), headers: options.headers });
      summary = { ...summary, revision: summary.revision + 1, cellVersions: { ...summary.cellVersions, '0,0': summary.revision + 1 } };
      return { ok: true, json: async () => ({ ok: true, data: 'ok' }) };
    }
    throw new Error(`Unexpected request ${url}`);
  }));
  await import('../../server/web/public/js/app.js'); document.dispatchEvent(new Event('DOMContentLoaded'));
  sockets[0].onmessage({ data: JSON.stringify({ type: 'project_summary', data: summary }) });
  await vi.waitFor(() => expect(held.length).toBeGreaterThan(0));
  document.querySelector('[data-workbench="tools"]').click();
  await vi.waitFor(() => expect(document.querySelector('[data-command="layer edit"]')).not.toBeNull());
  const actions = ['layer edit', 'layer order', 'clone-cell', 'skin-tone', 'copy'];
  const submit = async id => {
    document.querySelector(`[data-command="${id}"]`).click();
    const form = document.querySelector('.tool-form'), button = form.querySelector('[type="submit"]');
    if (form.elements.id) form.elements.id.value = 'scene:child';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    return document.getElementById('workbench-status').textContent;
  };
  const unloaded = [];
  for (const id of actions) {
    expect(document.getElementById('cell-ref').textContent).toContain('Loading');
    unloaded.push(await submit(id));
  }
  expect(posts).toEqual([]);
  expect(unloaded).toEqual(actions.map(() => 'Wait for the selected frame to finish loading before editing.'));
  holdGeometry = false; for (const request of held) request.resolve(frameResponse(request.url));
  await vi.waitFor(() => expect(document.getElementById('cell-ref').textContent).toBe('Cell 0,0'));
  for (const id of actions) {
    expect(await submit(id)).toBe(`${COMMANDS.find(command => command.id === id).label} completed.`);
    await vi.waitFor(() => expect(document.getElementById('cell-ref').textContent).toBe('Cell 0,0'));
  }
  expect(posts.map(post => post.url)).toEqual(['/api/cell/layer', '/api/cell/layer', '/api/cell/clone-fanout', '/api/workbench/skin-tone', '/api/cell/copy']);
  expect(posts.map(post => post.headers['X-Sprite-Revision'])).toEqual(['1', '2', '3', '4', '5']);
  expect(posts.every(post => post.headers['X-Sprite-Session'] === 's' && post.headers['X-Sprite-Project'] === 'p')).toBe(true);
});
