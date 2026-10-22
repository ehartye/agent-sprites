// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCanvas } from 'canvas';
import { renderCellNative } from '../../server/web/public/js/cell-raster.js';
import { CORPUS, CELL } from './raster-corpus.js';
import { NativeRasterService, rasterNativeFrame } from '../../server/web/public/js/native-frame-raster.js';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const pixels = image => [...image.getContext('2d').getImageData(0, 0, image.width, image.height).data];

describe('worker-safe canonical native raster', () => {
  it('uses the supplied canvas factory for colors, fills and plain erasers without a document', () => {
    const shapes = CORPUS.find(entry => entry.name === 'erase-alpha').shapes.concat({ type: 'fill', params: { x: 0, y: 0 }, color: '#12345680', zIndex: 9 });
    const expected = pixels(renderCellNative(shapes, CELL, CELL, c => c));
    const dom = vi.spyOn(document, 'createElement').mockImplementation(() => { throw new Error('worker has no document'); });
    let result;
    try { result = pixels(renderCellNative(shapes, CELL, CELL, c => c, { createCanvas })); } catch (error) { result = error.message; }
    dom.mockRestore();
    expect(result).toEqual(expected);
  });

  it('keeps factory-injected worker and canonical fallback pixels equal for the entire primitive corpus', () => {
    for (const entry of CORPUS) {
      const task = { ref: entry.name, cell: { shapes: entry.shapes }, width: CELL, height: CELL, palette: {} };
      expect(pixels(rasterNativeFrame(task, createCanvas)), entry.name).toEqual(pixels(rasterNativeFrame(task)));
    }
  });

  it.each(['color', 'normal', 'light'])('keeps %s exact for layers, erasure, surfaces, alpha and lighting', channel => {
    const layers = [{ id: 'child', x: 1, y: 1, w: 3, h: 3, z: 1, background: { mode: 'chroma', color: '#4488ff' } }];
    const task = descriptor('surface', { channel, palette: { ink: '#ff000080' }, cell: { lighting: { palettePolicy: 'rgb', ambient: 0.3 }, shapes: [
      { type: 'rect', color: 'ink', zIndex: 0, params: { x: 0, y: 0, w: 4, h: 4, filled: true, surface: { normal: { mode: 'bevel' } } } },
      { type: 'fill', color: '#00ff0080', zIndex: 1, params: { x: 1, y: 1, layers, surface: { normal: { mode: 'flat', vector: [1, 0, 1] } } } },
      { type: 'point', color: '#fff', zIndex: 2, params: { x: 1, y: 1, erase: true, layers } },
    ] } });
    expect(pixels(rasterNativeFrame(task, createCanvas))).toEqual(pixels(rasterNativeFrame(task)));
  });
});

const descriptor = (ref = '0,0', more = {}) => ({ projectId: 'project', ref, cellVersion: 1, width: 4, height: 4, palette: {}, cell: { shapes: [{ type: 'point', params: { x: 0, y: 0 }, color: '#ff0000' }] }, ...more });
const transport = () => {
  const workers = [];
  const factory = () => {
    const worker = { postMessage: vi.fn(), terminate: vi.fn() };
    workers.push(worker); return worker;
  };
  const finish = (image = createCanvas(4, 4)) => { const worker = workers.at(-1); worker.onmessage({ data: { id: worker.postMessage.mock.calls.at(-1)[0].id, image } }); return image; };
  return { workers, factory, finish };
};

