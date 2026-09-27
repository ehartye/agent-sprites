import fs from 'fs';
import path from 'path';
import { CanvasRenderer } from '../engine/canvas-renderer.js';
import { TerminalRenderer } from '../engine/terminal-renderer.js';

function getRenderer(state) {
  return new CanvasRenderer(state.project.palette, { background: state.project.background });
}

function tmpPath(tmpDir, name) {
  fs.mkdirSync(tmpDir, { recursive: true });
  return path.join(tmpDir, `${name}-${Date.now()}.png`);
}

function clampScale(s) {
  const n = Math.round(Number(s) || 1);
  return Math.max(1, Math.min(32, n));
}

/** Resolve the output path: explicit --out (parents created) or a temp file. */
function outPath(params, tmpDir, name) {
  if (params.out) {
    fs.mkdirSync(path.dirname(params.out), { recursive: true });
    return params.out;
  }
  return tmpPath(tmpDir, name);
}

export function handleViewCell(state, params, tmpDir) {
  if (!state.project) throw new Error('No project open');
  const cell = state.project.cells.getCell(params.cell);
  // Single-cell views include the tracing reference; export paths never do.
  const viewOpts = { withReference: true, scale: clampScale(params.scale) };

  if (params.format === 'terminal') {
    const termRenderer = new TerminalRenderer(state.project.palette);
    return { terminal: termRenderer.renderCell(cell, viewOpts) };
  }

  const renderer = getRenderer(state);
  const buf = renderer.renderCell(cell, viewOpts);
  const p = outPath(params, tmpDir, `cell-${params.cell.replace(',', '-')}`);
  fs.writeFileSync(p, buf);
  return { path: p };
}

export function handleViewCells(state, params, tmpDir) {
  if (!state.project) throw new Error('No project open');
  const cells = params.cells.map((ref) => state.project.cells.getCell(ref));
  const renderer = getRenderer(state);
  const buf = renderer.renderCells(cells, { scale: clampScale(params.scale) });
  const p = outPath(params, tmpDir, 'cells');
  fs.writeFileSync(p, buf);
  return { path: p };
}

export function handleViewSheet(state, params, tmpDir) {
  if (!state.project) throw new Error('No project open');
  const renderer = getRenderer(state);
  const buf = renderer.renderSheet(state.project.cells, { scale: clampScale(params.scale) });
  const p = outPath(params, tmpDir, 'sheet');
  fs.writeFileSync(p, buf);
  return { path: p };
}

export function handleExportPng(state, params) {
  if (!state.project) throw new Error('No project open');
  const renderer = getRenderer(state);
  let buf;
  if (params.target === 'sheet') {
    buf = renderer.renderSheet(state.project.cells);
  } else if (params.target.includes(',')) {
    const cell = state.project.cells.getCell(params.target);
    buf = renderer.renderCell(cell);
  } else {
    const cellRefs = state.project.groups.get(params.target);
    if (!cellRefs) throw new Error(`Unknown target: ${params.target}`);
    const cells = cellRefs.map((ref) => state.project.cells.getCell(ref));
    buf = renderer.renderCells(cells);
  }
  fs.writeFileSync(params.path, buf);
  return { path: params.path };
}

export function handleExportJson(state, params) {
  if (!state.project) throw new Error('No project open');
  const atlas = state.project.exportAseprite({
    imageName: `${state.project.name}.png`,
    groups: state.db?.getCellGroups?.(state.sessionId) ?? {},
    fpsMap: state.db?.getCellGroupFps?.(state.sessionId) ?? {},
    directionMap: state.db?.getCellGroupDirections?.(state.sessionId) ?? {},
  });
  fs.writeFileSync(params.path, JSON.stringify(atlas, null, 2));
  return { path: params.path };
}
