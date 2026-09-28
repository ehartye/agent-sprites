// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createRedrawScheduler } from '../../server/web/public/js/redraw-scheduler.js';
import { CellNavigator } from '../../server/web/public/js/cell-nav.js';

describe('createRedrawScheduler', () => {
  it('turns a burst of edits into one flush with every touched cell', () => {
    const frames = [], flush = vi.fn();
    const redraw = createRedrawScheduler(flush, cb => frames.push(cb));
    for (let i = 0; i < 1000; i++) redraw.mark(i % 3 === 0 ? '0,0' : '0,1');
    expect(frames).toHaveLength(1);
    expect(flush).not.toHaveBeenCalled();
    frames[0]();
    expect(flush).toHaveBeenCalledTimes(1);
    expect([...flush.mock.calls[0][0]].sort()).toEqual(['0,0', '0,1']);
  });
  it('schedules a new flush for edits after the previous one ran', () => {
    const frames = [], flush = vi.fn();
    const redraw = createRedrawScheduler(flush, cb => frames.push(cb));
    redraw.mark('0,0'); frames[0]();
    redraw.mark('0,1'); expect(frames).toHaveLength(2); frames[1]();
    expect([...flush.mock.calls[1][0]]).toEqual(['0,1']);
  });
});

describe('CellNavigator.refresh', () => {
  const point = (x, color) => ({ type: 'point', params: { x, y: 0 }, color, zIndex: 0, visible: true });
  it('repaints only the named thumbnails, in place', () => {
    document.body.innerHTML = '<div id="cell-strip"></div>';
    const nav = new CellNavigator();
    nav.init({ onSelect() {} }); nav.setPalette({}); nav.setGrid(1, 3, 16, 16);
    nav.setCells({}); nav.render();
    const before = [...document.querySelectorAll('.cell-thumb-canvas')];
    const paint = vi.spyOn(nav, '_renderThumb');
    nav.setCells({ '0,1': { name: 'walk', shapes: [point(0, '#ff0000')] } });
    nav.refresh(new Set(['0,1']));
    expect(paint).toHaveBeenCalledTimes(1);
    const after = [...document.querySelectorAll('.cell-thumb-canvas')];
    expect(after).toEqual(before); // same elements, nothing rebuilt
    expect(after[1].getContext('2d').getImageData(1, 1, 1, 1).data[0]).toBe(255);
    expect(document.querySelectorAll('.cell-thumb .label')[1].textContent).toBe('walk');
  });
  it('clears a thumbnail whose shapes were removed', () => {
    document.body.innerHTML = '<div id="cell-strip"></div>';
    document.documentElement.style.setProperty('--checker-a', 'rgba(0,0,0,0)');
    document.documentElement.style.setProperty('--checker-b', 'rgba(0,0,0,0)');
    const nav = new CellNavigator();
    nav.init({ onSelect() {} }); nav.setPalette({}); nav.setGrid(1, 1, 16, 16);
    nav.setCells({ '0,0': { shapes: [point(0, '#ff0000')] } }); nav.render();
    nav.setCells({ '0,0': { shapes: [] } }); nav.refresh(new Set(['0,0']));
    expect(document.querySelector('.cell-thumb-canvas').getContext('2d').getImageData(1, 1, 1, 1).data[3]).toBe(0);
  });
  it('falls back to a full render when the strip is empty', () => {
    document.body.innerHTML = '<div id="cell-strip"></div>';
    const nav = new CellNavigator();
    nav.init({ onSelect() {} }); nav.setPalette({}); nav.setGrid(1, 2, 16, 16); nav.setCells({});
    nav.refresh(new Set(['0,0']));
    expect(document.querySelectorAll('.cell-thumb')).toHaveLength(2);
  });
});
