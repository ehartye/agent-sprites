import { describe, it, expect } from 'vitest';
import { Cell } from '../../server/engine/cell.js';
import { Palette } from '../../server/engine/palette.js';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';
import { readAsciiRegion, patchAsciiRegion } from '../../server/engine/ascii-region.js';
import { execFileSync } from 'node:child_process';

const palette = new Palette([{ name: 'red', color: '#ff0000' }, { name: 'blue', color: '#0000ff' }]);
const colors = { R: 'red', B: 'blue' };
const renderer = new CanvasRenderer(palette);
const read = (cell, opts = {}) => readAsciiRegion(cell, palette, { x: 0, y: 0, w: 4, h: 3, colors, ...opts });
const patch = (cell, rows, opts = {}) => patchAsciiRegion(cell, palette, { x: 0, y: 0, rows, colors, prefix: 'detail', ...opts });

describe('ASCII region editing', () => {
  it('never replaces imported shape IDs when the saved sequence contains gaps', () => {
    // A fresh process reproduces reopening a saved project independently of test order.
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { Cell } from './server/engine/cell.js';
      import { Palette } from './server/engine/palette.js';
      import { patchAsciiRegion } from './server/engine/ascii-region.js';
      const shapes = ['s3','s4'].map((id, i) => ({ id, name: 'original-' + i, type: 'point', params: {x:i,y:0}, color:'#ff0000',zIndex:i,visible:true }));
      const cell = Cell.fromJSON({ shapes }, 4), before = cell.toJSON();
      patchAsciiRegion(cell,new Palette(),{x:0,y:1,rows:['B'],colors:{B:'#0000ff'}});
      const count = cell.shapes.listByZ().length;
      cell.undo(); console.log(JSON.stringify({count,before,after:cell.toJSON()}));
    `], { encoding: 'utf8', windowsHide: true });
    const result = JSON.parse(output);
    expect(result.count).toBe(3);
    expect(result.after).toEqual(result.before);
  });

  it('reports partially transparent palette colors as unmapped in automatic readback', () => {
    const cell = new Cell(4);
    const alphaPalette = new Palette([{ name: 'half-red', color: '#ff000080' }]);
    cell.draw('point', { x: 0, y: 0 }, 'half-red', 'glass');
    const result = readAsciiRegion(cell, alphaPalette, { x: 0, y: 0, w: 1, h: 1 });
    expect(result.rows).toEqual(['?']);
    expect(result.colors).toEqual({});
    expect(result.unmapped).toEqual([{ x: 0, y: 0, rgba: '#ff000080' }]);
  });

  it('reads canonical rendered pixels, transparency and unmapped colors without tracing references', () => {
    const cell = new Cell({ w: 4, h: 3 });
    cell.draw('rect', { x: 0, y: 0, w: 2, h: 1, filled: true }, 'red', 'body');
    cell.draw('point', { x: 2, y: 1 }, '#00ff00', 'accent');
    cell.reference = { path: 'absent-reference.png', opacity: 1 };
    const result = read(cell);
    expect(result.rows).toEqual(['RR__', '__?_', '____']);
    expect(result.colors).toEqual({ R: '#ff0000', B: '#0000ff' });
    expect(result.unmapped).toEqual([{ x: 2, y: 1, rgba: '#00ff00ff' }]);
  });

  it('patches colors/keep/erase as one reversible edit without altering underlying named shapes', () => {
    const cell = new Cell({ w: 4, h: 3 });
    cell.draw('rect', { x: 0, y: 0, w: 4, h: 3, filled: true }, 'red', 'body');
    const before = cell.toJSON();
    const result = patch(cell, ['.B_', 'R..'], { x: 1, y: 1 });
    expect(result.changed).toBe(3);
    expect(read(cell).rows).toEqual(['RRRR', 'RRB_', 'RRRR']);
    expect(cell.shapes.get('body').toJSON()).toEqual(before.shapes[0]);
    const after = cell.toJSON();
    cell.undo(); expect(cell.toJSON()).toEqual(before);
    cell.redo(); expect(cell.toJSON()).toEqual(after);
    cell.clear(); cell.undo(); cell.undo(); expect(cell.toJSON()).toEqual(before);
    cell.redo(); expect(cell.toJSON()).toEqual(after);
  });

  it('revises the same owned pixel shapes with stable IDs and exact rendered results', () => {
    const cell = new Cell(4);
    patch(cell, ['RB']);
    const first = cell.toJSON();
    const ids = first.shapes.map(s => s.id);
    patch(cell, ['B_']);
    expect(cell.shapes.listByZ().map(s => s.id)).toEqual(ids);
    expect(read(cell, { h: 1 }).rows).toEqual(['B___']);
    cell.undo(); expect(cell.toJSON()).toEqual(first);
    const restored = Cell.fromJSON(cell.toJSON(), 4);
    patch(restored, ['BR']);
    expect(restored.shapes.listByZ().map(s => s.id)).toEqual(ids);
    expect([...renderer.renderCellRaw(restored).slice(0, 8)]).toEqual([0, 0, 255, 255, 255, 0, 0, 255]);
  });

  it('patches above explicit high z-order and preserves chroma backgrounds when erasing artwork', () => {
    const cell = new Cell(4);
    cell.draw('rect', { x: 0, y: 0, w: 4, h: 4, filled: true }, 'red', 'body');
    cell.setZ('body', 1000);
    patch(cell, ['B_']);
    expect(read(cell, { w: 2, h: 1 }).rows).toEqual(['B_']);
    expect(read(cell, { w: 2, h: 1, background: { mode: 'chroma', color: '#ff0000' } }).rows).toEqual(['BR']);
  });

  it('never confuses an owned ID with the name of an unrelated shape', () => {
    const cell = new Cell(4);
    patch(cell, ['R']);
    const owned = cell.shapes.getByName('detail:0,0');
    const unrelated = cell.draw('rect', { x: 2, y: 2, w: 2, h: 2, filled: true }, '#00ff00', owned.id);
    const before = unrelated.toJSON();
    patch(cell, ['B']);
    expect(unrelated.toJSON()).toEqual(before);
    expect(owned.color).toBe('#0000ff');
    expect(read(cell).rows).toEqual(['B___', '____', '__??']);
  });

  it('rejects invalid characters, dimensions, colors and ownership collisions before any mutation', () => {
    const cell = new Cell(4);
    cell.draw('point', { x: 0, y: 0 }, 'red', 'detail:0,0');
    const before = cell.toJSON();
    for (const [rows, opts, error] of [
      [['.?'], {}, /character/], [['R', 'RR'], {}, /rectangular/], [['R'], { x: -1 }, /bounds/],
      [['RR'], { x: 3 }, /bounds/], [['R'], { x: 0.5 }, /integer/],
      [['R'], { colors: { R: 'typo' } }, /color/], [['R'], {}, /owned/],
      [['.'], { colors: { '.': '#ff0000' } }, /reserved/],
    ]) {
      expect(() => patch(cell, rows, opts)).toThrow(error);
      expect(cell.toJSON()).toEqual(before);
    }
    expect(() => read(new Cell(100), { w: 100, h: 100 })).toThrow(/4096/);
  });

  it('does not add undo history for an all-keep patch and can undo patches over the normal history limit', () => {
    const cell = new Cell(16);
    expect(patch(cell, ['....']).changed).toBe(0);
    expect(cell.undo()).toBe(false);
    patch(cell, Array(16).fill('R'.repeat(16)));
    expect(cell.shapes.listByZ()).toHaveLength(256);
    cell.undo(); expect(cell.shapes.listByZ()).toHaveLength(0);
    cell.redo(); expect(cell.shapes.listByZ()).toHaveLength(256);
  });

  it('rolls back a failed compound edit without consuming the existing redo history', () => {
    const cell = new Cell(4);
    cell.draw('point', { x: 1, y: 1 }, 'red', 'body');
    cell.undo();
    const before = cell.toJSON();
    expect(() => cell.transaction(() => {
      cell.draw('point', { x: 0, y: 0 }, 'blue', 'detail');
      throw new Error('rejected edit');
    })).toThrow('rejected edit');
    expect(cell.toJSON()).toEqual(before);
    expect(cell.redo()).toBe(true);
    expect(cell.shapes.get('body').color).toBe('red');
  });
});
