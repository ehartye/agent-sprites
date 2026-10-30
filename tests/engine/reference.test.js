import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Cell } from '../../server/engine/cell.js';
import { CellManager } from '../../server/engine/cell-manager.js';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';
import { Palette } from '../../server/engine/palette.js';
import { createCanvas } from 'canvas';
import fs from 'fs';
import os from 'os';
import { join } from 'path';

let refPath;
let dir;

beforeAll(() => {
  // A solid red 4x4 PNG to use as the reference image
  const c = createCanvas(4, 4);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 4, 4);
  dir = fs.mkdtempSync(join(os.tmpdir(), 'sprites-ref-'));
  refPath = join(dir, 'ref.png');
  fs.writeFileSync(refPath, c.toBuffer('image/png'));
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('cell reference image', () => {
  it('round-trips reference through toJSON/fromJSON', () => {
    const cell = new Cell(16);
    cell.reference = { path: refPath, opacity: 0.5 };
    const revived = Cell.fromJSON(cell.toJSON(), 16);
    expect(revived.reference).toEqual({ path: refPath, opacity: 0.5 });
  });

  it('renders the reference under shapes only when asked', () => {
    const cell = new Cell(16);
    cell.reference = { path: refPath, opacity: 0.5 };
    const renderer = new CanvasRenderer(new Palette());

    const withRef = renderer.renderCellRaw(cell, { withReference: true });
    // empty cell, but reference fills it at ~50% alpha
    expect(withRef[3]).toBeGreaterThan(0);
    expect(withRef[3]).toBeLessThan(255);
    expect(withRef[0]).toBeGreaterThan(200); // red channel

    const withoutRef = renderer.renderCellRaw(cell);
    expect(withoutRef[3]).toBe(0); // export path stays clean
  });

  it('draws shapes on top of the reference', () => {
    const cell = new Cell(16);
    cell.reference = { path: refPath, opacity: 0.5 };
    cell.draw('point', { x: 0, y: 0 }, '#00ff00', 'dot');
    const renderer = new CanvasRenderer(new Palette());
    const raw = renderer.renderCellRaw(cell, { withReference: true });
    expect(raw[1]).toBeGreaterThan(200); // green wins at 0,0
    expect(raw[3]).toBe(255);
  });

  it('skips a missing reference file without failing', () => {
    const cell = new Cell(16);
    cell.reference = { path: join(dir, 'nope-does-not-exist.png'), opacity: 0.5 };
    const renderer = new CanvasRenderer(new Palette());
    const raw = renderer.renderCellRaw(cell, { withReference: true });
    expect(raw[3]).toBe(0);
  });

  it('copyCell carries the reference along', () => {
    const cm = new CellManager(16, 1, 2);
    cm.getCell('0,0').reference = { path: refPath, opacity: 0.35 };
    cm.copyCell('0,0', '0,1');
    expect(cm.getCell('0,1').reference).toEqual({ path: refPath, opacity: 0.35 });
  });
});
