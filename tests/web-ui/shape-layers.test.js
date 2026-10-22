// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Cell } from '../../server/engine/cell.js';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';
import { renderCellNative } from '../../server/web/public/js/cell-raster.js';
import { CanvasEditor } from '../../server/web/public/js/canvas-editor.js';
import { CellNavigator } from '../../server/web/public/js/cell-nav.js';
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

const layer = (id, extra = {}) => ({ id, x: 2, y: 1, w: 3, h: 3, z: 1, background: { mode: 'transparent' }, ...extra });
const resolve = c => ({ red: '#ff0000', green: '#00ff00' })[c] ?? c;

describe('browser isolated layer parity', () => {
  const fixture = () => {
    const cell = new Cell(8), layers = [layer('a'), layer('b', { x: 3, y: 0, w: 4 })];
    cell.draw('rect', { x: 0, y: 0, w: 8, h: 8, filled: true }, '#0000ff');
    cell.draw('fill', { x: 3, y: 1, layers }, 'red');
    cell.draw('rect', { x: 3, y: 1, w: 3, h: 3, filled: true, pattern: 'checker', color2: 'green', layers }, 'red');
    cell.draw('point', { x: 4, y: 2, erase: true, layers }, '#ffffff');
    return cell;
  };
  it('matches native Node RGBA for actual nested fills, palette patterns and erasers', () => {
    const cell = fixture(), want = new CanvasRenderer({ resolve }).renderCellRaw(cell);
    const browser = renderCellNative(cell.shapes.listByZ(), 8, 8, resolve);
    expect([...browser.getContext('2d').getImageData(0, 0, 8, 8).data]).toEqual([...want]);
  });
  it('shows the same isolated child pixels in the editable canvas', () => {
    document.documentElement.style.setProperty('--checker-a', 'rgba(0,0,0,0)');
    document.documentElement.style.setProperty('--checker-b', 'rgba(0,0,0,0)');
    document.body.innerHTML = '<div id="wrap"><canvas id="editor-canvas"></canvas></div>';
    const cell = fixture(), editor = new CanvasEditor(), wrap = document.getElementById('wrap');
    wrap.getBoundingClientRect = () => ({ width: 8, height: 8, left: 0, top: 0 });
    editor.init(wrap, 8, 8); editor.canvas.width = editor.canvas.height = 8;
    editor.setZoom(1); editor.setPalette({ red: '#ff0000', green: '#00ff00' }); editor.setCell(cell.toJSON());
    expect([...editor.ctx.getImageData(0, 0, 8, 8).data]).toEqual([...new CanvasRenderer({ resolve }).renderCellRaw(cell)]);
  });
  it('retains source backgrounds carried by invisible markers in editor and thumbnails', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="wrap"><canvas id="editor-canvas"></canvas></div><div id="cell-strip"></div>';
    const cell = new Cell(8);
    cell.draw('point', { x: 2, y: 1, layers: [layer('empty', { background: { mode: 'chroma', color: '#ff0000' } })] }, '#fff', 'marker', { visible: false });
    const editor = new CanvasEditor(), wrap = document.getElementById('wrap');
    wrap.getBoundingClientRect = () => ({ width: 8, height: 8, left: 0, top: 0 });
    editor.init(wrap, 8, 8); editor.canvas.width = editor.canvas.height = 8; editor.setZoom(1); editor.setCell(cell.toJSON());
    expect([...editor.ctx.getImageData(2, 1, 1, 1).data]).toEqual([255, 0, 0, 255]);
    const nav = new CellNavigator(); nav.init({ onSelect() {} }); nav.setGrid(1, 1, 8, 8); nav.setCells({ '0,0': cell.toJSON() }); nav.render();
    vi.runAllTimers();
    const thumb = document.querySelector('.cell-thumb-canvas'), scale = thumb.width / 8;
    expect([...thumb.getContext('2d').getImageData(Math.floor(2.5 * scale), Math.floor(1.5 * scale), 1, 1).data]).toEqual([255, 0, 0, 255]);
  });
  it('preserves source-over alpha exactly in the editable canvas', () => {
    document.documentElement.style.setProperty('--checker-a', 'rgba(0,0,0,0)');
    document.documentElement.style.setProperty('--checker-b', 'rgba(0,0,0,0)');
    document.body.innerHTML = '<div id="wrap"><canvas id="editor-canvas"></canvas></div>';
    const cell = new Cell(8); cell.draw('point', { x: 2, y: 1, layers: [layer('alpha')] }, '#ff000080');
    const editor = new CanvasEditor(), wrap = document.getElementById('wrap');
    wrap.getBoundingClientRect = () => ({ width: 8, height: 8, left: 0, top: 0 });
    editor.init(wrap, 8, 8); editor.canvas.width = editor.canvas.height = 8; editor.setZoom(1); editor.setCell(cell.toJSON());
    expect([...editor.ctx.getImageData(2, 1, 1, 1).data]).toEqual([255, 0, 0, 128]);
  });
});
