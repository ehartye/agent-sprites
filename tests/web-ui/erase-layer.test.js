// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { paintShapes } from '../../server/web/public/js/erase-layer.js';
import { CellNavigator } from '../../server/web/public/js/cell-nav.js';

it('browser previews erase shapes without erasing the checkerboard, clip or earlier layers', () => {
  const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 8;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 8, 8); // stands in for the checkerboard
  const shapes = [{ params: { x: 0, y: 0, w: 8, h: 8 }, color: '#ff0000' }, { params: { x: 2, y: 2, w: 4, h: 4, erase: true }, color: '#000000' }];
  paintShapes(ctx, shapes, (c, s) => { c.fillStyle = s.color; c.fillRect(s.params.x, s.params.y, s.params.w, s.params.h); });
  const at = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
  expect(at(0, 0)).toEqual([255, 0, 0, 255]);
  expect(at(3, 3)).toEqual([128, 128, 128, 255]);
  expect(ctx.globalCompositeOperation).toBe('source-over');
});

it('without erase shapes it paints directly on the target context', () => {
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'), seen = [];
  paintShapes(ctx, [{ params: {} }, { params: {} }], c => seen.push(c));
  expect(seen).toEqual([ctx, ctx]);
});

it('cell thumbnails show the checkerboard through an erase shape', () => {
  document.body.innerHTML = '<div id="cell-strip"></div>';
  const nav = new CellNavigator();
  nav.init({ onSelect: () => {} }); nav.setPalette({}); nav.setGrid(1, 1, 16, 16);
  nav.setCells({ '0,0': { shapes: [
    { type: 'rect', params: { x: 0, y: 0, w: 16, h: 16, filled: true }, color: '#00ff00', zIndex: 0 },
    { type: 'rect', params: { x: 4, y: 4, w: 8, h: 8, filled: true, erase: true }, color: '#000000', zIndex: 1 },
  ] } });
  nav.render();
  const canvas = document.querySelector('.cell-thumb-canvas'), ctx = canvas.getContext('2d'), k = canvas.width / 16;
  const at = (x, y) => [...ctx.getImageData(Math.floor((x + 0.5) * k), Math.floor((y + 0.5) * k), 1, 1).data];
  expect(at(1, 1)).toEqual([0, 255, 0, 255]);
  expect(at(8, 8).slice(0, 3)).not.toEqual([0, 255, 0]);
  expect(at(8, 8)[3]).toBe(255);
});
