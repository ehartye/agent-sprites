// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCanvas } from 'canvas';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';
import { renderCellNative } from '../../server/web/public/js/cell-raster.js';
import * as nativeRaster from '../../server/web/public/js/cell-raster.js';
import { CanvasEditor } from '../../server/web/public/js/canvas-editor.js';
import { CellNavigator } from '../../server/web/public/js/cell-nav.js';
import { AnimationPreview } from '../../server/web/public/js/animation.js';
import { renderSurfaceCell, validateSurfaceScene } from '../../server/web/public/js/shared/surface-raster.js';
import { CORPUS, CELL } from './raster-corpus.js';
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
const palette = { red: '#f00', green: '#0f0', white: '#fff' }, resolve = c => palette[c] ?? c;
const pixel = canvas => [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data];
const layer = { id: 'child', x: 2, y: 1, w: 5, h: 4, z: 2, background: { mode: 'chroma', color: '#4488ff' } };
const fixture = () => ({ width: 8, height: 8, lighting: { palettePolicy: 'rgb', ambient: 0.2, cell: 1, sky: 0.3 }, shapes: [
  { type: 'rect', params: { x: 0, y: 0, w: 8, h: 8, filled: true, surface: { normal: { mode: 'bevel' }, material: { solid: true } } }, color: 'red', zIndex: 0 },
  { type: 'rect', params: { x: 1, y: 0, w: 4, h: 5, filled: false, surface: { normal: { mode: 'dome' } } }, color: '#ff00ff80', zIndex: 1 },
  { type: 'fill', params: { x: 2, y: 1, layers: [layer], surface: { normal: { mode: 'grid', x: 2, y: 1, rows: ['78945','asdzx','12345','sssss'] }, material: { wall: true } } }, color: 'green', zIndex: 2 },
  { type: 'rect', params: { x: 3, y: 1, w: 4, h: 4, filled: true, pattern: 'checker', color2: 'white', layers: [layer], surface: { normal: { mode: 'luma' }, lamps: [{ name: 'sun', x: 4, y: 1, radius: 12, power: 0.8 }] } }, color: 'red', zIndex: 3 },
  { type: 'point', params: { x: 4, y: 2, erase: true, layers: [layer] }, color: '#fff', zIndex: 4 },
  { type: 'point', params: { x: 0, y: 0, surface: { lamps: [{ name: 'sun', x: 0, y: 0 }] } }, color: '#fff', visible: false, zIndex: 5 },
] });
const engineCell = cell => ({ ...cell, shapes: { listByZ: () => cell.shapes } });

