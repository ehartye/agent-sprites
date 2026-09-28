import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { handleDraw } from '../../server/handlers/draw.js';
import { handleNameCell } from '../../server/handlers/cell.js';
import { handleViewStack } from '../../server/handlers/view.js';
import { loadImage, createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';
import os from 'os';

let state, dir;
beforeEach(() => {
  state = { project: Project.create({ name: 'night', cellSize: 8, rows: 1, cols: 3, palette: 'pico8' }), broadcast: () => {} };
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sprites-stack-'));
  handleDraw(state, 'rect', { cell: '0,0', x: 0, y: 0, w: 8, h: 8, color: '#1d2b53', shape_name: 'sky' });
  handleDraw(state, 'point', { cell: '0,1', x: 2, y: 2, color: '#ffec27', shape_name: 'star' });
  handleDraw(state, 'rect', { cell: '0,2', x: 0, y: 5, w: 8, h: 3, color: '#008751', shape_name: 'land' });
  handleDraw(state, 'rect', { cell: '0,2', x: 0, y: 0, w: 8, h: 2, erase: true, shape_name: 'unused' });
  for (const [cell, name] of [['0,0', 'sky'], ['0,1', 'swirl_0'], ['0,2', 'land']]) handleNameCell(state, { cell, name });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

async function read(p) {
  const img = await loadImage(p), c = createCanvas(img.width, img.height), ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return { w: img.width, at: (x, y) => [...ctx.getImageData(x, y, 1, 1).data] };
}

describe('view --stack', () => {
  it('composites named or coordinate cells bottom to top, erasers staying within their own layer', async () => {
    const out = path.join(dir, 'stack.png');
    const res = handleViewStack(state, { cells: ['sky', '0,1', 'land'], out }, dir);
    expect(res).toEqual({ path: out, layers: ['0,0', '0,1', '0,2'] });
    const px = await read(out);
    expect(px.w).toBe(8);
    expect(px.at(2, 2)).toEqual([255, 236, 39, 255]); // star over sky
    expect(px.at(0, 0)).toEqual([29, 43, 83, 255]);   // land's eraser did not cut the sky
    expect(px.at(0, 6)).toEqual([0, 135, 81, 255]);   // land on top
  });

  it('order matters and scale upsamples', async () => {
    const out = path.join(dir, 's.png');
    handleViewStack(state, { cells: ['swirl_0', 'sky'], scale: 3, out }, dir);
    const px = await read(out);
    expect(px.w).toBe(24);
    expect(px.at(7, 7)).toEqual([29, 43, 83, 255]); // the star is hidden under the sky
  });

  it('rejects unknown names and empty stacks', () => {
    expect(() => handleViewStack(state, { cells: ['sky', 'moon'] }, dir)).toThrow(/Cell "moon" not found/);
    expect(() => handleViewStack(state, { cells: [] }, dir)).toThrow(/at least one cell/);
  });
});

import { parseStack } from '../../server/handlers/view.js';
it('parses comma or space lists and keeps R,C pairs together', () => {
  expect(parseStack('sky,swirl_0,land')).toEqual(['sky', 'swirl_0', 'land']);
  expect(parseStack('sky,0,1,land')).toEqual(['sky', '0,1', 'land']);
  expect(parseStack('sky 0,1  land')).toEqual(['sky', '0,1', 'land']);
});
