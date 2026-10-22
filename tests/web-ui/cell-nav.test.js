// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CellNavigator } from '../../server/web/public/js/cell-nav.js';

describe('CellNavigator (browser)', () => {
  let nav;
  let onSelect;
  let observers;

  const enter = (...refs) => {
    const observer = observers.at(-1);
    observer.callback(refs.map(ref => ({ target: document.querySelector(`[data-ref="${ref}"]`), isIntersecting: true })));
  };
  const leave = (...refs) => observers.at(-1).callback(refs.map(ref => ({ target: document.querySelector(`[data-ref="${ref}"]`), isIntersecting: false })));
  const cells = count => Object.fromEntries(Array.from({ length: count }, (_, i) => [`0,${i}`, { shapes: [] }]));

  const flush = () => {
    enter(...[...document.querySelectorAll('.cell-thumb')].map(el => el.dataset.ref));
    vi.runAllTimers();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.documentElement.style.removeProperty('--checker-a');
    observers = [];
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); }
      observe() {}
      disconnect() {}
    });
    document.body.innerHTML = '<div id="cell-strip"></div>';
    nav = new CellNavigator();
    onSelect = vi.fn();
    nav.init({ onSelect });
    nav.setPalette({});
  });

  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('creates forty cheap shells and paints only visible cells, one per turn with active priority', () => {
    nav.setGrid(1, 40);
    nav.setCells(Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`0,${i}`, { shapes: [] }])));
    nav.setActive('0,2');
    const paint = vi.spyOn(nav, '_renderThumb');
    nav.render();
    expect(document.querySelectorAll('.cell-thumb')).toHaveLength(40);
    expect(paint).not.toHaveBeenCalled();
    expect(observers[0].options.root).toBe(document.getElementById('cell-strip'));
    enter('0,0', '0,1', '0,2');
    vi.runOnlyPendingTimers();
    expect(paint.mock.calls.map(call => call[1])).toEqual(['0,2']);
    vi.runAllTimers();
    expect(paint.mock.calls.map(call => call[1])).toEqual(['0,2', '0,0', '0,1']);
  });

  it('observes the actual scroll container around the strip', () => {
    document.body.innerHTML = '<div id="viewport" style="overflow-x:auto"><div id="cell-strip"></div></div>';
    nav.setGrid(1, 40); nav.setCells(cells(40)); nav.render();
    expect(observers.at(-1).options.root).toBe(document.getElementById('viewport'));
  });

  it('renders an initial unchanged filter and recreates shells removed by the host', () => {
    nav.setGrid(1, 2); nav.setCells(cells(2)); nav.setFilter(null);
    expect(document.querySelectorAll('.cell-thumb')).toHaveLength(2);
    document.getElementById('cell-strip').innerHTML = '';
    nav.refresh(['0,0']);
    expect(document.querySelectorAll('.cell-thumb')).toHaveLength(2);
  });

  it('reuses an unchanged strip and cached images when filters change back', () => {
    nav.setGrid(1, 3); nav.setCells(cells(3)); nav.render();
    const paint = vi.spyOn(nav, '_renderThumb');
    enter('0,0', '0,1'); vi.runAllTimers();
    const shells = [...document.querySelectorAll('.cell-thumb')];
    nav.setFilter(null); nav.render();
    expect(document.querySelector('.cell-thumb')).toBe(shells[0]);
    nav.setFilter(['0,2']); flush();
    nav.setFilter(['0,0', '0,1']); flush();
    const filtered = [...document.querySelectorAll('.cell-thumb')];
    nav.setFilter(['0,0', '0,1']);
    expect(document.querySelector('.cell-thumb')).toBe(filtered[0]);
    expect(paint.mock.calls.map(call => call[1])).toEqual(['0,0', '0,1', '0,2']);
  });

  it('invalidates changed refs only and leaves offscreen refreshes pending', () => {
    const data = cells(3);
    nav.setGrid(1, 3); nav.setCells(data); nav.render(); enter('0,0', '0,1'); vi.runAllTimers();
    const paint = vi.spyOn(nav, '_renderThumb');
    data['0,2'].name = 'updated';
    nav.refresh(new Set(['0,0', '0,2']));
    expect(paint).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(paint.mock.calls.map(call => call[1])).toEqual(['0,0']);
    expect(document.querySelector('[data-ref="0,2"] .label').textContent).toBe('updated');
    leave('0,1'); enter('0,1', '0,2'); vi.runAllTimers();
    expect(paint.mock.calls.map(call => call[1])).toEqual(['0,0', '0,2']);
  });

  for (const [name, same, change] of [
    ['palette', nav => nav.setPalette({}), nav => nav.setPalette({ ink: '#ff0000' })],
    ['background', nav => nav.setBackground({ mode: 'transparent' }), nav => nav.setBackground({ mode: 'chroma', color: '#ff0000' })],
    ['dimensions', nav => nav.setGrid(1, 1), nav => nav.setGrid(1, 1, 32, 16)],
    ['checker/theme', () => {}, () => document.documentElement.style.setProperty('--checker-a', '#123456')],
  ]) it(`reuses unchanged ${name} and invalidates changed ${name}`, () => {
    nav.setGrid(1, 1); nav.setCells(cells(1)); nav.render(); flush();
    const paint = vi.spyOn(nav, '_renderThumb');
    same(nav); nav.render(); flush();
    expect(paint).not.toHaveBeenCalled();
    change(nav); nav.render(); flush();
    expect(paint).toHaveBeenCalledTimes(1);
  });

  it('ignores callbacks and queued work from obsolete strips and uses the latest cells', () => {
    nav.setGrid(1, 3); nav.setCells(cells(3)); nav.render();
    const stale = observers.at(-1), target = document.querySelector('[data-ref="0,0"]');
    enter('0,0', '0,1');
    const paint = vi.spyOn(nav, '_renderThumb');
    nav.setFilter(['0,2']);
    stale.callback([{ target, isIntersecting: true }]);
    nav.setCells({ '0,2': { shapes: [{ type: 'point', params: { x: 0, y: 0 }, color: '#ff0000', zIndex: 0 }] } });
    enter('0,2'); vi.runAllTimers();
    expect(paint.mock.calls.map(call => call[1])).toEqual(['0,2']);
    expect([...document.querySelector('canvas').getContext('2d').getImageData(0, 0, 1, 1).data]).toEqual([255,0,0,255]);
  });

  it('does not rasterize unloaded cells and paints them once their data arrives', () => {
    nav.setGrid(1, 2); nav.render();
    const paint = vi.spyOn(nav, '_renderThumb');
    enter('0,0', '0,1'); vi.runAllTimers();
    expect(paint).not.toHaveBeenCalled();
    nav.setCells({ '0,1': { shapes: [] } }); nav.refresh(['0,1']); vi.runAllTimers();
    expect(paint.mock.calls.map(call => call[1])).toEqual(['0,1']);
  });

  for (const [limit, options] of [['entry', { cacheEntries: 2 }], ['byte', { cacheBytes: 2 * 64 * 64 * 4 }]]) {
    it(`evicts the least recently used bitmap at the ${limit} limit and releases it`, () => {
      nav = new CellNavigator(options); nav.setGrid(1, 3); nav.setCells(cells(3));
      const paint = vi.spyOn(nav, '_renderThumb');
      const show = ref => { nav.setFilter([ref]); flush(); };
      show('0,0'); const firstBitmap = paint.mock.calls[0][0];
      show('0,1'); show('0,0'); show('0,2'); show('0,0'); show('0,1');
      expect(paint.mock.calls.map(call => call[1])).toEqual(['0,0', '0,1', '0,2', '0,1']);
      nav.refresh(['0,0']);
      expect(firstBitmap.width * firstBitmap.height).toBe(0);
    });
  }

  it('releases offscreen display bitmaps and restores them from cache without rasterizing', () => {
    nav.setGrid(1, 1); nav.setCells(cells(1)); nav.render(); flush();
    const canvas = document.querySelector('canvas'), paint = vi.spyOn(nav, '_renderThumb');
    leave('0,0');
    expect(canvas.width * canvas.height).toBe(0);
    expect(canvas.style.width).toBe('64px');
    enter('0,0'); vi.runAllTimers();
    expect([canvas.width, canvas.height]).toEqual([64,64]);
    expect(paint).not.toHaveBeenCalled();
  });

  it('uses a bounded deterministic fallback including the active cell without layout APIs', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    nav.setGrid(1, 40); nav.setCells(cells(40)); nav.setActive('0,39');
    const paint = vi.spyOn(nav, '_renderThumb'); nav.render();
    expect(paint).not.toHaveBeenCalled(); vi.runAllTimers();
    expect(paint).toHaveBeenCalledTimes(8);
    expect(paint.mock.calls[0][1]).toBe('0,39');
    nav.setActive('0,38'); vi.runAllTimers();
    expect(paint.mock.calls.at(-1)[1]).toBe('0,38');
  });

  it('updates fallback visibility on scrolling without painting the whole strip', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const strip = document.getElementById('cell-strip');
    strip.getBoundingClientRect = () => ({ left: 0, right: 128, top: 0, bottom: 80, width: 128, height: 80 });
    let offset = 0;
    const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const col = Number(this.dataset.ref?.split(',')[1] || 0);
      return { left: col * 64 - offset, right: (col+1)*64 - offset, top: 0, bottom: 80, width: 64, height: 80 };
    });
    nav.setGrid(1,40); nav.setCells(cells(40));
    const paint = vi.spyOn(nav, '_renderThumb'); nav.render(); vi.runAllTimers();
    expect(paint.mock.calls.map(call => call[1])).toEqual(['0,0','0,1']);
    offset = 128; strip.dispatchEvent(new Event('scroll')); vi.runAllTimers();
    expect(paint.mock.calls.map(call => call[1])).toEqual(['0,0','0,1','0,2','0,3']);
    bounds.mockRestore();
  });

  it('renders one thumbnail per grid cell with the cell aspect ratio', () => {
    nav.setGrid(1, 2, 16, 32);
    nav.setCells({});
    nav.render();
    const canvases = document.querySelectorAll('.cell-thumb-canvas');
    expect(canvases).toHaveLength(2);
    expect(canvases[0].width).toBe(32);
    expect(canvases[0].height).toBe(64);
    expect(canvases[0].style.width).toBe('32px');
    expect(canvases[0].style.height).toBe('64px');
  });
  it('fits wide and square cells inside the same thumbnail budget without stretching', () => {
    for (const [w, h, expected] of [[32,16,[64,32]], [16,16,[64,64]], [128,64,[64,32]]]) {
      nav.setGrid(1,1,w,h); nav.render();
      const canvas = document.querySelector('.cell-thumb-canvas');
      expect([canvas.width,canvas.height]).toEqual(expected);
      expect(canvas.style.width).toBe(`${expected[0]}px`);
      expect(canvas.style.height).toBe(`${expected[1]}px`);
    }
  });

  it('paints shape pixels into the thumbnail', () => {
    nav.setGrid(1, 1, 16, 16);
    nav.setCells({ '0,0': { shapes: [{ type: 'rect', params: { x: 0, y: 0, w: 4, h: 4, filled: true }, color: '#00ff00', zIndex: 0 }] } });
    nav.render();
    flush();
    const ctx = document.querySelector('.cell-thumb-canvas').getContext('2d');
    const d = ctx.getImageData(1, 1, 1, 1).data; // inside the 4px rect at scale 3
    expect([d[0], d[1], d[2]]).toEqual([0, 255, 0]);
  });
  it('keeps bottom-edge pixels when reducing an odd-width portrait', () => {
    nav.setGrid(1,1,3,128);
    nav.setCells({ '0,0': { shapes: [{ type: 'point', params: { x: 1, y: 127 }, color: '#ff0000', zIndex: 0 }] } });
    nav.render();
    flush();
    const canvas = document.querySelector('.cell-thumb-canvas');
    const data = canvas.getContext('2d').getImageData(0,canvas.height-1,canvas.width,1).data;
    expect([...data].some((value,index) => index % 4 === 0 && value > 0)).toBe(true);
  });

  it('renders polygons in thumbnails', () => {
    nav.setGrid(1, 1, 16, 16);
    nav.setCells({ '0,0': { shapes: [{ type: 'polygon', params: { points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 0, y: 8 }], filled: true }, color: '#ff0000', zIndex: 0 }] } });
    nav.render();
    flush();
    const ctx = document.querySelector('.cell-thumb-canvas').getContext('2d');
    const d = ctx.getImageData(2 * 3, 2 * 3, 1, 1).data; // interior pixel (2,2), scale 3
    expect(d[0]).toBe(255);
  });

  it('clicking a thumbnail selects that cell', () => {
    nav.setGrid(1, 2, 16, 16);
    nav.setCells({});
    nav.render();
    const thumbs = document.querySelectorAll('.cell-thumb');
    thumbs[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith('0,1');
  });

  it('filters thumbnails to a group', () => {
    nav.setGrid(2, 2, 16, 16);
    nav.setCells({});
    nav.setFilter(['0,0', '1,1']);
    const refs = [...document.querySelectorAll('.cell-thumb')].map(el => el.dataset.ref);
    expect(refs).toEqual(['0,0', '1,1']);
  });
});
