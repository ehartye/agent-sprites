import { describe, it, expect, vi } from 'vitest';
vi.mock('canvas', async importOriginal => {
  const real = await importOriginal();
  return { ...real, createCanvas: vi.fn(real.createCanvas) };
});
import { createCanvas } from 'canvas';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';

describe('retained layer allocation validation', () => {
  it.each(['renderCellRaw', 'renderCell', 'renderCells', 'renderStack'])('%s rejects malformed layers before allocating any surface', method => {
    const cell = { width: 8, height: 8, shapes: { listByZ: () => [{ type: 'point', params: { x: 0, y: 0, layers: [{ id: 'bad' }] }, visible: true, color: '#fff' }] } };
    const renderer = new CanvasRenderer({ resolve: c => c });
    createCanvas.mockClear();
    expect(() => renderer[method](method.endsWith('s') || method === 'renderStack' ? [cell] : cell)).toThrow(/layer/i);
    expect(createCanvas).not.toHaveBeenCalled();
  });
});
