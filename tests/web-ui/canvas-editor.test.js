// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { CanvasEditor } from '../../server/web/public/js/canvas-editor.js';

function makeEditor({ cellW = 16, cellH = 16, width = 320, height = 320, zoom = 4 } = {}) {
  document.body.innerHTML = '<div id="wrap"><canvas id="editor-canvas"></canvas></div>';
  const container = document.getElementById('wrap');
  Object.defineProperty(container, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(container, 'clientHeight', { value: height, configurable: true });
  const ed = new CanvasEditor();
  ed.init(container, cellW, cellH);
  ed.setPalette({});
  ed.setZoom(zoom);
  return ed;
}

function pixelAt(ed, x, y) {
  const d = ed.ctx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

describe('CanvasEditor (browser)', () => {
  it('does not restore a hidden reference when its earlier image request finishes', () => {
    const ed = makeEditor();
    const ImageClass = window.Image;
    const images = [];
    window.Image = class { constructor() { images.push(this); } };
    try {
      ed.setReference({ opacity: 0.35 }, '0,0');
      ed.setReference(null, '0,0');
      images[0].onload();
      expect(ed._refImage).toBeNull();
    } finally { window.Image = ImageClass; ed.destroy(); }
  });
  // NOTE: probes target the CENTER of each zoomed grid cell (+2 at zoom 4) —
  // under jsdom the theme CSS vars are empty, so grid lines paint black over
  // the 1px boundaries between cells.
  it('renders a point shape at the zoomed grid position', () => {
    const ed = makeEditor();
    ed.setCell({ shapes: [{ type: 'point', params: { x: 2, y: 3 }, color: '#ff0000', zIndex: 0 }] });
    // gridW = 16*4 = 64; ox = (320-64)/2 = 128; oy = 128
    expect(pixelAt(ed, 128 + 2 * 4 + 2, 128 + 3 * 4 + 2)).toEqual([255, 0, 0, 255]);
    // one grid cell to the left is not red
    expect(pixelAt(ed, 128 + 1 * 4 + 2, 128 + 3 * 4 + 2)[0]).not.toBe(255);
  });

  it('fills polygon interiors', () => {
    const ed = makeEditor();
    ed.setCell({ shapes: [{ type: 'polygon', params: { points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 0, y: 8 }], filled: true }, color: '#00ff00', zIndex: 0 }] });
    // interior pixel (2,2)
    expect(pixelAt(ed, 128 + 2 * 4 + 2, 128 + 2 * 4 + 2)).toEqual([0, 255, 0, 255]);
    // outside the hypotenuse (7,7) stays unfilled
    expect(pixelAt(ed, 128 + 7 * 4 + 2, 128 + 7 * 4 + 2)[1]).not.toBe(255);
  });

  it('maps client coordinates to pixel coordinates with per-axis bounds', () => {
    const ed = makeEditor({ cellW: 8, cellH: 16 });
    // gridW = 8*4 = 32 -> ox = 144; gridH = 16*4 = 64 -> oy = 128
    const at = (px, py) => ed._canvasToPixel(144 + px * 4 + 1, 128 + py * 4 + 1);
    expect(at(0, 0)).toMatchObject({ x: 0, y: 0, inBounds: true });
    expect(at(7, 15)).toMatchObject({ x: 7, y: 15, inBounds: true });
    expect(at(8, 0).inBounds).toBe(false);  // past width
    expect(at(0, 16).inBounds).toBe(false); // past height
    expect(at(7, 8).inBounds).toBe(true);   // tall cell: y 8..15 valid
  });

  it('re-centers and re-renders when the cell size changes', () => {
    const ed = makeEditor();
    ed.setCell({ shapes: [{ type: 'point', params: { x: 0, y: 0 }, color: '#ff0000', zIndex: 0 }] });
    ed.setCellSize(8, 16);
    // gridW = 32 -> ox = 144; gridH = 64 -> oy = 128
    expect(pixelAt(ed, 144 + 2, 128 + 2)).toEqual([255, 0, 0, 255]);
  });

  it('setBackground repaints with the chroma color across a non-square grid', () => {
    const ed = makeEditor({ cellW: 8, cellH: 16 });
    ed.setBackground({ mode: 'chroma', color: '#0000ff' });
    // gridW = 32, gridH = 64; ox = 144, oy = 128; probe mid-cell points
    expect(pixelAt(ed, 144 + 6, 128 + 2)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(ed, 144 + 30, 128 + 62)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(ed, 144 + 40, 128 + 2)[2]).not.toBe(255); // right of grid
  });

  it('ignores hidden shapes', () => {
    const ed = makeEditor();
    ed.setCell({ shapes: [{ type: 'point', params: { x: 2, y: 3 }, color: '#ff0000', zIndex: 0, visible: false }] });
    expect(pixelAt(ed, 128 + 2 * 4, 128 + 3 * 4)[0]).not.toBe(255);
  });
});
