import { expect, test, vi } from 'vitest';
import { LiveMutations } from '../../server/web/public/js/live-mutations.js';

test('two rapid edits capture targets and advance pins serially; switching identity rejects queued intent', async () => {
  let pins = { sessionId: 's', projectId: 'p', revision: 1 }, release;
  const queue = new LiveMutations({ getPins: () => pins }); const calls = [];
  const first = queue.enqueue(async current => { calls.push(current); await new Promise(resolve => { release = resolve; }); return { pins: { ...current, revision: 2 } }; });
  const second = queue.enqueue(async current => { calls.push(current); return { pins: { ...current, revision: 3 } }; });
  await Promise.resolve(); expect(calls).toHaveLength(1); release(); await first; await second;
  expect(calls.map(p => p.revision)).toEqual([1, 2]);
  release = null;
  const third = queue.enqueue(async () => { await new Promise(resolve => { release = resolve; }); });
  const stale = queue.enqueue(vi.fn()); const failed = expect(stale).rejects.toThrow('changed');
  while (!release) await Promise.resolve(); pins = { sessionId: 'new', projectId: 'new', revision: 1 }; release();
  await third; await failed;
});

test('conflicts refresh once and visibly reject without replay; HTTP and WS share ordering', async () => {
  const pins = { sessionId: 's', projectId: 'p', revision: 1 }, refresh = vi.fn();
  const queue = new LiveMutations({ getPins: () => pins, refresh });
  const operation = vi.fn(async () => { throw Object.assign(new Error('conflict'), { status: 409 }); });
  await expect(queue.enqueue(operation)).rejects.toThrow('conflict');
  expect(operation).toHaveBeenCalledTimes(1); expect(refresh).toHaveBeenCalledTimes(1);
});

test('only explicit initial session creation may enter the lane before a project exists', async () => {
  const queue = new LiveMutations({ getPins: () => ({}) }); const operation = vi.fn(async () => 'created');
  await expect(queue.enqueue(operation)).rejects.toThrow('changed');
  await expect(queue.enqueue(operation, undefined, { allowUnbound: true })).resolves.toBe('created');
});