describe('shared retained surface raster', () => {
  it('keeps the canonical native color corpus unchanged when surface features are unused', () => {
    for (const entry of CORPUS) {
      const want = new CanvasRenderer({ resolve: c => c }).renderCellRaw({ width: CELL, height: CELL, shapes: { listByZ: () => entry.shapes } });
      const got = pixel(renderCellNative(entry.shapes, CELL, CELL, c => c));
      expect(got.every((value, i) => Math.abs(value - want[i]) <= (entry.opaque ? 0 : 1))).toBe(true);
    }
  });
  it.each(['color', 'normal', 'light'])('matches Node bytes for %s across nested patterns, fill, outline, erasure and lighting', channel => {
    const cell = fixture(), want = new CanvasRenderer({ resolve }).renderCellRaw(engineCell(cell), { channel });
    expect(pixel(renderCellNative(cell.shapes, 8, 8, resolve, { lighting: cell.lighting, palette, channel }))).toEqual([...want]);
  });
  it('retains exact raw Node/browser channels for transparent partial-alpha art', () => {
    const cell = { width: 8, height: 8, lighting: { palettePolicy: 'rgb', ambient: 0.5 }, shapes: [
      { type: 'rect', params: { x: 1, y: 1, w: 4, h: 3, filled: false, surface: { normal: { mode: 'flat', vector: [1, 0, 1] }, material: { solid: true } } }, color: '#ff000080' },
      { type: 'point', params: { x: 2, y: 1, erase: true }, color: '#ffffff80' },
    ] };
    const want = new CanvasRenderer({ resolve }).renderCellChannels(engineCell(cell));
    const got = nativeRaster.renderCellNativeChannels(cell.shapes, 8, 8, resolve, { lighting: cell.lighting, palette });
    for (const channel of ['color', 'normal', 'light', 'materials']) expect([...got[channel]]).toEqual([...want[channel]]);
  });
  it('uses opaque palette colors in the native nearest channel', () => {
    const shapes = [{ type: 'point', params: { x: 0, y: 0 }, color: '#f00' }];
    const canvas = renderCellNative(shapes, 1, 1, resolve, { lighting: { palettePolicy: 'nearest', ambient: 0.5 }, palette: { alpha: '#f008', red: '#f00f', black: '#000000ff' } });
    expect(pixel(canvas)).toEqual([255, 0, 0, 255]);
  });
  it('rejects unknown native channels', () => expect(() => renderCellNative([], 1, 1, resolve, { channel: 'height' })).toThrow(/channel/i));
  it('rejects pixel, lamp, normal and isolated layer work before calling the canvas factory', () => {
    const base = { width: 8, height: 8, shapes: [], resolveColor: resolve, drawShape() {} };
    const failures = [
      { width: 2049, height: 2048 },
      { shapes: Array.from({ length: 65 }, (_, i) => ({ type: 'point', params: { x: 0, y: 0, surface: { lamps: [{ name: `lamp-${i}`, x: 0, y: 0 }] } }, color: '#fff' })) },
      { width: 2048, height: 2048, shapes: [{ type: 'point', params: { x: 0, y: 0, surface: { normal: { mode: 'bevel' } } } }, { type: 'point', params: { x: 0, y: 0, surface: { normal: { mode: 'dome' } } } }] },
      { width: 2048, height: 2048, shapes: [{ type: 'point', params: { x: 0, y: 0, layers: [ { ...layer, w: 2048, h: 2048 } ], erase: true, surface: {} } }] },
      { lighting: { palettePolicy: 'nearest' }, palette: ['#fff0'] },
      { width: 1000, height: 1000, lighting: { palettePolicy: 'nearest' }, palette: Array(65).fill('#fff') },
    ];
    for (const more of failures) {
      let called = false;
      expect(() => renderSurfaceCell({ ...base, ...more, createCanvas(w, h) { called = true; return createCanvas(w, h); } })).toThrow();
      expect(called).toBe(false);
    }
    expect(validateSurfaceScene({ ...base, lighting: { palettePolicy: 'rgb' } }).rasterWork).toBeGreaterThan(0);
  });
  it('rejects offscreen primitive work before allocation or primitive painting', () => {
    for (const shape of [
      { type: 'line', params: { x1: 0, y1: 0, x2: 70_000_000, y2: 0, surface: {} } },
      { type: 'rect', params: { x: -50_000, y: 0, w: 10_000, h: 10_000, filled: true, pattern: 'checker', color2: '#fff', surface: {} } },
      { type: 'circle', params: { cx: -50_000, cy: 0, r: 10_000, filled: true, surface: {} } },
      { type: 'ellipse', params: { cx: -50_000, cy: 0, rx: 10_000, ry: 10_000, filled: true, surface: {} } },
      { type: 'polygon', params: { points: [{ x: 0, y: 0 }, { x: 10_000, y: 0 }, { x: 10_000, y: 10_000 }], filled: true, surface: {} } },
    ]) {
      let allocations = 0, paints = 0;
      expect(() => renderSurfaceCell({ shapes: [shape], width: 8, height: 8, createCanvas(w, h) { allocations++; return createCanvas(w, h); }, drawShape() { paints++; } })).toThrow(/work|budget/i);
      expect([allocations, paints]).toEqual([0, 0]);
    }
  });
  it('keeps the tracing image visible below lit art on a chroma editor', () => {
    document.body.innerHTML = '<div id="wrap"><canvas id="editor-canvas"></canvas></div>';
    const editor = new CanvasEditor(), wrap = document.getElementById('wrap'); wrap.getBoundingClientRect = () => ({ width: 8, height: 8 });
    editor.init(wrap, 8, 8); editor.canvas.width = editor.canvas.height = 8; editor.setZoom(1);
    editor.setBackground({ mode: 'chroma', color: '#00ff00' });
    editor.setCell({ lighting: { palettePolicy: 'rgb', ambient: 0 }, shapes: [{ type: 'point', params: { x: 1, y: 1 }, color: '#ff0000' }] });
    const reference = document.createElement('canvas'); reference.width = reference.height = 8;
    const ctx = reference.getContext('2d'); ctx.fillStyle = '#0000ff'; ctx.fillRect(0, 0, 8, 8);
    editor._refImage = reference; editor._refOpacity = 1; editor.render();
    expect([...editor.ctx.getImageData(0, 0, 1, 1).data]).toEqual([0, 0, 255, 255]);
    expect([...editor.ctx.getImageData(1, 1, 1, 1).data]).toEqual([0, 0, 0, 255]);
  });
  it('passes actual lighting and chroma background through editor, thumbnail and animation', () => {
    vi.useFakeTimers();
    document.documentElement.style.setProperty('--checker-a', 'transparent'); document.documentElement.style.setProperty('--checker-b', 'transparent');
    document.body.innerHTML = '<div id="wrap"><canvas id="editor-canvas"></canvas></div><div id="cell-strip"></div><div id="anim-panel"></div>';
    const cell = fixture(), background = { mode: 'chroma', color: '#ff00ff' };
    const expected = [...new CanvasRenderer({ resolve }, { background }).renderCellRaw(engineCell(cell))];
    const editor = new CanvasEditor(), wrap = document.getElementById('wrap'); wrap.getBoundingClientRect = () => ({ width: 8, height: 8 });
    editor.init(wrap, 8, 8); editor.canvas.width = editor.canvas.height = 8; editor.setZoom(1); editor.setPalette(palette); editor.setBackground(background); editor.setCell(cell);
    expect(pixel(editor.canvas)).toEqual(expected);
    const nav = new CellNavigator(); nav.init({ onSelect() {} }); nav.setPalette(palette); nav.setBackground(background); nav.setGrid(1, 1, 8, 8); nav.setCells({ '0,0': cell }); nav.render();
    vi.runAllTimers();
    const ap = new AnimationPreview({ size: 8 }); ap.init(); ap.setCellSize(8, 8); ap.setPalette(palette); ap.setBackground(background); ap.setCells({ '0,0': cell }); ap.setFrames(['0,0']);
    const thumb = document.querySelector('.cell-thumb-canvas'), ctx = thumb.getContext('2d');
    const sampled = []; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) sampled.push(...ctx.getImageData(x * 8 + 4, y * 8 + 4, 1, 1).data);
    expect(sampled).toEqual(expected); expect(pixel(document.querySelector('.anim-canvas'))).toEqual(expected);
  });
});