describe('bounded shared native frame service', () => {
  it('shares one native result across consumers and hits without retained geometry', () => {
    vi.useFakeTimers();

    const wire = transport(), service = new NativeRasterService({ workerFactory: wire.factory });
    const thumb = service.createConsumer(), preview = service.createConsumer();
    const seen = [];
    thumb.request(descriptor(), { priority: 2, onReady: lease => { seen.push(lease.image); lease.release(); } });
    preview.request(descriptor(), { priority: 0, onReady: lease => { seen.push(lease.image); lease.release(); } });
    vi.runAllTimers(); expect(wire.workers).toHaveLength(1); expect(wire.workers[0].postMessage).toHaveBeenCalledTimes(1);
    const image = wire.finish();
    preview.request(descriptor('0,0', { cell: undefined }), { onReady: lease => { seen.push(lease.image); lease.release(); } });
    expect(seen).toEqual([image, image, image]);
    thumb.dispose(); expect(wire.workers[0].terminate).not.toHaveBeenCalled();
    preview.dispose(); expect(wire.workers[0].terminate).toHaveBeenCalledOnce(); expect(image.width).toBe(0);
  });

  it('bounds queued work and gives current demand the next slot without canceling useful in-flight frames', () => {
    vi.useFakeTimers();

    const wire = transport(), service = new NativeRasterService({ workerFactory: wire.factory, maxQueue: 2 }), owner = service.createConsumer();
    owner.request(descriptor('0,0'), { priority: 2 }); vi.runAllTimers();
    for (const ref of ['0,1', '0,2']) owner.request(descriptor(ref), { priority: 2 });
    const missing = vi.fn(); owner.request(descriptor('0,3'), { priority: 3, onMissing: missing });
    owner.request(descriptor('0,4'), { priority: 0 });
    expect(service.stats.queued).toBe(2); expect(missing).toHaveBeenCalled();
    wire.finish(); vi.runAllTimers();
    expect(wire.workers[0].postMessage.mock.calls.at(-1)[0].task.ref).toBe('0,4');
    expect(service.stats.inFlight).toBe(1); owner.dispose();
  });

  it('defers closing evicted or oversized images until borrowed drawing finishes', () => {
    vi.useFakeTimers();

    const wire = transport(), service = new NativeRasterService({ workerFactory: wire.factory, maxEntries: 1, maxBytes: 16 }), owner = service.createConsumer();
    let liveWidth;
    owner.request(descriptor(), { onReady: lease => { liveWidth = lease.image.width; } }); vi.runAllTimers();
    const image = wire.finish(); expect(service.stats.bytes).toBe(0); expect(liveWidth).toBe(4);
    expect(image.width).toBe(0); owner.dispose();
  });

  it('closes stale transport results after project release and does not release another consumer work', () => {
    vi.useFakeTimers();

    const wire = transport(), service = new NativeRasterService({ workerFactory: wire.factory }), a = service.createConsumer(), b = service.createConsumer(), ready = vi.fn();
    a.request(descriptor(), { onReady: ready }); b.request(descriptor(), { onReady: lease => lease.release() }); vi.runAllTimers();
    a.setProject('next'); wire.finish(); expect(ready).not.toHaveBeenCalled();
    b.dispose(); a.dispose();
    const image = createCanvas(4, 4); wire.workers[0].onmessage({ data: { id: 999, image } }); expect(image.width).toBe(0);
  });

  it('disables a failed worker once and runs serial scheduled canonical fallback', () => {
    vi.useFakeTimers();

    const wire = transport(), service = new NativeRasterService({ workerFactory: wire.factory }), owner = service.createConsumer(), results = [];
    owner.request(descriptor(), { onReady: lease => { results.push(pixels(lease.image)); lease.release(); } }); vi.runAllTimers();
    wire.workers[0].onerror({ preventDefault() {} }); expect(results).toEqual([]); vi.runAllTimers();
    owner.request(descriptor('0,1'), { onReady: lease => { results.push(pixels(lease.image)); lease.release(); } }); vi.runAllTimers();
    expect(wire.workers).toHaveLength(1); expect(results).toHaveLength(2); expect(results[0].slice(0, 4)).toEqual([255, 0, 0, 255]); owner.dispose();
  });

  it('hits lit explicit versions without geometry, respects byte bounds, and keeps peek leases alive through disposal', () => {
    vi.useFakeTimers();
    const wire = transport(), service = new NativeRasterService({ workerFactory: wire.factory, maxQueueBytes: 2000 }), owner = service.createConsumer();
    const task = descriptor('0,0', { cell: { shapes: [], lighting: { ambient: 0.3 } } });
    owner.request(task); vi.runAllTimers(); const image = wire.finish();
    const borrowed = owner.peek({ ...task, cell: undefined }); expect(borrowed?.image).toBe(image);
    const missing = vi.fn(); owner.request(descriptor('huge', { width: 100, height: 100 }), { onMissing: missing });
    expect(missing).toHaveBeenCalledWith('huge', 'oversize'); expect(service.stats.queuedBytes).toBeLessThanOrEqual(2000);
    owner.dispose(); expect(image.width).toBe(4); borrowed.release(); expect(image.width).toBe(0);
  });

  it('invalidates in-flight data without deduplicating a replacement onto stale work', () => {
    vi.useFakeTimers();
    const wire = transport(), service = new NativeRasterService({ workerFactory: wire.factory }), owner = service.createConsumer(), ready = vi.fn();
    const task = descriptor(); owner.request(task); vi.runAllTimers(); owner.invalidate(task); owner.request(task, { onReady: ready });
    const stale = wire.finish(); expect(stale.width).toBe(0); vi.runAllTimers(); wire.finish(); expect(ready).toHaveBeenCalledOnce(); owner.dispose();
  });

  it('keeps a failed running task in its bounded lane and ignores errors from a released worker', () => {
    vi.useFakeTimers();
    const wire = transport(), service = new NativeRasterService({ workerFactory: wire.factory, maxQueue: 1 }), owner = service.createConsumer();
    owner.request(descriptor()); vi.runAllTimers(); owner.request(descriptor('0,1'));
    wire.workers[0].onerror({}); expect(service.stats.queued).toBeLessThanOrEqual(1); expect(service.stats.inFlight).toBe(1);
    vi.runAllTimers(); owner.dispose();
    const next = service.createConsumer(); next.request(descriptor('0,2')); vi.runAllTimers(); next.dispose();
  });

  it('shares resolved colors across fallback policies but preserves unresolved variants and hits them without geometry', () => {
    vi.useFakeTimers();
    const service = new NativeRasterService({ workerFactory: () => null }), a = service.createConsumer(), b = service.createConsumer(), colors = [];
    const missing = descriptor('missing', { cell: { shapes: [{ type: 'point', params: { x: 0, y: 0 }, color: 'unknown' }] } });
    const ready = lease => colors.push(pixels(lease.image).slice(0, 4));
    a.request({ ...missing, fallbackColor: '#888' }, { onReady: ready }); b.request({ ...missing, fallbackColor: '#ff00ff' }, { onReady: ready }); vi.runAllTimers();
    expect(colors).toEqual([[136, 136, 136, 255], [255, 0, 255, 255]]);
    const lease = b.peek({ ...missing, cell: undefined, fallbackColor: '#ff00ff' }); expect(pixels(lease.image).slice(0, 4)).toEqual([255, 0, 255, 255]); lease.release();
    a.request({ ...descriptor(), fallbackColor: '#888' }); b.request({ ...descriptor(), fallbackColor: '#ff00ff' }); vi.runAllTimers(); expect(service.stats.entries).toBe(3); a.dispose(); b.dispose();
  });

  it('uses scheduled canonical fallback after a worker reports unsupported raster APIs', () => {
    vi.useFakeTimers();
    const wire = transport(), service = new NativeRasterService({ workerFactory: wire.factory }), owner = service.createConsumer(), ready = vi.fn();
    owner.request(descriptor(), { onReady: ready }); vi.runAllTimers(); const worker = wire.workers[0];
    worker.onmessage({ data: { id: worker.postMessage.mock.calls[0][0].id, error: 'unsupported canvas operation' } }); expect(ready).not.toHaveBeenCalled(); vi.runAllTimers(); expect(ready).toHaveBeenCalledOnce(); owner.dispose();
  });

  it.each(['running', 'queued'])('retains other consumers and cancellation closures when invalidating a shared %s job', state => {
    vi.useFakeTimers();
    const wire = transport(), service = new NativeRasterService({ workerFactory: wire.factory }), a = service.createConsumer(), b = service.createConsumer(), c = service.createConsumer();
    const task = descriptor(), ready = vi.fn(), canceled = vi.fn(), missing = vi.fn();
    const old = rasterNativeFrame(structuredClone(task), createCanvas);
    a.request(task); b.request(task, { onReady: lease => ready(pixels(lease.image)), onMissing: missing }); const cancel = c.request(task, { onReady: canceled });
    if (state === 'running') vi.runAllTimers();
    task.cell.shapes[0].params.x = 1; a.invalidate(task); cancel(); a.dispose();
    expect(missing).not.toHaveBeenCalled();
    if (state === 'running') { wire.finish(old); expect(old.width).toBe(0); expect(ready).not.toHaveBeenCalled(); }
    vi.runAllTimers(); const next = wire.workers.at(-1).postMessage.mock.calls.at(-1)[0].task; const fresh = wire.finish(rasterNativeFrame(next, createCanvas));
    expect(ready).toHaveBeenCalledOnce(); expect(ready.mock.calls[0][0].slice(0, 8)).toEqual([0, 0, 0, 0, 255, 0, 0, 255]); expect(canceled).not.toHaveBeenCalled();
    const lease = b.peek(task); b.invalidate(task); expect(fresh.width).toBe(4); lease.release(); expect(fresh.width).toBe(0); b.dispose(); c.dispose();
  });

  it('keeps invalidation fallback variants and late joins inside a full queue and one running lane', () => {
    vi.useFakeTimers();
    const wire = transport(), service = new NativeRasterService({ workerFactory: wire.factory }), a = service.createConsumer(), b = service.createConsumer(), late = service.createConsumer(), other = service.createConsumer();
    const task = descriptor(), seenA = [], seenB = [], seenLate = [];
    const ready = output => lease => output.push(pixels(lease.image).slice(0, 4));
    a.request({ ...task, fallbackColor: '#888' }, { priority: 0, onReady: ready(seenA) }); b.request({ ...task, fallbackColor: '#ff00ff' }, { priority: 0, onReady: ready(seenB) }); vi.runAllTimers();
    const stale = rasterNativeFrame(structuredClone(task), createCanvas);
    for (let i = 0; i < 32; i++) other.request(descriptor(`queued-${i}`), { priority: 2 });
    task.cell.shapes[0].color = 'unknown'; a.invalidate(task);
    late.request({ ...task, fallbackColor: '#ff00ff' }, { priority: 0, onReady: ready(seenLate) });
    expect(service.stats.queued).toBe(32); wire.finish(stale); expect(stale.width).toBe(0); expect(service.stats.inFlight).toBe(1);
    for (let i = 0; i < 2; i++) { vi.runOnlyPendingTimers(); const next = wire.workers[0].postMessage.mock.calls.at(-1)[0].task; wire.finish(rasterNativeFrame(next, createCanvas)); expect(service.stats.queued).toBeLessThanOrEqual(32); }
    expect(seenA).toEqual([[136, 136, 136, 255]]); expect(seenB).toEqual([[255, 0, 255, 255]]); expect(seenLate).toEqual(seenB);
    expect(wire.workers[0].postMessage).toHaveBeenCalledTimes(3);
    a.dispose(); b.dispose(); late.dispose(); other.dispose();
  });

  it('reuses one refreshed resolved bitmap after previously distinct fallback jobs converge', () => {
    vi.useFakeTimers();
    const wire = transport(), service = new NativeRasterService({ workerFactory: wire.factory }), a = service.createConsumer(), b = service.createConsumer(), other = service.createConsumer(), seen = [];
    const task = descriptor('0,0', { cell: { shapes: [{ type: 'point', params: { x: 0, y: 0 }, color: 'unknown' }] } });
    const ready = lease => seen.push(pixels(lease.image).slice(0, 4));
    a.request({ ...task, fallbackColor: '#888' }, { onReady: ready }); b.request({ ...task, fallbackColor: '#ff00ff' }, { onReady: ready }); vi.runAllTimers();
    for (let i = 0; i < 31; i++) other.request(descriptor(`queued-${i}`));
    expect(service.stats.queued).toBe(32);
    const stale = rasterNativeFrame({ ...structuredClone(task), fallbackColor: '#888' }, createCanvas);
    task.cell.shapes[0].color = '#0000ff'; a.invalidate(task); wire.finish(stale); expect(stale.width).toBe(0); vi.runOnlyPendingTimers();
    const next = wire.workers[0].postMessage.mock.calls.at(-1)[0].task; wire.finish(rasterNativeFrame(next, createCanvas)); vi.runOnlyPendingTimers();
    expect(seen).toEqual([[0, 0, 255, 255], [0, 0, 255, 255]]); expect(wire.workers[0].postMessage).toHaveBeenCalledTimes(2); a.dispose(); b.dispose(); other.dispose();
  });

  it.each(['running', 'queued'])('rejects an oversized refreshed %s task and releases its subscribers', state => {
    vi.useFakeTimers();
    const wire = transport(), service = new NativeRasterService({ workerFactory: wire.factory, maxQueueBytes: 2000 }), a = service.createConsumer(), b = service.createConsumer(), ready = vi.fn(), missing = vi.fn();
    const task = descriptor(); a.request(task); b.request(task, { onReady: ready, onMissing: missing }); if (state === 'running') vi.runAllTimers();
    task.cell.shapes[0].params.extra = 'x'.repeat(2000); a.invalidate(task);
    expect(missing).toHaveBeenCalledWith('0,0', 'oversize'); expect(service.stats.queuedBytes).toBe(0);
    if (state === 'running') { const stale = wire.finish(); expect(stale.width).toBe(0); }
    vi.runAllTimers(); expect(ready).not.toHaveBeenCalled(); expect(service.stats.inFlight).toBe(0); a.dispose(); b.dispose();
  });

  it('recounts grown queued geometry and maintains the total byte cap', () => {
    vi.useFakeTimers();
    const wire = transport(), service = new NativeRasterService({ workerFactory: wire.factory, maxQueueBytes: 10000 }), a = service.createConsumer(), other = service.createConsumer(), missing = vi.fn();
    other.request(descriptor('running')); vi.runAllTimers(); const task = descriptor(); a.request(task, { priority: 0 });
    for (let i = 0; i < 9; i++) other.request(descriptor(`queued-${i}`), { priority: 2, onMissing: missing });
    const before = service.stats.queuedBytes; task.cell.shapes[0].params.extra = 'x'.repeat(4000); a.invalidate(task);
    expect(service.stats.queuedBytes).toBeGreaterThan(before); expect(service.stats.queuedBytes).toBeLessThanOrEqual(10000);
    expect(missing).toHaveBeenCalledWith(expect.stringContaining('queued-'), 'capacity'); a.dispose(); other.dispose();
  });

  it('keeps remaining refreshed demand alive when another subscriber switches projects', () => {
    vi.useFakeTimers();
    const wire = transport(), service = new NativeRasterService({ workerFactory: wire.factory }), a = service.createConsumer(), b = service.createConsumer(), readyA = vi.fn(), readyB = vi.fn(), task = descriptor();
    a.request({ ...task, fallbackColor: '#888' }, { onReady: readyA }); b.request({ ...task, fallbackColor: '#ff00ff' }, { onReady: readyB }); vi.runAllTimers();
    task.cell.shapes[0].color = 'unknown'; a.invalidate(task); b.setProject('other'); const stale = wire.finish(); expect(stale.width).toBe(0); vi.runAllTimers();
    expect(wire.workers[0].terminate).not.toHaveBeenCalled(); const next = wire.workers[0].postMessage.mock.calls.at(-1)[0].task; wire.finish(rasterNativeFrame(next, createCanvas));
    expect(readyA).toHaveBeenCalledOnce(); expect(readyB).not.toHaveBeenCalled(); expect(wire.workers[0].postMessage).toHaveBeenCalledTimes(2); a.dispose(); b.dispose();
  });

  it('validates a late subscriber variant before attaching it to a refreshed slot', () => {
    vi.useFakeTimers();
    const wire = transport(), service = new NativeRasterService({ workerFactory: wire.factory, maxQueueBytes: 2000 }), a = service.createConsumer(), b = service.createConsumer(), missing = vi.fn(), task = descriptor();
    a.request(task); vi.runAllTimers(); task.cell.shapes[0].color = 'unknown'; a.invalidate(task);
    b.request({ ...task, fallbackColor: 'x'.repeat(2000) }, { onMissing: missing });
    expect(missing).toHaveBeenCalledWith('0,0', 'oversize'); expect(service.stats.queuedBytes).toBe(0); a.dispose(); b.dispose();
  });

  it('registers cache-only consumers before releasing another project owner', () => {
    vi.useFakeTimers();
    const service = new NativeRasterService({ workerFactory: () => null }), a = service.createConsumer(), b = service.createConsumer();
    b.request(descriptor()); vi.runAllTimers(); a.peek(descriptor()).release(); b.dispose();
    const lease = a.peek(descriptor()); expect(lease).not.toBeNull(); lease?.release(); a.dispose(); expect(a.peek(descriptor())).toBeNull();
  });
});
