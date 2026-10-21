import { describe, it, expect } from 'vitest';
import { createCanvas, Image } from 'canvas';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';
import { Cell } from '../../server/engine/cell.js';
import { Palette } from '../../server/engine/palette.js';
import sharp from 'sharp';

const renderer = () => new CanvasRenderer({ resolve: c => c });
const at = (data, x, y, width = 8, stride = 4) => [...data.slice((y * width + x) * stride, (y * width + x + 1) * stride)];
const layer = (id, more = {}) => ({ id, x: 2, y: 1, w: 3, h: 3, z: 1, background: { mode: 'transparent' }, ...more });
const decode = buffer => { const image = new Image(); image.src = buffer; const canvas = createCanvas(image.width, image.height); canvas.getContext('2d').drawImage(image, 0, 0); return { width: image.width, height: image.height, data: canvas.getContext('2d').getImageData(0, 0, image.width, image.height).data }; };

describe('retained surface channels', () => {
  it('preserves partial-alpha RGB when a no-op flood only changes auxiliary metadata', () => {
    const cell = new Cell(3), r = renderer();
    const point = cell.draw('point', { x: 1, y: 1 }, '#c8282880');
    cell.draw('fill', { x: 0, y: 0 }, '#00000000');
    const canonical = r.renderCellRaw(cell);
    cell.setShapeSurface(point, {});
    expect([...r.renderCellRaw(cell)]).toEqual([...canonical]);
  });
  it.each([[0,3],[-1,1],[3,0]])('preserves canonical out-of-bounds flood color behavior (%s,%s)', (x,y) => {
    const cell = new Cell(3), r = renderer();
    const point = cell.draw('point', { x: 1, y: 1 }, '#c8282880');
    cell.draw('fill', { x, y }, '#ff0000');
    const canonical = r.renderCellRaw(cell);
    cell.setShapeSurface(point, {});
    expect([...r.renderCellRaw(cell)]).toEqual([...canonical]);
  });
  it.each(['#00ff00', '#00ff0080', '#00000000'])('preserves canonical flood replacement for legacy erase fills (%s)', color => {
    for (const layers of [undefined, [layer('legacy-fill')]]) {
      const cell = new Cell(8), r = renderer();
      const rect = cell.draw('rect', { x: 0, y: 0, w: 8, h: 8, filled: true, ...(layers ? { layers } : {}) }, '#ff0000');
      cell.draw('fill', { x: 2, y: 1, erase: true, ...(layers ? { layers } : {}) }, color);
      const canonical = r.renderCellRaw(cell);
      expect([...r.renderCellChannels(cell).color]).toEqual([...canonical]);
      cell.setShapeSurface(rect, { normal: { mode: 'flat', vector: [1,0,1] }, material: { solid: true } });
      const channels = r.renderCellChannels(cell);
      expect([...channels.color]).toEqual([...canonical]);
      const alpha = canonical[(1 * 8 + 2) * 4 + 3];
      expect(at(channels.normal, 2, 1)).toEqual(alpha ? [128,128,255,alpha] : [0,0,0,0]);
      expect(at(channels.materials, 2, 1, 8, 3)).toEqual([0,0,0]);
    }
  });
  it('uses the current connected fill region even when repainting the same color', () => {
    const cell = new Cell(8);
    cell.draw('rect', { x: 0, y: 0, w: 4, h: 4, filled: true }, '#ff0000');
    cell.draw('fill', { x: 1, y: 1, surface: { normal: { mode: 'flat', vector: [1, 0, 1] }, material: { solid: true } } }, '#ff0000');
    const channels = renderer().renderCellChannels(cell);
    expect(at(channels.normal, 2, 2)).toEqual([218, 128, 218, 255]);
    expect(at(channels.materials, 2, 2, 8, 3)).toEqual([255, 0, 0]);
    expect(at(channels.normal, 5, 5)).toEqual([0, 0, 0, 0]);
  });
  it('flat overpaint resets earlier material and normal metadata while hidden lamps stay disabled', () => {
    const cell = new Cell(8);
    cell.draw('rect', { x: 0, y: 0, w: 4, h: 4, filled: true, surface: { normal: { mode: 'flat', vector: [1, 0, 1] }, material: { unlit: true }, lamps: [{ name: 'lamp', x: 0, y: 0 }] } }, '#ff0000');
    cell.draw('point', { x: 1, y: 1 }, '#0000ff');
    cell.draw('point', { x: 3, y: 3, surface: { lamps: [{ name: 'lamp', x: 1, y: 1 }] } }, '#fff', 'hidden', { visible: false });
    const channels = renderer().renderCellChannels(cell);
    expect(at(channels.normal, 1, 1)).toEqual([128, 128, 255, 255]);
    expect(at(channels.materials, 1, 1, 8, 3)).toEqual([0, 0, 0]);
    expect(channels.lamps).toHaveLength(1);
  });
  it('isolates child erasers from neighbors and source chroma backgrounds', () => {
    const cell = new Cell(8), layers = [layer('child', { background: { mode: 'chroma', color: '#00ff00' } })];
    cell.draw('rect', { x: 0, y: 0, w: 8, h: 8, filled: true }, '#0000ff');
    cell.draw('fill', { x: 2, y: 1, layers, surface: { normal: { mode: 'grid', x: 2, y: 1, rows: ['999','999','999'] }, material: { wall: true } } }, '#ff0000');
    cell.draw('point', { x: 3, y: 2, layers, erase: true }, '#fff');
    const channels = renderer().renderCellChannels(cell);
    expect(at(channels.color, 3, 2)).toEqual([0, 255, 0, 255]);
    expect(at(channels.normal, 3, 2)).toEqual([128, 128, 255, 255]);
    expect(at(channels.materials, 3, 2, 8, 3)).toEqual([0, 0, 0]);
    expect(at(channels.color, 1, 1)).toEqual([0, 0, 255, 255]);
    expect(at(channels.normal, 2, 1)).toEqual([201, 201, 201, 255]);
  });
  it('retains exact partial alpha and uses ordinary art for its color plane', () => {
    const cell = new Cell(8);
    cell.draw('point', { x: 1, y: 1, surface: { normal: { mode: 'flat' }, material: { unlit: true } } }, '#ff000080');
    const channels = renderer().renderCellChannels(cell);
    expect(at(channels.color, 1, 1)).toEqual([255, 0, 0, 128]);
    expect(at(channels.normal, 1, 1)).toEqual([128, 128, 255, 128]);
  });
  it('honors cell lighting in raw, scaled, cells, sheet and stacked PNG outputs', () => {
    const cell = new Cell(8);
    cell.draw('rect', { x: 0, y: 0, w: 8, h: 8, filled: true }, '#ff0000');
    cell.lighting = { palettePolicy: 'rgb', ambient: 0.5 };
    const r = renderer();
    expect(at(r.renderCellRaw(cell), 0, 0)).toEqual([128, 0, 0, 255]);
    for (const buffer of [r.renderCell(cell, { scale: 2 }), r.renderCells([cell]), r.renderSheet({ rows: 1, cols: 1, getCell: () => cell }), r.renderStack([cell])]) expect(at(decode(buffer).data, 0, 0)).toEqual([128, 0, 0, 255]);
    expect(at(r.renderCellRaw(cell, { channel: 'normal' }), 0, 0)).toEqual([128, 128, 255, 255]);
    expect(at(decode(r.renderCells([cell], { channel: 'light' })).data, 0, 0)).toEqual([128, 128, 128, 255]);
  });
  it('filters translucent palette entries and accepts opaque alpha hex for nearest lighting', () => {
    const cell = new Cell(8); cell.draw('point', { x: 0, y: 0 }, '#ff0000'); cell.lighting = { palettePolicy: 'nearest', ambient: 0.5 };
    const r = new CanvasRenderer(new Palette([{ name: 'transparent', color: '#f008' }, { name: 'red', color: '#f00f' }, { name: 'black', color: '#000000ff' }]));
    expect(at(r.renderCellRaw(cell), 0, 0)).toEqual([255, 0, 0, 255]);
    expect(() => renderer().renderCellRaw(cell)).toThrow(/opaque palette/i);
  });
  it('keeps the unused PNG path byte-identical to canonical primitive paint', () => {
    const cell = new Cell(8); cell.draw('rect', { x: 0, y: 0, w: 4, h: 4, filled: false }, '#c8282880');
    const r = renderer(), canvas = createCanvas(8, 8); r._drawShapes(canvas.getContext('2d'), cell.shapes.listByZ(), 8, 8);
    expect(r.renderCell(cell)).toEqual(canvas.toBuffer('image/png'));
    expect([...r.renderCellChannels(cell).color]).toEqual([...r.renderCellRaw(cell)]);
  });
  it('keeps lit chroma views identical to export when withReference has no tracing image', () => {
    const cell = new Cell(8); cell.lighting = { palettePolicy: 'rgb', ambient: 0.25 };
    cell.draw('point', { x: 1, y: 1 }, '#fff');
    const r = new CanvasRenderer({ resolve: c => c }, { background: { mode: 'chroma', color: '#ff00ff' } });
    for (const channel of ['color', 'normal', 'light']) expect([...r.renderCellRaw(cell, { channel, withReference: true })]).toEqual([...r.renderCellRaw(cell, { channel })]);
  });
  it('encodes partial-alpha normal PNGs exactly through scale, sheet and stack', async () => {
    const cell = new Cell(8); cell.draw('point', { x: 1, y: 1, surface: { normal: { mode: 'flat', vector: [1, 0, 1] } } }, '#ff000080');
    const r = renderer();
    const cases = [
      [r.renderCell(cell, { channel: 'normal' }), 8, 8, 1, 1],
      [r.renderCell(cell, { channel: 'normal', scale: 2 }), 16, 16, 2, 2],
      [r.renderCells([cell, cell], { channel: 'normal', gap: 1 }), 17, 8, 10, 1],
      [r.renderSheet({ rows: 1, cols: 1, getCell: () => cell }, { channel: 'normal' }), 8, 8, 1, 1],
      [r.renderStack([cell], { channel: 'normal' }), 8, 8, 1, 1],
    ];
    for (const [buffer, width, height, x, y] of cases) {
      const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect([info.width, info.height]).toEqual([width, height]);
      expect(at(data, x, y, width)).toEqual([218, 128, 218, 128]);
    }
    expect(() => r.renderCell(cell, { channel: 'normal', scale: 1.5 })).toThrow(/integer/i);
  });
  it('rejects unknown channels in every output path', () => {
    const cell = new Cell(8), r = renderer(), opts = { channel: 'height' };
    for (const run of [() => r.renderCellRaw(cell, opts), () => r.renderCell(cell, opts), () => r.renderCells([cell], opts), () => r.renderStack([cell], opts), () => r.renderSheet({ rows: 1, cols: 1, getCell: () => cell }, opts)]) expect(run).toThrow(/channel/i);
  });
});
