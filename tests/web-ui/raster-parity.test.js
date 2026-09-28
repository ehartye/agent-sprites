// @vitest-environment jsdom
// Every browser view must paint the pixels the export paints.
import { describe, it, expect, beforeEach } from 'vitest';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';
import { CellNavigator } from '../../server/web/public/js/cell-nav.js';
import { AnimationPreview } from '../../server/web/public/js/animation.js';
import { CanvasEditor } from '../../server/web/public/js/canvas-editor.js';
import { CORPUS, CELL } from './raster-corpus.js';

const exportPixels = shapes => {
  const cell = { width: CELL, height: CELL, shapes: { listByZ: () => [...shapes].sort((a, b) => a.zIndex - b.zIndex) } };
  return [...new CanvasRenderer({ resolve: c => c }).renderCellRaw(cell)];
};
// Read one sample per cell pixel: the centre of each scale×scale block, offset by (ox, oy).
const sample = (canvas, scale, ox = 0, oy = 0) => {
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, out = [];
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    const i = ((oy + y * scale + (scale >> 1)) * canvas.width + ox + x * scale + (scale >> 1)) * 4;
    out.push(data[i], data[i + 1], data[i + 2], data[i + 3]);
  }
  return out;
};
// Report the first differing pixels, not a 1600-element array diff.
const differences = (got, want) => {
  const bad = [];
  for (let i = 0; i < want.length && bad.length < 5; i += 4) {
    if ([0, 1, 2, 3].some(k => Math.abs(got[i + k] - want[i + k]) > 1)) bad.push(`(${(i / 4) % CELL},${Math.floor(i / 4 / CELL)}) got ${got.slice(i, i + 4)} want ${want.slice(i, i + 4)}`);
  }
  return bad;
};

beforeEach(() => {
  // Transparent checkerboards, so empty pixels read [0,0,0,0] like the export.
  document.documentElement.style.setProperty('--checker-a', 'rgba(0,0,0,0)');
  document.documentElement.style.setProperty('--checker-b', 'rgba(0,0,0,0)');
});

describe('thumbnails match the export', () => {
  for (const entry of CORPUS) it(entry.name, () => {
    document.body.innerHTML = '<div id="cell-strip"></div>';
    const nav = new CellNavigator();
    nav.init({ onSelect() {} }); nav.setPalette({});
    nav.setGrid(1, 1, CELL, CELL); nav.setCells({ '0,0': { shapes: entry.shapes } }); nav.render();
    const canvas = document.querySelector('.cell-thumb-canvas');
    expect(differences(sample(canvas, canvas.width / CELL), exportPixels(entry.shapes))).toEqual([]);
  });
});

describe('animation preview matches the export', () => {
  for (const entry of CORPUS) it(entry.name, () => {
    document.body.innerHTML = '<div id="anim-panel"></div>';
    const ap = new AnimationPreview({ mountId: 'anim-panel', size: CELL * 4 }); ap.init();
    ap.setCellSize(CELL, CELL); ap.setPalette({}); ap.setCells({ '0,0': { shapes: entry.shapes } }); ap.setFrames(['0,0']);
    const canvas = document.querySelector('.anim-canvas');
    expect(differences(sample(canvas, canvas.width / CELL), exportPixels(entry.shapes))).toEqual([]);
  });
});

describe('editor matches the export', () => {
  // The editor draws twice (dimmed overhang, then clipped), so translucent colours
  // double-blend by design; fills show as a seed marker, not a flood.
  for (const entry of CORPUS.filter(e => e.opaque && !e.shapes.some(s => s.type === 'fill'))) it(entry.name, () => {
    document.body.innerHTML = '<div id="wrap"><canvas id="editor-canvas"></canvas></div>';
    const editor = new CanvasEditor();
    const wrap = document.getElementById('wrap');
    wrap.getBoundingClientRect = () => ({ width: 40, height: 40, left: 0, top: 0 });
    editor.init(wrap, CELL, CELL);
    editor.canvas.width = 40; editor.canvas.height = 40;
    editor.setZoom(1); editor.setPalette({}); editor.setCell({ shapes: entry.shapes });
    const ox = Math.floor((40 - CELL) / 2), oy = ox;
    expect(differences(sample(editor.canvas, 1, ox, oy), exportPixels(entry.shapes))).toEqual([]);
  });
});

describe('editor overlays use the shared rules', () => {
  const editorAt1 = () => {
    document.body.innerHTML = '<div id="wrap"><canvas id="editor-canvas"></canvas></div>';
    const editor = new CanvasEditor(), wrap = document.getElementById('wrap');
    wrap.getBoundingClientRect = () => ({ width: 40, height: 40, left: 0, top: 0 });
    editor.init(wrap, CELL, CELL);
    editor.canvas.width = 40; editor.canvas.height = 40;
    editor.setZoom(1); editor.setPalette({}); editor.setCell({ shapes: [] });
    return editor;
  };
  const at = (editor, x, y) => [...editor.canvas.getContext('2d').getImageData(10 + x, 10 + y, 1, 1).data];

  it('draws a dragged patterned rect with its pattern at the new position', () => {
    const editor = editorAt1();
    editor.setDragPreview({ type: 'rect', params: { x: 0, y: 0, w: 4, h: 4, filled: true, pattern: 'checker', color2: '#00ff00' }, color: '#ff0000' }, 1, 0);
    // Checker paints color2 where (x + y) is even, at the moved coordinates.
    expect(at(editor, 2, 0)[1]).toBeGreaterThan(0);
    expect(at(editor, 2, 0)[0]).toBe(0);
    expect(at(editor, 1, 0)[0]).toBeGreaterThan(0);
    expect(at(editor, 1, 0)[1]).toBe(0);
  });

  it('draws onion-skin outline circles in the tint only', () => {
    const editor = editorAt1();
    editor.setOnionSkin({ prev: [{ type: 'circle', params: { cx: 10, cy: 10, r: 5, filled: false }, color: '#000000', zIndex: 0 }], next: [] });
    expect(at(editor, 15, 10)[2]).toBeGreaterThan(0); // blue tint on the outline
    expect(at(editor, 10, 10)[3]).toBe(0);            // hollow centre
  });
});
