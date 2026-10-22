// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCanvas } from 'canvas';
import { NativeRasterService } from '../../server/web/public/js/native-frame-raster.js';
import { AnimationPreview } from '../../server/web/public/js/animation.js';
import { CellNavigator } from '../../server/web/public/js/cell-nav.js';
import { CanvasEditor } from '../../server/web/public/js/canvas-editor.js';
import * as raster from '../../server/web/public/js/cell-raster.js';

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const shape = color => ({ type: 'point', params: { x: 0, y: 0 }, color, zIndex: 0 });
const frame = color => { const image = createCanvas(4, 4), ctx = image.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 4, 4); return image; };
const setup = (options = {}) => {
  vi.useFakeTimers(); document.body.innerHTML = '<div id="anim-panel"></div><div id="full-preview"></div><div id="cell-strip"></div>';
  const workers = [];
  const service = new NativeRasterService({ ...options, workerFactory: () => { const w = { postMessage: vi.fn(), terminate: vi.fn() }; workers.push(w); return w; } });
  const complete = color => { const w = workers.at(-1), call = w.postMessage.mock.calls.at(-1)[0]; w.onmessage({ data: { id: call.id, image: frame(color) } }); };
  return { service, workers, complete };
};
const configure = (ap, cells, context = { projectId: 'p', cellVersions: { '0,0': 1, '0,1': 1 } }) => { ap.init(); ap.setCellSize(4); ap.setPalette({}); ap.setRasterContext(context); ap.setCells(cells); ap.setFrames(['0,0']); };
const pixel = ap => [...ap._ctx.getImageData(0, 0, 1, 1).data];

