import { describe, it, expect } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { handleDraw } from '../../server/handlers/draw.js';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';
import { mapCommandToApi } from '../../scripts/batch-commands.js';
import { loadImage, createCanvas } from 'canvas';

const mk = () => ({ project: Project.create({ name: 't', cellSize: 16, rows: 1, cols: 1, palette: 'pico8' }), broadcast: () => {} });
async function rgba(png) {
  const img = await loadImage(png), c = createCanvas(img.width, img.height), ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, img.width, img.height).data;
  return (x, y) => [...d.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];
}

describe('erase shapes', () => {
  it('punch transparency through every shape below them, like a Pac mouth wedge', async () => {
    const s = mk();
    handleDraw(s, 'rect', { cell: '0,0', x: 0, y: 0, w: 16, h: 16, color: '#1d2b53', shape_name: 'wall' });
    handleDraw(s, 'circle', { cell: '0,0', cx: 8, cy: 8, r: 6, color: '#ffec27', shape_name: 'pac' });
    const res = handleDraw(s, 'polygon', { cell: '0,0', points: '8,8 15,3 15,13', erase: true, shape_name: 'mouth' });
    const shape = s.project.cells.getCell('0,0').shapes.get(res.shapeName);
    expect(shape.params.erase).toBe(true);
    const px = await rgba(new CanvasRenderer(s.project.palette).renderSheet(s.project.cells, { gap: 0 }));
    expect(px(13, 8)[3]).toBe(0);         // inside the wedge: both wall and pac erased
    expect(px(4, 8)).toEqual([255, 236, 39, 255]); // pac outside the wedge
    expect(px(0, 0)).toEqual([29, 43, 83, 255]);   // wall outside the wedge
  });

  it('shapes above an erase shape paint over the hole, and hiding the eraser restores it', async () => {
    const s = mk();
    handleDraw(s, 'rect', { cell: '0,0', x: 0, y: 0, w: 16, h: 16, color: '#1d2b53', shape_name: 'wall' });
    handleDraw(s, 'rect', { cell: '0,0', x: 4, y: 4, w: 8, h: 8, erase: true, shape_name: 'hole' });
    handleDraw(s, 'point', { cell: '0,0', x: 6, y: 6, color: '#ff004d', shape_name: 'dot' });
    let px = await rgba(new CanvasRenderer(s.project.palette).renderSheet(s.project.cells, { gap: 0 }));
    expect(px(5, 5)[3]).toBe(0);
    expect(px(6, 6)).toEqual([255, 0, 77, 255]);
    s.project.cells.getCell('0,0').shapes.get('hole').visible = false;
    px = await rgba(new CanvasRenderer(s.project.palette).renderSheet(s.project.cells, { gap: 0 }));
    expect(px(5, 5)).toEqual([29, 43, 83, 255]);
  });

  it('a chroma background shows through erased pixels instead of being erased', async () => {
    const s = mk();
    handleDraw(s, 'rect', { cell: '0,0', x: 0, y: 0, w: 16, h: 16, color: '#1d2b53', shape_name: 'wall' });
    handleDraw(s, 'circle', { cell: '0,0', cx: 8, cy: 8, r: 3, erase: true, shape_name: 'hole' });
    const px = await rgba(new CanvasRenderer(s.project.palette, { background: { mode: 'chroma', color: '#00ff00' } }).renderSheet(s.project.cells, { gap: 0 }));
    expect(px(8, 8)).toEqual([0, 255, 0, 255]);
  });

  it('validates the flag and carries it through batch operations', () => {
    const s = mk();
    expect(() => handleDraw(s, 'rect', { cell: '0,0', x: 0, y: 0, w: 4, h: 4, erase: 'yes' })).toThrow(/erase must be true or false/);
    expect(() => handleDraw(s, 'fill', { cell: '0,0', x: 0, y: 0, erase: true })).toThrow(/erase applies to point, line, rect, circle, ellipse, polygon and polyline/);
    expect(() => handleDraw(s, 'rect', { cell: '0,0', x: 0, y: 0, w: 4, h: 4, erase: true, pattern: 'checker', color2: '#ffffff' })).toThrow(/erase shapes cannot use a pattern/);
    expect(() => handleDraw(s, 'rect', { cell: '0,0', x: 0, y: 0, w: 4, h: 4 })).toThrow(/color is required/);
    expect(mapCommandToApi({ command: 'draw', type: 'rect', cell: '0,0', x: 0, y: 0, w: 2, h: 2, erase: true }).body.erase).toBe(true);
  });
});
