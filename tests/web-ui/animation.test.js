// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { AnimationPreview } from '../../server/web/public/js/animation.js';

describe('AnimationPreview (browser)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="anim-panel"></div>';
  });
  it('refreshes a paused frame after an edit and applies saved group timing', () => {
    const ap = new AnimationPreview({ mountId: 'anim-panel', size: 64 }); ap.init();
    ap.setCellSize(16, 16); ap.setPalette({}); ap.setFrames(['0,0']);
    ap.setCells({ '0,0': { shapes: [{ type: 'point', params: { x: 0, y: 0 }, color: '#ff0000', zIndex: 0 }] } });
    expect(document.querySelector('.anim-canvas').getContext('2d').getImageData(0, 0, 1, 1).data[0]).toBe(255);
    ap.setFps(6);
    expect(document.querySelector('.anim-fps-label').textContent).toBe('6 FPS');
    ap.play(); ap.setFrames([]);
    expect(ap._intervalId).toBeNull();
  });

  it('snaps the canvas to an integer pixel scale of the cell dims', () => {
    const ap = new AnimationPreview({ mountId: 'anim-panel', size: 128 });
    ap.init();
    ap.setCellSize(16, 32);
    const canvas = document.querySelector('.anim-canvas');
    // scale = floor(128 / max(16,32)) = 4 -> 64x128
    expect(canvas.width).toBe(64);
    expect(canvas.height).toBe(128);
  });
  it('reserves actual controls and mount padding when fitting a responsive preview', () => {
    const ap = new AnimationPreview({ mountId: 'anim-panel', size: 512 }); ap.init();
    ap.setCellSize(16, 32);
    const mount = document.getElementById('anim-panel');
    mount.style.padding = '16px';
    mount.getBoundingClientRect = () => ({ width: 400, height: 400 });
    ap._container.getBoundingClientRect = () => ({ width: 256, height: 652 });
    ap._canvas.getBoundingClientRect = () => ({ width: 256, height: 512 });
    ap.fitToMount();
    expect(ap._canvas.height).toBe(224); // 400 - 32 padding - 140 controls, snapped to 32.
  });

  it('constructs without an explicit size (default preview size)', () => {
    const ap = new AnimationPreview({ mountId: 'anim-panel' });
    ap.init();
    expect(document.querySelector('.anim-canvas')).toBeTruthy();
  });

  it('renders the current frame including polygons', () => {
    const ap = new AnimationPreview({ mountId: 'anim-panel', size: 64 });
    ap.init();
    ap.setCellSize(16, 16); // scale 4 -> 64x64
    ap.setPalette({});
    ap.setCells({ '0,0': { shapes: [{ type: 'polygon', params: { points: [{ x: 1, y: 1 }, { x: 10, y: 1 }, { x: 1, y: 10 }], filled: true }, color: '#ff0000', zIndex: 0 }] } });
    ap.setFrames(['0,0']);
    const ctx = document.querySelector('.anim-canvas').getContext('2d');
    const d = ctx.getImageData(3 * 4, 3 * 4, 1, 1).data; // interior pixel (3,3)
    expect(d[0]).toBe(255);
  });

  it('steps frames on play tick data (frame counter follows setFrames)', () => {
    const ap = new AnimationPreview({ mountId: 'anim-panel', size: 64 });
    ap.init();
    ap.setCellSize(16, 16);
    ap.setPalette({});
    ap.setCells({
      '0,0': { shapes: [{ type: 'point', params: { x: 0, y: 0 }, color: '#ff0000', zIndex: 0 }] },
      '0,1': { shapes: [{ type: 'point', params: { x: 1, y: 0 }, color: '#00ff00', zIndex: 0 }] },
    });
    ap.setFrames(['0,0', '0,1']);
    const ctx = document.querySelector('.anim-canvas').getContext('2d');
    expect(ctx.getImageData(0, 0, 1, 1).data[0]).toBe(255); // frame 0 red point at 0,0
  });
});