describe('asynchronous shared native consumers', () => {
  it('deduplicates preview sizes and visible thumbs, then reuses native art for setters and scaling', () => {
    const { service, workers, complete } = setup(), cells = { '0,0': { shapes: [shape('#f00')] } };
    const ap = new AnimationPreview({ rasterService: service, size: 4 }), full = new AnimationPreview({ rasterService: service, mountId: 'full-preview', size: 8 });

    configure(ap, cells); configure(full, cells);
    const nav = new CellNavigator({ rasterService: service }); nav.setGrid(1, 1, 4); nav.setRasterContext({ projectId: 'p', cellVersions: { '0,0': 1 } }); nav.setCells(cells); nav.render(); vi.runAllTimers();
    expect(workers[0].postMessage).toHaveBeenCalledTimes(1); complete('#f00'); vi.runAllTimers();
    expect(pixel(ap)).toEqual([255, 0, 0, 255]); expect(pixel(full)).toEqual([255, 0, 0, 255]);
    expect([...document.querySelector('.cell-thumb-canvas').getContext('2d').getImageData(0, 0, 1, 1).data]).toEqual([255, 0, 0, 255]);
    ap.setBackground({ mode: 'transparent' }); ap.setCells({ '0,0': { shapes: [...cells['0,0'].shapes] } }); ap._renderFrame(); ap._size = 16; ap._applyCanvasSize(); ap._renderFrame();
    expect(workers[0].postMessage).toHaveBeenCalledTimes(1); ap.destroy(); full.destroy(); nav.destroy();
  });

  it('never treats absent geometry as blank and rejects late results from a changed project', () => {
    const { service, workers, complete } = setup(), ap = new AnimationPreview({ rasterService: service, size: 4 }), missing = vi.fn();

    configure(ap, {}, { projectId: 'p', cellVersions: { '0,0': 1 }, onMissing: missing });
    expect(ap._canvas.dataset.state).toBe('loading'); expect(ap._frameInfo.textContent).toMatch(/Loading/); expect(missing).toHaveBeenCalledWith('0,0', 'current'); expect(workers).toHaveLength(0);
    ap.setCells({ '0,0': { shapes: [shape('#f00')] } }); vi.runAllTimers();
    const staleWorker = workers[0], staleId = staleWorker.postMessage.mock.calls[0][0].id;
    ap.setRasterContext({ projectId: 'q', cellVersions: { '0,0': 2 } }); ap.setCells({ '0,0': { shapes: [shape('#00f')] } }); vi.runAllTimers();
    const stale = frame('#f00'); staleWorker.onmessage({ data: { id: staleId, image: stale } }); expect(stale.width).toBe(0); complete('#00f');
    expect(pixel(ap)).toEqual([0, 0, 255, 255]); ap.destroy();
  });

  it('prepares a fitting one-shot sequence before starting authored holds and caches completed noncurrent frames', () => {
    const { service, workers, complete } = setup(), ap = new AnimationPreview({ rasterService: service, size: 4 });

    configure(ap, { '0,0': { shapes: [shape('#f00')] }, '0,1': { shapes: [shape('#00f')] } });
    ap.setFrames(['0,0', '0,1', '0,0'], { durations: [50, 50, 50], loop: false }); ap.play(); vi.runOnlyPendingTimers();
    vi.advanceTimersByTime(500); expect(ap._currentFrame).toBe(0); expect(ap._playing).toBe(true); expect(ap._frameInfo.textContent).toMatch(/Preparing/);
    complete('#f00'); vi.runAllTimers(); expect(workers[0].postMessage).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(500); expect(ap._currentFrame).toBe(0); complete('#00f');
    expect(ap._canvas.dataset.state).toBe('ready'); vi.advanceTimersByTime(50); expect(ap._currentFrame).toBe(1); expect(pixel(ap)).toEqual([0, 0, 255, 255]);
    vi.advanceTimersByTime(100); expect(ap._playing).toBe(false); expect(ap._currentFrame).toBe(2); expect(workers[0].postMessage).toHaveBeenCalledTimes(2); ap.destroy();
  });

  it('recomposes partial alpha once when preparation and repeated setters paint the same native frame', () => {
    const { service, complete } = setup(), ap = new AnimationPreview({ rasterService: service, size: 4 });
    document.documentElement.style.setProperty('--checker-a', 'transparent'); document.documentElement.style.setProperty('--checker-b', 'transparent');
    configure(ap, { '0,0': { shapes: [shape('#ff000080')] } }); ap.play(); vi.runAllTimers(); complete('#ff000080');
    expect(pixel(ap)[3]).toBe(128); ap.setBackground({ mode: 'transparent' }); ap._renderFrame(); expect(pixel(ap)[3]).toBe(128); ap.destroy();
  });

  it('promotes adjacent demand when it becomes current without invalidating the running former frame', () => {
    const { service, workers, complete } = setup(), ap = new AnimationPreview({ rasterService: service, size: 4 });
    configure(ap, { '0,0': { shapes: [shape('#f00')] }, '0,1': { shapes: [shape('#00f')] } }); vi.runAllTimers();
    ap._requestNative('0,1', 3, 'adjacent');
    const other = service.createConsumer(); other.request({ projectId: 'p', ref: 'other', cellVersion: 1, width: 4, height: 4, cell: { shapes: [] } }, { priority: 2 });
    ap._currentFrame = 1; ap._frames = ['0,0', '0,1']; ap._renderFrame(); complete('#f00'); vi.runAllTimers();
    expect(workers[0].postMessage.mock.calls.at(-1)[0].task.ref).toBe('0,1'); complete('#00f'); expect(pixel(ap)).toEqual([0, 0, 255, 255]); ap.destroy(); other.dispose();
  });

  it('never assigns old geometry to a new version when context arrives before cells, and preserves unchanged version work', () => {
    const { service, workers, complete } = setup(), ap = new AnimationPreview({ rasterService: service, size: 4 });
    configure(ap, { '0,0': { shapes: [shape('#f00')] }, '0,1': { shapes: [shape('#0f0')] } }); vi.runAllTimers(); complete('#f00');
    ap.setRasterContext({ projectId: 'p', cellVersions: { '0,0': 2, '0,1': 1 } }); vi.runAllTimers();
    expect(workers[0].postMessage).toHaveBeenCalledTimes(1); expect(ap._canvas.dataset.state).toBe('loading');
    ap.setCells({ '0,0': { shapes: [shape('#00f')] }, '0,1': { shapes: [shape('#0f0')] } }); vi.runAllTimers();
    expect(workers[0].postMessage.mock.calls.at(-1)[0].task.cell.shapes[0].color).toBe('#00f'); complete('#00f');
    ap.setRasterContext({ projectId: 'p', cellVersions: { '0,0': 2, '0,1': 1 } }); ap._renderFrame();
    expect(pixel(ap)).toEqual([0, 0, 255, 255]); expect(workers[0].postMessage).toHaveBeenCalledTimes(2); ap.destroy();
  });

  it('updates geometry and identity atomically and pauses future preparation without canceling another preview', () => {
    const { service, workers, complete } = setup(), ap = new AnimationPreview({ rasterService: service, size: 4 }), full = new AnimationPreview({ rasterService: service, mountId: 'full-preview', size: 4 });
    const cells = { '0,0': { shapes: [shape('#f00')] }, '0,1': { shapes: [shape('#00f')] } };
    configure(ap, cells); configure(full, cells); ap.setFrames(['0,0', '0,1']); ap.play(); vi.runAllTimers(); complete('#f00');
    ap.pause(); vi.runAllTimers(); expect(workers[0].postMessage).toHaveBeenCalledTimes(1); expect(pixel(full)).toEqual([255, 0, 0, 255]);
    ap.setCells({ '0,0': { shapes: [shape('#0f0')] } }, { projectId: 'p', cellVersions: { '0,0': 2 } }); vi.runAllTimers();
    expect(workers[0].postMessage.mock.calls.at(-1)[0].task.cellVersion).toBe(2); complete('#0f0'); expect(pixel(ap)).toEqual([0, 255, 0, 255]); ap.destroy(); full.destroy();
  });

  it('starts oversized sequences after current readiness and caches useful slow results after the playhead advances', () => {
    const { service, workers, complete } = setup({ maxEntries: 1 }), ap = new AnimationPreview({ rasterService: service, size: 4 });
    configure(ap, { '0,0': { shapes: [shape('#f00')] }, '0,1': { shapes: [shape('#00f')] } }); ap.setFrames(['0,0', '0,1'], { durations: [50, 50] }); ap.play(); vi.runAllTimers();
    complete('#f00'); expect(ap._preparing).toBeNull(); vi.advanceTimersByTime(51);
    const secondId = workers[0].postMessage.mock.calls.at(-1)[0].id; vi.advanceTimersByTime(150); expect(ap._currentFrame).toBe(0);
    complete('#00f'); expect(workers[0].postMessage.mock.calls.at(-1)[0].id).toBe(secondId);
    const lease = ap._native.peek(ap._nativeTask('0,1')); expect(lease).not.toBeNull(); lease.release();
    expect(pixel(ap)).not.toEqual([0, 0, 255, 255]); ap.destroy();
  });

  it('detects in-place version-table updates and restarts preparation for the new native context', () => {
    const { service, workers, complete } = setup(), ap = new AnimationPreview({ rasterService: service, size: 4 });
    const context = { projectId: 'p', cellVersions: { '0,0': 1 } };
    configure(ap, { '0,0': { shapes: [shape('#f00')] } }, context); vi.runAllTimers(); complete('#f00');
    context.cellVersions['0,0'] = 2; ap.setRasterContext(context); vi.runAllTimers(); expect(workers[0].postMessage).toHaveBeenCalledTimes(1);
    ap.setCells({ '0,0': { shapes: [shape('#00f')] } }, context); ap.play(); vi.runAllTimers(); expect(ap._preparing).not.toBeNull(); complete('#00f'); expect(ap._preparing).toBeNull(); ap.destroy();
  });

  it('prepares every fitting frame again when palette changes during an earlier warm pass', () => {
    const { service, complete } = setup(), ap = new AnimationPreview({ rasterService: service, size: 4 });
    configure(ap, { '0,0': { shapes: [shape('#f00')] }, '0,1': { shapes: [shape('#00f')] }, '0,2': { shapes: [shape('#0f0')] } });
    ap.setFrames(['0,0', '0,1', '0,2']); ap.play(); vi.runAllTimers(); complete('#f00'); vi.runAllTimers(); complete('#00f'); vi.runAllTimers();
    ap.setPalette({ ink: '#fff' }); complete('#0f0');
    for (let i = 0; i < 5 && ap._preparing; i++) { vi.runOnlyPendingTimers(); complete('#f00'); }
    expect(ap._preparing).toBeNull();
    for (const ref of ap._frames) { const lease = ap._native.peek(ap._nativeTask(ref)); expect(lease, ref).not.toBeNull(); lease?.release(); }
    ap.destroy();
  });

  it('keeps the authored clock stopped while the FPS control changes during preparation', () => {
    const { service, complete } = setup(), ap = new AnimationPreview({ rasterService: service, size: 4 });
    configure(ap, { '0,0': { shapes: [shape('#f00')] } }); ap.play(); vi.runAllTimers();
    ap._fpsSlider.value = '20'; ap._fpsSlider.dispatchEvent(new Event('input')); vi.advanceTimersByTime(500);
    expect(ap._playbackStart).toBeNull(); expect(ap._frameInfo.textContent).toMatch(/Preparing/); complete('#f00'); expect(ap._playbackStart).not.toBeNull(); ap.destroy();
  });

  it('retries visible thumbnails after another native consumer frees bounded queue capacity', () => {
    const { service, workers, complete } = setup({ maxQueue: 1 }), other = service.createConsumer();
    const task = ref => ({ projectId: 'p', ref, cellVersion: 1, width: 4, height: 4, cell: { shapes: [] } });
    other.request(task('blocking'), { priority: 0 }); vi.runAllTimers(); other.request(task('queued'), { priority: 0 });
    const nav = new CellNavigator({ rasterService: service }); nav.setGrid(1, 1, 4); nav.setCells({ '0,0': { shapes: [shape('#0f0')] } }, { projectId: 'p', cellVersions: { '0,0': 1 } }); nav.render(); vi.runAllTimers();
    complete('#000'); vi.runAllTimers(); complete('#000'); vi.runAllTimers();
    expect(workers[0].postMessage.mock.calls.at(-1)[0].task.ref).toBe('0,0'); complete('#0f0');
    expect([...document.querySelector('.cell-thumb-canvas').getContext('2d').getImageData(0, 0, 1, 1).data]).toEqual([0, 255, 0, 255]); nav.destroy(); other.dispose();
  });

  it('retries current preview demand after a transient queue rejection', () => {
    const { service, workers, complete } = setup({ maxQueue: 1 }), ap = new AnimationPreview({ rasterService: service, size: 4 }), other = service.createConsumer();
    configure(ap, { '0,0': { shapes: [shape('#f00')] }, '0,1': { shapes: [shape('#00f')] } }); ap.setFrames(['0,0', '0,1']); vi.runAllTimers();
    other.request({ projectId: 'p', ref: 'queued', cellVersion: 1, width: 4, height: 4, cell: { shapes: [] } }, { priority: 0 });
    ap._currentFrame = 1; ap._renderFrame(); complete('#f00'); vi.runAllTimers(); ap._renderFrame(); complete('#000'); vi.runAllTimers();
    expect(workers[0].postMessage.mock.calls.at(-1)[0].task.ref).toBe('0,1'); complete('#00f'); expect(pixel(ap)).toEqual([0, 0, 255, 255]); ap.destroy(); other.dispose();
  });

  it('keeps preparation waiting through retryable congestion and resumes when capacity is released', () => {
    const { service, complete } = setup({ maxQueue: 1 }), other = service.createConsumer(), ap = new AnimationPreview({ rasterService: service, size: 4 });
    const task = ref => ({ projectId: 'p', ref, cellVersion: 1, width: 4, height: 4, cell: { shapes: [] } });
    other.request(task('blocking'), { priority: 0 }); vi.runAllTimers(); other.request(task('queued'), { priority: 0 });
    configure(ap, { '0,0': { shapes: [shape('#f00')] } }); ap.play(); expect(ap._playing).toBe(true); expect(ap._playbackStart).toBeNull();
    complete('#000'); vi.runAllTimers(); complete('#000'); vi.runAllTimers(); complete('#f00'); expect(ap._preparing).toBeNull(); expect(ap._playbackStart).not.toBeNull(); ap.destroy(); other.dispose();
  });

  it('retains queued visible work when unrelated progressive cells arrive', () => {
    const { service, workers, complete } = setup(), other = service.createConsumer(), nav = new CellNavigator({ rasterService: service });
    other.request({ projectId: 'p', ref: 'blocking', cellVersion: 1, width: 4, height: 4, cell: { shapes: [] } }, { priority: 0 }); vi.runAllTimers();
    const cell = { shapes: [shape('#0f0')] }; nav.setGrid(1, 2, 4); nav.setCells({ '0,0': cell }, { projectId: 'p', cellVersions: { '0,0': 1 } }); nav.setFilter(['0,0']); vi.runAllTimers();
    other.request({ projectId: 'p', ref: 'later', cellVersion: 1, width: 4, height: 4, cell: { shapes: [] } }, { priority: 1 });
    nav.setCells({ '0,0': { shapes: [...cell.shapes] }, '0,1': { shapes: [] } }, { projectId: 'p', cellVersions: { '0,0': 1, '0,1': 1 } });
    complete('#000'); vi.runAllTimers(); expect(workers[0].postMessage.mock.calls.at(-1)[0].task.ref).toBe('0,0'); nav.destroy(); other.dispose();
  });

  it.each(['atomic cells/context', 'standalone context'])('retains preparation FIFO and the queued native job through unrelated %s updates', update => {
    const { service, workers, complete } = setup(), ap = new AnimationPreview({ rasterService: service, size: 4 }), other = service.createConsumer();
    const cells = { '0,0': { shapes: [shape('#f00')] }, '0,1': { shapes: [shape('#00f')] } };
    configure(ap, cells); ap.setFrames(['0,0', '0,1'], { durations: [50, 50], loop: false }); ap.play(); vi.runAllTimers();
    const firstId = workers[0].postMessage.mock.calls.at(-1)[0].id;
    complete('#f00'); // B is queued while A's completion is still being handled.
    other.request({ projectId: 'p', ref: 'later', cellVersion: 1, width: 4, height: 4, cell: { shapes: [] } }, { priority: 0 });
    const context = { projectId: 'p', cellVersions: { '0,0': 1, '0,1': 1, '0,2': 1 } };
    if (update === 'atomic cells/context') ap.setCells({ '0,0': { shapes: [...cells['0,0'].shapes] }, '0,1': { shapes: [...cells['0,1'].shapes] }, '0,2': { shapes: [] } }, context);
    else ap.setRasterContext(context);
    vi.runOnlyPendingTimers();
    const next = workers[0].postMessage.mock.calls.at(-1)[0];
    expect(next.task.ref).toBe('0,1'); expect(next.id).toBe(firstId + 1);
    expect(ap._playbackStart).toBeNull(); expect(ap._frameInfo.textContent).toMatch(/Preparing 1 \/ 2/);
    ap.destroy(); other.dispose();
  });

  it.each(['atomic cells/context', 'standalone context'])('preserves authored elapsed time through unrelated %s updates', update => {
    const { service, complete } = setup(), ap = new AnimationPreview({ rasterService: service, size: 4 });
    const cells = { '0,0': { shapes: [shape('#f00')] }, '0,1': { shapes: [shape('#00f')] } };
    configure(ap, cells); ap.setFrames(['0,0', '0,1'], { durations: [50, 50], loop: false }); ap.play(); vi.runAllTimers();
    complete('#f00'); vi.runAllTimers(); complete('#00f'); vi.advanceTimersByTime(25);
    const start = ap._playbackStart, context = { projectId: 'p', cellVersions: { '0,0': 1, '0,1': 1, '0,2': 1 } };
    if (update === 'atomic cells/context') ap.setCells({ ...cells, '0,2': { shapes: [] } }, context);
    else ap.setRasterContext(context);
    expect(ap._playbackStart).toBe(start); expect(ap._preparing).toBeNull();
    vi.advanceTimersByTime(25); expect(ap._currentFrame).toBe(1);
    vi.advanceTimersByTime(50); expect(ap._playing).toBe(false); ap.destroy();
  });

  it.each(['atomic cells/context', 'standalone context'])('restarts preparation for a selected frame version changed by %s', update => {
    const { service, workers, complete } = setup(), ap = new AnimationPreview({ rasterService: service, size: 4 });
    const cells = { '0,0': { shapes: [shape('#f00')] }, '0,1': { shapes: [shape('#00f')] } };
    configure(ap, cells); ap.setFrames(['0,0', '0,1'], { durations: [50, 50], loop: false }); ap.play(); vi.runAllTimers(); complete('#f00');
    const changedCells = { ...cells, '0,0': { shapes: [shape('#0f0')], lighting: { palettePolicy: 'rgb', ambient: 0.5 } } };
    const context = { projectId: 'p', cellVersions: { '0,0': 2, '0,1': 1 } };
    if (update === 'atomic cells/context') ap.setCells(changedCells, context);
    else { ap.setRasterContext(context); ap.setCells(changedCells); }
    vi.runAllTimers();
    const next = workers[0].postMessage.mock.calls.at(-1)[0].task;
    expect(next.ref).toBe('0,0'); expect(next.cellVersion).toBe(2); expect(next.cell).toEqual(changedCells['0,0']); expect(ap._playbackStart).toBeNull();
    complete('#0f0'); vi.runAllTimers(); complete('#00f'); expect(ap._preparing).toBeNull(); expect(pixel(ap)).toEqual([0, 255, 0, 255]);
    vi.advanceTimersByTime(50); expect(ap._currentFrame).toBe(1); vi.advanceTimersByTime(50); expect(ap._playing).toBe(false); ap.destroy();
  });
});

