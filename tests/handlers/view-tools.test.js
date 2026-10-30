import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { handleDraw } from '../../server/handlers/draw.js';
import { handleViewCell, handleViewCells, handleViewSheet, handleExportPng, handleExportJson } from '../../server/handlers/view.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// PNG IHDR: 8-byte signature, then width/height at bytes 16..24.
function pngDims(p) {
  const buf = fs.readFileSync(p);
  expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe('View tools', () => {
  let state;
  let tmpDir;

  beforeEach(() => {
    state = {
      project: Project.create({ name: 'test', cellSize: 16, rows: 2, cols: 2 }),
      broadcast: () => {},
    };
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sprites-view-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('renders a cell to a temp PNG', () => {
    handleDraw(state, 'rect', { cell: '0,0', x: 0, y: 0, w: 8, h: 8, color: '#ff0000' });
    const result = handleViewCell(state, { cell: '0,0' }, tmpDir);
    expect(fs.existsSync(result.path)).toBe(true);
    const buf = fs.readFileSync(result.path);
    expect(buf[0]).toBe(0x89); // PNG magic byte
  });

  it('renders multiple cells side by side', () => {
    handleDraw(state, 'rect', { cell: '0,0', x: 0, y: 0, w: 4, h: 4, color: '#ff0000' });
    handleDraw(state, 'rect', { cell: '0,1', x: 0, y: 0, w: 4, h: 4, color: '#0000ff' });
    const result = handleViewCells(state, { cells: ['0,0', '0,1'] }, tmpDir);
    expect(fs.existsSync(result.path)).toBe(true);
    const buf = fs.readFileSync(result.path);
    expect(buf[0]).toBe(0x89);
  });

  it('renders full sheet', () => {
    const result = handleViewSheet(state, {}, tmpDir);
    expect(fs.existsSync(result.path)).toBe(true);
    const buf = fs.readFileSync(result.path);
    expect(buf[0]).toBe(0x89);
  });

  it('exports cell to a user-specified path', () => {
    handleDraw(state, 'rect', { cell: '0,0', x: 0, y: 0, w: 8, h: 8, color: '#ff0000' });
    const outPath = path.join(tmpDir, 'cell-export.png');
    handleExportPng(state, { target: '0,0', path: outPath });
    expect(pngDims(outPath)).toEqual({ w: 16, h: 16 });
  });

  it('exports sheet to a user-specified path', () => {
    const outPath = path.join(tmpDir, 'sheet-export.png');
    handleExportPng(state, { target: 'sheet', path: outPath });
    expect(pngDims(outPath)).toEqual({ w: 33, h: 33 }); // 2x2 cells of 16px plus one separator column and row
  });

  it('exports group to a user-specified path', () => {
    state.project.groups.create('walk', ['0,0', '0,1']);
    const outPath = path.join(tmpDir, 'group-export.png');
    handleExportPng(state, { target: 'walk', path: outPath });
    expect(pngDims(outPath)).toEqual({ w: 33, h: 16 }); // the two group cells side by side
  });

  it('exports texture atlas JSON', () => {
    const outPath = path.join(tmpDir, 'atlas.json');
    handleExportJson(state, { path: outPath });
    expect(fs.existsSync(outPath)).toBe(true);
    const atlas = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
    expect(atlas.meta.image).toBe('test.png');
    expect(atlas.frames).toHaveLength(4); // 2x2
    expect(atlas.frames[0].frame).toEqual({ x: 0, y: 0, w: 16, h: 16 });
  });

  it('renders terminal format when format=terminal', () => {
    handleDraw(state, 'rect', { cell: '0,0', x: 0, y: 0, w: 4, h: 4, color: '#ff0000' });
    const result = handleViewCell(state, { cell: '0,0', format: 'terminal' }, tmpDir);
    expect(typeof result.terminal).toBe('string');
    expect(result.terminal).toContain('██');
    expect(result.terminal).toContain('·');
  });

  it('throws without project', () => {
    state.project = null;
    expect(() => handleViewCell(state, { cell: '0,0' }, tmpDir)).toThrow('No project');
  });
});
