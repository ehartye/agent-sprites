import { expect, test, vi } from 'vitest';
import { ProjectFrames } from '../../server/web/public/js/project-frames.js';

const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const summary = (extra = {}) => ({ sessionId: 's', projectId: 'p', revision: 1,
  cells: Object.fromEntries(Array.from({ length: 12 }, (_, c) => [`0,${c}`, { name: `${c}`, shapeCount: c ? 0 : 1 }])),
  cellVersions: Object.fromEntries(Array.from({ length: 12 }, (_, c) => [`0,${c}`, 1])), ...extra });
const response = (url, status = 200) => { const q = new URL(url, 'http://local').searchParams;
  return { ok: status === 200, status, json: async () => ({ ok: status === 200, data: {
    sessionId: q.get('sessionId'), projectId: q.get('projectId'), revision: Number(q.get('revision')),
    cells: Object.fromEntries(q.get('refs').split('|').map(ref => [ref, { shapes: [], reference: null }])),
    cellVersions: Object.fromEntries(q.get('refs').split('|').map(ref => [ref, 1])), shapeGroups: {},
  } }) }; };

test('summary placeholders omit shapes; selected loads first, coalesces <=8, keeps unchanged cell identity', async () => {
  const fetch = vi.fn(async url => response(url)), changed = vi.fn();
  const cache = new ProjectFrames({ fetch, onChange: changed });
  cache.setSummary(summary()); cache.demand('0,2', 'visible'); cache.select('0,0');
  for (let c = 1; c < 12; c++) cache.demand(`0,${c}`, 'visible');
  expect(cache.project.cells['0,0']).not.toHaveProperty('shapes');
  await tick();
  expect(new URL(fetch.mock.calls[0][0], 'http://local').searchParams.get('refs').split('|')[0]).toBe('0,0');
  expect(fetch.mock.calls.every(([url]) => new URL(url, 'http://local').searchParams.get('refs').split('|').length <= 8)).toBe(true);
  const loaded = cache.project.cells['0,0']; expect(loaded.shapes).toEqual([]);
  cache.setSummary(summary({ revision: 2 })); expect(cache.project.cells['0,0']).toBe(loaded);
  cache.destroy();
});

test('entry/byte and pending caps evict geometry but retain selected; session switch aborts and drops late response', async () => {
  const deferred = []; const fetch = vi.fn((url, options) => new Promise(resolve => deferred.push({ url, options, resolve })));
  const cache = new ProjectFrames({ fetch, maxEntries: 2, maxBytes: 1000, maxPending: 3 });
  cache.setSummary(summary()); cache.select('0,0'); await tick();
  for (let c = 1; c < 12; c++) cache.demand(`0,${c}`, 'preparation');
  expect(cache.pending.size).toBeLessThanOrEqual(3);
  deferred[0].resolve(response(deferred[0].url)); await tick();
  deferred[1].resolve(response(deferred[1].url)); await tick();
  expect(cache.entries.size).toBeLessThanOrEqual(2); expect(cache.bytes).toBeLessThanOrEqual(1000);
  expect(cache.project.cells['0,0'].shapes).toEqual([]);
  cache.demand('0,8'); await tick(); const last = deferred.at(-1);
  cache.setSummary(summary({ sessionId: 'other', projectId: 'other' }));
  expect(last.options.signal.aborted).toBe(true); last.resolve(response(last.url)); await tick();
  expect(cache.project.cells['0,8']).not.toHaveProperty('shapes'); expect(cache.entries.size).toBe(0);
  cache.destroy();
});

test('413 splits batches; a single oversized frame is explicit error and cannot starve selected', async () => {
  const fetch = vi.fn(async url => { const refs = new URL(url, 'http://local').searchParams.get('refs').split('|');
    return response(url, refs.length > 1 || refs[0] === '0,1' ? 413 : 200); });
  const cache = new ProjectFrames({ fetch }); cache.setSummary(summary());
  cache.select('0,0'); cache.demand('0,1'); cache.demand('0,2'); await tick(); await tick();
  expect(cache.project.cells['0,0'].shapes).toEqual([]); expect(cache.project.cells['0,2'].shapes).toEqual([]);
  expect(cache.status('0,1')).toMatchObject({ state: 'error', error: expect.stringContaining('too large') });
  const count = fetch.mock.calls.length; cache.demand('0,1'); await tick(); expect(fetch).toHaveBeenCalledTimes(count);
  cache.destroy();
});

