// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
import { ConstructionReplayPanel } from '../../server/web/public/js/construction-replay.js';
const png = 'data:image/png;base64,iVBORw0KGgo=';
const metadata = { kind: 'construction', width: 8, height: 8, limits: { maxPixels: 64000000 }, cells: ['0,0'], steps: [
  { step: 0, operationIndex: 0, command: 'new', label: 'Initial canvas', source: { path: 'source.json', pointer: '/0', sha256: 'a'.repeat(64) } },
  { step: 1, operationIndex: 2, command: 'draw', label: 'eye detail', source: { path: 'source.json', pointer: '/2', sha256: 'a'.repeat(64) } },
] };
test('scrubs construction and contribution through shared read-only server calls pinned to the active session', async () => {
  document.body.innerHTML = '<div id="replay"></div>';
  const request = vi.fn(async (_path, body) => body ? { data: { step: metadata.steps[body.step], changedPixels: 1, clearedPixels: 0, current: { sameState: false, samePixels: false } }, images: { after: png, before: png, contribution: png, changedMask: png } } : { data: metadata });
  const panel = new ConstructionReplayPanel({ request, getCell: () => '1,2', getSessionId: () => 'session-one' });
  await panel.render(document.getElementById('replay'));
  await vi.waitFor(() => expect(document.querySelector('[data-replay-status]').textContent).toContain('Live'));
  const slider = document.querySelector('[name="replay-step"]'); slider.value = '1'; slider.dispatchEvent(new Event('input'));
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith('/workbench/replay', { cell: '0,0', step: 1, scale: 4 }, { sessionId: 'session-one' }));
  expect(document.querySelector('[data-replay-source]').textContent).toContain('source.json');
  expect(document.querySelector('[data-replay-source]').textContent).toContain('/2');
  expect(document.querySelector('[data-replay-source]').textContent).toContain('eye detail');
  const mode = document.querySelector('[name="replay-view"]'); mode.value = 'contribution'; mode.dispatchEvent(new Event('change'));
  expect(document.querySelector('.replay-image').src).toBe(png);
  expect(document.querySelector('[data-replay-status]').textContent).toContain('differs');
  expect(request.mock.calls.every(([path]) => path === '/workbench/replay')).toBe(true);
});
test('an older step response cannot replace a newer selected step', async () => {
  document.body.innerHTML = '<div id="replay"></div>';
  const pending = [];
  const request = vi.fn(async (_path, body) => body ? new Promise(resolve => pending.push({ body, resolve })) : { data: metadata });
  const panel = new ConstructionReplayPanel({ request, getCell: () => '0,0', getSessionId: () => 'one' });
  await panel.render(document.getElementById('replay'));
  const slider = document.querySelector('[name="replay-step"]'); slider.value = '1'; slider.dispatchEvent(new Event('input'));
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  const result = step => ({ data: { step: metadata.steps[step], changedPixels: 0, clearedPixels: 0, current: { sameState: true, samePixels: true } }, images: { after: png } });
  pending[1].resolve(result(1)); await vi.waitFor(() => expect(document.querySelector('[data-replay-source]').textContent).toContain('eye detail'));
  pending[0].resolve(result(0)); await new Promise(resolve => setTimeout(resolve, 0));
  expect(document.querySelector('[data-replay-source]').textContent).toContain('eye detail');
});
test('leaving the replay tab prevents a late metadata response from painting another panel', async () => {
  document.body.innerHTML = '<div id="replay"></div>';
  let resolveMetadata, current = true;
  const panel = new ConstructionReplayPanel({ request: () => new Promise(resolve => { resolveMetadata = resolve; }), getCell: () => '0,0', getSessionId: () => 'one', isCurrent: () => current });
  const rendering = panel.render(document.getElementById('replay'));
  current = false; document.getElementById('replay').textContent = 'Another tool';
  resolveMetadata({ data: metadata }); await rendering;
  expect(document.getElementById('replay').textContent).toBe('Another tool');
});
test('live refresh retains the selected step and coalesces dense incremental edits', async () => {
  document.body.innerHTML = '<div id="replay"></div>';
  const request = vi.fn(async (_path, body) => body ? { data: { step: metadata.steps[body.step], changedPixels: 0, current: { sameState: true, samePixels: true } }, images: { after: png } } : { data: metadata });
  const panel = new ConstructionReplayPanel({ request, getCell: () => '0,0', getSessionId: () => 'one' });
  await panel.render(document.getElementById('replay'));
  const slider = document.querySelector('[name="replay-step"]'); slider.value = '1'; slider.dispatchEvent(new Event('input'));
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith('/workbench/replay', { cell: '0,0', step: 1, scale: 4 }, { sessionId: 'one' }));
  const before = request.mock.calls.length;
  for (let i = 0; i < 30; i++) panel.refreshCurrent();
  await vi.waitFor(() => expect(request.mock.calls.length).toBe(before + 1));
  expect(slider.value).toBe('1');
});
test('initial replay zoom fits the server-reported pixel budget for large cells', async () => {
  document.body.innerHTML = '<div id="replay"></div>';
  const request = vi.fn(async (_path, body) => body ? { data: { step: metadata.steps[0], changedPixels: 0, current: { sameState: true, samePixels: true } }, images: { after: png } } : { data: { ...metadata, width: 1024, height: 1024 } });
  const panel = new ConstructionReplayPanel({ request, getCell: () => '0,0', getSessionId: () => 'one' });
  await panel.render(document.getElementById('replay'));
  expect(document.querySelector('[name="replay-scale"]').value).toBe('2');
  expect(request).toHaveBeenCalledWith('/workbench/replay', { cell: '0,0', step: 0, scale: 2 }, { sessionId: 'one' });
});
