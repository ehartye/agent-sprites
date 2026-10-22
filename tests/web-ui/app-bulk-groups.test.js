// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';
import { ShapeGroupPanel } from '../../server/web/public/js/panels.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('actual app deletes all 40 captured group targets with bounded pressure and stops on same-session project replacement', async () => {
  document.body.innerHTML = readFileSync('server/web/public/index.html', 'utf8').match(/<body>([\s\S]*)<\/body>/)[1];
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', () => 1);
  const sockets = []; vi.stubGlobal('WebSocket', class { static OPEN = 1; readyState = 1; constructor() { sockets.push(this); } send() {} });
  const refs = Array.from({ length: 40 }, (_, col) => `0,${col}`);
  const groups = () => Object.fromEntries(refs.map(ref => [ref, ['__proto__']]));
  let summary = { sessionId: 's', projectId: 'p', revision: 1, name: 'Bulk groups', grid: { rows: 1, cols: 40 }, cellWidth: 8, cellHeight: 8,
    cells: Object.fromEntries(refs.map(ref => [ref, { shapeCount: 0 }])), cellVersions: Object.fromEntries(refs.map(ref => [ref, 1])),
    palette: [], groups: {}, shapeGroups: groups() };
  const writes = []; let running = 0, maximumRunning = 0, releaseDelete, holdAt;
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    if (url === '/api/workbench/project-summary') return { ok: true, json: async () => ({ ok: true, data: structuredClone(summary) }) };
    if (url.includes('/workbench/frames?')) {
      const query = new URL(url, 'http://local').searchParams;
      if (Number(query.get('revision')) !== summary.revision) return { ok: false, status: 409 };
      const requested = query.get('refs').split('|');
      const data = { sessionId: summary.sessionId, projectId: summary.projectId, revision: summary.revision,
        cells: Object.fromEntries(requested.map(ref => [ref, { name: null, reference: null, shapes: [] }])),
        cellVersions: Object.fromEntries(requested.map(ref => [ref, summary.cellVersions[ref]])),
        shapeGroups: Object.fromEntries(requested.map(ref => [ref, Object.hasOwn(summary.shapeGroups, ref) ? { ['__proto__']: [] } : {}])) };
      return { ok: true, status: 200, json: async () => ({ ok: true, data }) };
    }
    if (url === '/api/group/shape/delete') {
      const body = JSON.parse(options.body); writes.push({ body, headers: options.headers });
      expect(options.headers['X-Sprite-Project']).toBe(summary.projectId);
      expect(Number(options.headers['X-Sprite-Revision'])).toBe(summary.revision);
      maximumRunning = Math.max(maximumRunning, ++running);
      const nextGroups = { ...summary.shapeGroups }; delete nextGroups[body.cell];
      summary = { ...summary, revision: summary.revision + 1, shapeGroups: nextGroups,
        cellVersions: { ...summary.cellVersions, [body.cell]: summary.revision + 1 } };
      if (writes.length === holdAt) await new Promise(resolve => { releaseDelete = resolve; });
      else await new Promise(resolve => setTimeout(resolve, 0));
      running--; return { ok: true, json: async () => ({ ok: true, data: 'ok' }) };
    }
    throw new Error(`Unexpected request ${url}`);
  }));
  const panel = vi.spyOn(ShapeGroupPanel.prototype, 'init');
  await import('../../server/web/public/js/app.js'); document.dispatchEvent(new Event('DOMContentLoaded'));
  const push = () => sockets[0].onmessage({ data: JSON.stringify({ type: 'project_summary', data: summary }) });
  push(); await vi.waitFor(() => expect(document.getElementById('cell-ref').textContent).toBe('Cell 0,0'));
  const deletion = panel.mock.calls[0][0].onDelete('__proto__', { allCells: true });
  await vi.waitFor(() => expect(writes).toHaveLength(40)); await deletion;
  expect(writes.map(write => write.body.cell)).toEqual(refs);
  expect(writes.map(write => Number(write.headers['X-Sprite-Revision']))).toEqual(refs.map((_, index) => index + 1));
  expect(maximumRunning).toBe(1); expect(summary.shapeGroups).toEqual({});
  await vi.waitFor(() => expect(document.getElementById('cell-ref').textContent).toBe('Cell 0,0'));
  summary = { ...summary, revision: summary.revision + 1, shapeGroups: groups() }; push();
  holdAt = 44;
  const stopped = panel.mock.calls[0][0].onDelete('__proto__', { allCells: true });
  await vi.waitFor(() => expect(releaseDelete).toBeTypeOf('function'));
  summary = { ...summary, projectId: 'replacement', revision: 1 }; push(); releaseDelete(); await stopped;
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(writes).toHaveLength(44); expect(writes.slice(40).map(write => write.body.cell)).toEqual(refs.slice(0, 4));
  expect(document.getElementById('workbench-status').textContent).toContain('changed');
});