describe('selected editor one-frame native reuse', () => {
  it('reuses native layered pixels across selection, overlays, zoom and equal context setters, then releases changed inputs', () => {
    document.body.innerHTML = '<div id="wrap"><canvas id="editor-canvas"></canvas></div>';
    const ed = new CanvasEditor(), wrap = document.getElementById('wrap'); wrap.getBoundingClientRect = () => ({ width: 16, height: 16 }); ed.init(wrap, 4); ed.setZoom(1);
    const paint = vi.spyOn(raster, 'renderCellNative'), cell = { lighting: { palettePolicy: 'rgb', ambient: 1 }, shapes: [shape('ink')] };
    ed.setPalette({ ink: '#ff0000' }); ed.setCell(cell); const native = paint.mock.results.at(-1).value;
    ed.setSelectedShape(cell.shapes[0]); ed.setZoom(2); ed.setOnionSkin({ prev: [], next: [] }); ed.setBackground({ mode: 'transparent' }); ed.setPalette({ ink: '#ff0000' }); ed.render();
    expect(paint).toHaveBeenCalledTimes(1); expect(native.width).toBe(4);
    ed.setPalette({ ink: '#0000ff' }); ed.render(); expect(paint).toHaveBeenCalledTimes(2); expect(native.width).toBe(0);
    const second = paint.mock.results.at(-1).value; ed._refImage = frame('#0f0'); ed._refOpacity = 1; ed.render(); expect(paint).toHaveBeenCalledTimes(3); expect(second.width).toBe(0);
    const third = paint.mock.results.at(-1).value; ed.setCell({ ...cell, lighting: { palettePolicy: 'rgb', ambient: 0.5 } }); expect(paint).toHaveBeenCalledTimes(4); expect(third.width).toBe(0); ed.destroy(); expect(paint.mock.results.at(-1).value.width).toBe(0);
  });
});
