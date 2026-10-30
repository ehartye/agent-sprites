import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { handleSetReference } from '../../server/handlers/cell.js';
import { createCanvas } from 'canvas';
import fs from 'fs';
import os from 'os';
import { join } from 'path';

let refPath;
let tmpDir;

beforeAll(() => {
  const c = createCanvas(4, 4);
  c.getContext('2d').fillRect(0, 0, 4, 4);
  tmpDir = fs.mkdtempSync(join(os.tmpdir(), 'sprites-reftool-'));
  refPath = join(tmpDir, 'ref.png');
  fs.writeFileSync(refPath, c.toBuffer('image/png'));
});

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('reference tool', () => {
  let state;
  beforeEach(() => {
    state = {
      project: Project.create({ name: 'test', cellSize: 16, rows: 1, cols: 1 }),
      broadcast: () => {},
    };
  });

  it('sets a reference with default opacity', () => {
    handleSetReference(state, { cell: '0,0', path: refPath });
    expect(state.project.cells.getCell('0,0').reference).toEqual({ path: refPath, opacity: 0.35 });
  });

  it('clears the reference when path is null', () => {
    handleSetReference(state, { cell: '0,0', path: refPath, opacity: 0.5 });
    handleSetReference(state, { cell: '0,0', path: null });
    expect(state.project.cells.getCell('0,0').reference).toBe(null);
  });

  it('rejects a nonexistent file', () => {
    expect(() => handleSetReference(state, { cell: '0,0', path: join(tmpDir, 'missing-ref.png') }))
      .toThrow(/not found|exist/i);
  });

  it('throws without project', () => {
    state.project = null;
    expect(() => handleSetReference(state, { cell: '0,0', path: refPath })).toThrow('No project');
  });
});
