import { describe, it, expect, beforeEach } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { handleDraw } from '../../server/handlers/draw.js';
import { handleListShapes } from '../../server/handlers/shape.js';

describe('Highlight/Shadow draw commands', () => {
  let state;

  beforeEach(() => {
    state = {
      project: Project.create({ name: 'test', cellSize: 16, rows: 2, cols: 2, palette: 'pico8' }),
      broadcast: () => {},
    };
    // Draw a circle to use as the target shape
    handleDraw(state, 'circle', {
      cell: '0,0', cx: 8, cy: 8, r: 5, color: '#ff004d', shape_name: 'ball',
    });
  });

  it('draws highlight points with lighter color', () => {
    const result = handleDraw(state, 'highlight', {
      cell: '0,0', shape: 'ball', direction: 'top-left', shape_name: 'ball_hl',
    });
    expect(result.shapeNames).toBeDefined();
    expect(result.shapeNames.length).toBeGreaterThanOrEqual(2);
    expect(result.shapeNames[0]).toBe('ball_hl_0');

    // Check all highlight shapes exist and have the lighter color
    const shapes = handleListShapes(state, { cell: '0,0' });
    const hlShapes = shapes.filter(s => s.name?.startsWith('ball_hl_'));
    expect(hlShapes.length).toBeGreaterThanOrEqual(2);
    // #ff004d (red) → lighter → #ff77a8 (pink)
    for (const s of hlShapes) {
      expect(s.color).toBe('#ff77a8');
      expect(s.type).toBe('point');
    }
  });

  it('draws shadow points with darker color', () => {
    const result = handleDraw(state, 'shadow', {
      cell: '0,0', shape: 'ball', direction: 'bottom-right', shape_name: 'ball_sh',
    });
    expect(result.shapeNames).toBeDefined();
    expect(result.shapeNames.length).toBeGreaterThanOrEqual(2);
    // #ff004d (red) → darker → #7e2553 (dark-purple)
    const shapes = handleListShapes(state, { cell: '0,0' });
    const shShapes = shapes.filter(s => s.name?.startsWith('ball_sh_'));
    for (const s of shShapes) {
      expect(s.color).toBe('#7e2553');
    }
  });

  it('defaults highlight direction to top-left', () => {
    const result = handleDraw(state, 'highlight', {
      cell: '0,0', shape: 'ball', shape_name: 'ball_hl',
    });
    expect(result.shapeNames.length).toBeGreaterThanOrEqual(2);
  });

  it('defaults shadow direction to bottom-right', () => {
    const result = handleDraw(state, 'shadow', {
      cell: '0,0', shape: 'ball', shape_name: 'ball_sh',
    });
    expect(result.shapeNames.length).toBeGreaterThanOrEqual(2);
  });

  it('strength 2 double-steps the ramp', () => {
    const result = handleDraw(state, 'highlight', {
      cell: '0,0', shape: 'ball', direction: 'top-left', shape_name: 'ball_hl2', strength: 2,
    });
    const shapes = handleListShapes(state, { cell: '0,0' });
    const hlShapes = shapes.filter(s => s.name?.startsWith('ball_hl2_'));
    // #ff004d (red) → lighter(2) → light-peach (#ffccaa)
    for (const s of hlShapes) {
      expect(s.color).toBe('#ffccaa');
    }
  });

  it('pixel count scales linearly with radius', () => {
    // count = max(2, round(r * 0.4)) — larger radii get proportionally more pixels
    // beforeEach() drew a r=5 ball. Add a r=16 big ball.
    handleDraw(state, 'circle', {
      cell: '0,0', cx: 8, cy: 8, r: 16, color: '#ff004d', shape_name: 'big',
    });
    const rMed = handleDraw(state, 'highlight', {
      cell: '0,0', shape: 'ball', direction: 'top-left', shape_name: 'md_hl',
    });
    const rBig = handleDraw(state, 'highlight', {
      cell: '0,0', shape: 'big', direction: 'top-left', shape_name: 'big_hl',
    });
    expect(rMed.shapeNames.length).toBeGreaterThanOrEqual(2);
    expect(rBig.shapeNames.length).toBeGreaterThan(rMed.shapeNames.length);
  });

  it('works with ellipse shapes', () => {
    handleDraw(state, 'ellipse', {
      cell: '0,0', cx: 8, cy: 8, rx: 6, ry: 4, color: '#29adff', shape_name: 'oval',
    });
    const result = handleDraw(state, 'highlight', {
      cell: '0,0', shape: 'oval', direction: 'top-left', shape_name: 'oval_hl',
    });
    expect(result.shapeNames.length).toBeGreaterThanOrEqual(2);
  });

  it('works with rect shapes', () => {
    handleDraw(state, 'rect', {
      cell: '0,0', x: 2, y: 2, w: 10, h: 8, color: '#00e436', shape_name: 'box',
    });
    const result = handleDraw(state, 'highlight', {
      cell: '0,0', shape: 'box', direction: 'top-left', shape_name: 'box_hl',
    });
    expect(result.shapeNames.length).toBeGreaterThanOrEqual(2);
  });

  it('supports all 8 directions', () => {
    const directions = [
      'top-left', 'top-right', 'bottom-left', 'bottom-right',
      'top', 'bottom', 'left', 'right',
    ];
    for (const dir of directions) {
      const result = handleDraw(state, 'highlight', {
        cell: '0,0', shape: 'ball', direction: dir, shape_name: `hl_${dir}`,
      });
      expect(result.shapeNames.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('throws if shape not found', () => {
    expect(() => handleDraw(state, 'highlight', {
      cell: '0,0', shape: 'nonexistent', shape_name: 'fail',
    })).toThrow('Shape "nonexistent" not found');
  });

  it('derives a step for a color outside the palette ramps instead of refusing', () => {
    // A raw hex color not in the pico8 palette
    handleDraw(state, 'circle', {
      cell: '0,0', cx: 4, cy: 4, r: 3, color: '#123456', shape_name: 'custom',
    });
    const result = handleDraw(state, 'highlight', { cell: '0,0', shape: 'custom', shape_name: 'lit' });
    expect(result.derived[0]).toMatchObject({ from: '#123456', method: 'hsl' });
  });

  it('throws if shape is a point (no bounding box)', () => {
    handleDraw(state, 'point', {
      cell: '0,0', x: 5, y: 5, color: '#ff004d', shape_name: 'dot',
    });
    expect(() => handleDraw(state, 'highlight', {
      cell: '0,0', shape: 'dot', shape_name: 'fail',
    })).toThrow('no bounding box');
  });

  it('throws if shape is a line (no bounding box)', () => {
    handleDraw(state, 'line', {
      cell: '0,0', x1: 0, y1: 0, x2: 10, y2: 10, color: '#ff004d', shape_name: 'edge',
    });
    expect(() => handleDraw(state, 'highlight', {
      cell: '0,0', shape: 'edge', shape_name: 'fail',
    })).toThrow('no bounding box');
  });

  it('broadcasts draw events for each created point', () => {
    const messages = [];
    state.broadcast = (msg) => messages.push(msg);
    handleDraw(state, 'highlight', {
      cell: '0,0', shape: 'ball', direction: 'top-left', shape_name: 'ball_hl',
    });
    const drawMessages = messages.filter(m => m.type === 'draw');
    expect(drawMessages.length).toBeGreaterThanOrEqual(2);
  });
});
