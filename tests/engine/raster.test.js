import { describe, it, expect } from 'vitest';
import { rasterShape, snapParams, floodFill, fillPattern } from '../../server/web/public/js/shared/raster.js';

// A pen that records every call, in order.
const record = (type, params) => {
  const calls = [];
  rasterShape(type, params, { px: (x, y, second) => calls.push(['px', x, y, second]), rect: (x, y, w, h) => calls.push(['rect', x, y, w, h]) });
  return calls;
};

describe('rasterShape pen calls', () => {
  it('draws a filled rect as one block and an outline as four edges', () => {
    expect(record('rect', { x: 1, y: 2, w: 3, h: 4, filled: true })).toEqual([['rect', 1, 2, 3, 4]]);
    expect(record('rect', { x: 1, y: 2, w: 3, h: 4, filled: false })).toEqual([['rect', 1, 2, 3, 1], ['rect', 1, 5, 3, 1], ['rect', 1, 2, 1, 4], ['rect', 3, 2, 1, 4]]);
  });
  it('draws a patterned filled rect per pixel, marking the second-colour pixels', () => {
    const calls = record('rect', { x: 0, y: 0, w: 2, h: 2, filled: true, pattern: 'checker', color2: '#fff' });
    expect(calls).toEqual([['px', 0, 0, true], ['px', 1, 0, false], ['px', 0, 1, false], ['px', 1, 1, true]]);
  });
  it('never patterns outlines, and draws unknown patterns solid', () => {
    expect(record('circle', { cx: 5, cy: 5, r: 3, filled: false, pattern: 'checker', color2: '#fff' }).some(c => c[3])).toBe(false);
    expect(record('rect', { x: 0, y: 0, w: 2, h: 2, filled: true, pattern: 'plaid', color2: '#fff' })).toEqual([['rect', 0, 0, 2, 2]]);
    expect(fillPattern({ pattern: 'checker', filled: true })).toBeNull(); // no color2
  });
  it('keeps the outline circle duplicates the export has always drawn', () => {
    const calls = record('circle', { cx: 5, cy: 5, r: 1, filled: false });
    expect(calls).toHaveLength(8); // one midpoint step, eight octants, with repeats
    expect(new Set(calls.map(c => `${c[1]},${c[2]}`)).size).toBe(4);
  });
  it('draws nothing for a flood fill or an unknown type', () => {
    expect(record('fill', { x: 1, y: 1 })).toEqual([]);
    expect(record('spline', { x: 1, y: 1 })).toEqual([]);
  });
  it('rounds line endpoints so fractional lines terminate', () => {
    expect(record('line', { x1: 0.4, y1: 0, x2: 2.6, y2: 0 })).toEqual([['px', 0, 0, false], ['px', 1, 0, false], ['px', 2, 0, false], ['px', 3, 0, false]]);
  });
});

describe('snapParams', () => {
  it('rounds numbers and polygon points and keeps everything else', () => {
    expect(snapParams({ cx: 1.6, r: 2.4, filled: true, pattern: 'checker', points: [{ x: 0.5, y: 1.49 }] }))
      .toEqual({ cx: 2, r: 2, filled: true, pattern: 'checker', points: [{ x: 1, y: 1 }] });
  });
});

describe('floodFill', () => {
  const image = (w, h, painted) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (const [x, y] of painted) data.set([0, 0, 0, 255], (y * w + x) * 4);
    return { data, width: w, height: h };
  };
  it('fills the 4-connected region and stops at a border', () => {
    // A vertical wall at x=2 splits a 5×3 image.
    const img = image(5, 3, [[2, 0], [2, 1], [2, 2]]);
    expect(floodFill(img, 0, 0, [9, 8, 7, 255])).toBe(true);
    const at = (x, y) => [...img.data.slice((y * 5 + x) * 4, (y * 5 + x) * 4 + 4)];
    expect(at(1, 2)).toEqual([9, 8, 7, 255]);
    expect(at(2, 1)).toEqual([0, 0, 0, 255]);
    expect(at(3, 0)).toEqual([0, 0, 0, 0]);
  });
  it('reports no change when the region already has the colour', () => {
    expect(floodFill(image(2, 2, []), 0, 0, [0, 0, 0, 0])).toBe(false);
  });
});