test('409 resynchronizes once and bounded failure never loops or mixes project identities', async () => {
  const fetch = vi.fn(async url => response(url, 409)); let cache;
  const refresh = vi.fn(async () => cache.setSummary(summary({ revision: 2 })));
  cache = new ProjectFrames({ fetch, refresh }); cache.setSummary(summary()); cache.select('0,0');
  await tick(); await tick(); expect(refresh).toHaveBeenCalledTimes(1); expect(fetch.mock.calls.length).toBeLessThanOrEqual(2);
  expect(cache.status('0,0').state).toBe('error'); cache.destroy();
});

test('selected preempts an offscreen request and rejects its late geometry', async () => {
  const requests = [], fetch = vi.fn((url, options) => new Promise(resolve => requests.push({ url, options, resolve })));
  const cache = new ProjectFrames({ fetch }); cache.setSummary(summary()); cache.demand('0,8', 'preparation'); await tick();
  cache.select('0,0'); await tick(); expect(requests[0].options.signal.aborted).toBe(true);
  expect(new URL(requests[1].url, 'http://local').searchParams.get('refs').split('|')[0]).toBe('0,0');
  requests[0].resolve(response(requests[0].url)); await tick(); expect(cache.project.cells['0,8']).not.toHaveProperty('shapes');
  requests[1].resolve(response(requests[1].url)); await tick(); expect(cache.status('0,0').state).toBe('ready'); cache.destroy();
});

test('byte eviction preserves complete summary metadata and drops group geometry', async () => {
  const cache = new ProjectFrames({ fetch: async url => response(url), maxEntries: 10, maxBytes: 75 });
  cache.setSummary(summary()); cache.select('0,0'); cache.demand('0,1'); cache.demand('0,2'); await tick();
  expect(cache.bytes).toBeLessThanOrEqual(75); expect(cache.entries.size).toBeLessThan(3);
  const ref = ['0,1', '0,2'].find(ref => !cache.entries.has(ref));
  expect(cache.project.cells[ref]).toMatchObject({ name: ref.split(',')[1], shapeCount: 0 });
  expect(cache.project.cells[ref]).not.toHaveProperty('shapes'); expect(cache.groups(ref)).toEqual({}); cache.destroy();
});

test('a changed selected version cannot accept a late same-project frame response', async () => {
  const requests = []; const cache = new ProjectFrames({ fetch: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })) });
  cache.setSummary(summary()); cache.select('0,0'); await tick();
  cache.setSummary(summary({ revision: 2, cellVersions: { ...summary().cellVersions, '0,0': 2 } }));
  requests[0].resolve(response(requests[0].url)); await tick();
  expect(cache.project.cells['0,0']).not.toHaveProperty('shapes'); expect(requests).toHaveLength(2); cache.destroy();
});

test('a selected exhausted conflict becomes an error even when its batch includes a fresh offscreen demand', async () => {
  let cache, reads = 0;
  const refresh = async () => { cache.setSummary(summary({ revision: ++reads + 1 })); if (reads === 1) cache.demand('0,1'); };
  cache = new ProjectFrames({ fetch: async url => response(url, 409), refresh }); cache.setSummary(summary()); cache.select('0,0');
  await tick(); await tick(); await tick();
  expect(cache.status('0,0').state).toBe('error'); expect(reads).toBeLessThanOrEqual(2); cache.destroy();
});

test('moving frame versions cannot renew an exhausted logical demand; explicit user retry recovers', async () => {
  let cache, revision = 1, succeed = false;
  const fetch = vi.fn(async url => {
    const result = response(url, succeed ? 200 : 409);
    if (succeed) { const json = result.json; result.json = async () => { const result = await json(); result.data.cellVersions['0,0'] = revision; return result; }; }
    return result;
  });
  const refresh = vi.fn(async () => {
    // Stop the old implementation's endless self-refresh without leaving a
    // live runaway promise after the regression assertion fails.
    if (++revision > 6) { cache.destroy(); return; }
    cache.setSummary(summary({ revision, cellVersions: { ...summary().cellVersions, '0,0': revision } }));
  });
  cache = new ProjectFrames({ fetch, refresh }); cache.setSummary(summary()); cache.select('0,0');
  for (let i = 0; i < 10; i++) await tick();
  expect(fetch).toHaveBeenCalledTimes(2); expect(refresh).toHaveBeenCalledTimes(1);
  expect(cache.status('0,0').state).toBe('error');
  cache.setSummary(summary({ revision: ++revision, cellVersions: { ...summary().cellVersions, '0,0': revision } }));
  cache.select('0,0'); cache.demand('0,0', 'current'); await tick();
  expect(fetch).toHaveBeenCalledTimes(2); expect(cache.status('0,0').state).toBe('error');
  succeed = true; cache.select('0,0', { retry: true }); await tick();
  expect(fetch).toHaveBeenCalledTimes(3); expect(cache.status('0,0').state).toBe('ready'); cache.destroy();
});
