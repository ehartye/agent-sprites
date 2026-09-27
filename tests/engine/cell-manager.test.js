import { describe, it, expect } from 'vitest';
import { CellManager } from '../../server/engine/cell-manager.js';

describe('CellManager', () => {
  it('creates a grid of cells', () => {
    const cm = new CellManager(16, 3, 4);
    expect(cm.rows).toBe(3);
    expect(cm.cols).toBe(4);
    expect(cm.cellWidth).toBe(16);
    expect(cm.cellHeight).toBe(16);
  });

  it('gets a cell by row,col', () => {
    const cm = new CellManager(16, 3, 4);
    const cell = cm.getCell('1,2');
    expect(cell).toBeDefined();
    expect(cell.width).toBe(16);
    expect(cell.height).toBe(16);
  });

  it('throws on out-of-bounds', () => {
    const cm = new CellManager(16, 3, 4);
    expect(() => cm.getCell('5,0')).toThrow('out of bounds');
  });

  it('resolves cell by name', () => {
    const cm = new CellManager(16, 2, 2);
    const cell = cm.getCell('0,0');
    cell.name = 'idle_1';
    expect(cm.getCell('idle_1')).toBe(cell);
  });

  it('copies a cell', () => {
    const cm = new CellManager(16, 2, 2);
    const src = cm.getCell('0,0');
    src.draw('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red', 'box');
    cm.copyCell('0,0', '0,1');
    const dst = cm.getCell('0,1');
    expect(dst.shapes.listByZ().length).toBe(1);
    expect(dst.shapes.listByZ()[0].type).toBe('rect');
  });

  it('draws on top of cloned shapes, not beneath them', () => {
    const cm = new CellManager(16, 2, 2);
    const src = cm.getCell('0,0');
    src.draw('rect', { x: 0, y: 0, w: 16, h: 16, filled: true }, 'red');
    src.draw('rect', { x: 4, y: 4, w: 8, h: 8, filled: true }, 'blue');
    cm.copyCell('0,0', '0,1');
    const dst = cm.getCell('0,1');
    const added = dst.draw('rect', { x: 6, y: 6, w: 4, h: 4, filled: true }, 'green');
    const maxCloned = Math.max(...dst.shapes.listByZ().filter(s => s !== added).map(s => s.zIndex));
    expect(added.zIndex).toBeGreaterThan(maxCloned);
  });

  it('shifts cell contents', () => {
    const cm = new CellManager(16, 2, 2);
    const cell = cm.getCell('0,0');
    cell.draw('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red');
    cm.shiftCell('0,0', 2, 3);
    expect(cell.shapes.listByZ()[0].params.x).toBe(2);
    expect(cell.shapes.listByZ()[0].params.y).toBe(3);
  });

  it('mirrors a cell horizontally', () => {
    const cm = new CellManager(16, 2, 2);
    const cell = cm.getCell('0,0');
    cell.draw('point', { x: 2, y: 5 }, 'red');
    cm.mirrorCell('0,0', 'horizontal');
    expect(cell.shapes.listByZ()[0].params.x).toBe(13); // 16 - 1 - 2
  });

  it('lists all cells with coordinates', () => {
    const cm = new CellManager(16, 2, 2);
    const list = cm.listCells();
    expect(list.length).toBe(4);
    expect(list[0].coord).toBe('0,0');
  });

  it('does not impose row, column, cell-count, or pixel-budget policy caps', () => {
    expect(new CellManager({w:8,h:12},22,24).listCells()).toHaveLength(528);
    expect(()=>new CellManager(512,10,10)).not.toThrow();
    expect(()=>new CellManager(256,11,5)).not.toThrow();
    expect(()=>new CellManager(8,65,2)).not.toThrow();
    expect(()=>new CellManager(8,33,32)).not.toThrow();
  });
  it('rejects invalid or arithmetically unrepresentable dimensions before allocation',()=>{
    for(const [size,rows,cols] of [[8,0,1],[8,1.5,1],[8,NaN,1],[8,Infinity,1],[8,Number.MAX_SAFE_INTEGER,2],[Number.MAX_SAFE_INTEGER,2,1],[0,1,1],[{w:8,h:-1},1,1]])expect(()=>new CellManager(size,rows,cols)).toThrow(/integer|represent/);
  });

  it('serializes and deserializes', () => {
    const cm = new CellManager(16, 2, 2);
    cm.getCell('0,0').draw('rect', { x: 0, y: 0, w: 5, h: 5, filled: true }, 'red', 'box');
    cm.getCell('0,0').name = 'idle';
    const json = cm.toJSON();
    const restored = CellManager.fromJSON(json, 16);
    expect(restored.rows).toBe(2);
    expect(restored.getCell('idle').shapes.getByName('box')).toBeDefined();
  });
});
