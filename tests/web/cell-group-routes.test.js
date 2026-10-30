import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { startWebServer } from '../../server/web/http.js';
import { Project } from '../../server/engine/project.js';
import { SessionDB } from '../../server/db/session.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Cell + Group Routes', () => {
  let info, db, state, baseUrl, dir;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'sprite-cell-routes-'));
    db = new SessionDB(':memory:');
    const project = Project.create({ name: 'test', cellSize: 16, rows: 4, cols: 4, palette: 'pico8' });
    // Draw something in cell 0,0 so we have content to work with
    const cell = project.cells.getCell('0,0');
    cell.draw('rect', { x: 0, y: 0, w: 4, h: 4 }, '#ff0000', 'test-shape');
    const draft = JSON.stringify(project.toJSON());
    const session = db.createSession({
      project_name: 'test',
      project_path: dir,
      destination_folder: join(dir, 'assets'),
      json_file: null,
      draft_json: draft,
    });
    state = { project, sessionId: session.id, db };
    info = await startWebServer(state, 0);
    baseUrl = `http://localhost:${info.port}`;
  });

  afterAll(async () => {
    if (info) {
      info.wss.close();
      await new Promise(r => info.httpServer.close(r));
    }
    db?.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  // --- Cell routes ---
  test('GET /api/cells lists cells', async () => {
    const res = await fetch(`${baseUrl}/api/cells`);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(JSON.stringify(body.data)).toContain('0,0');
  });

  test('POST /api/cell/name names a cell', async () => {
    const res = await fetch(`${baseUrl}/api/cell/name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cell: '0,0', name: 'idle' }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(state.project.cells.getCell('0,0').name).toBe('idle');
  });

  test('POST /api/cell/copy copies a cell', async () => {
    const res = await fetch(`${baseUrl}/api/cell/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: '0,0', to: '0,1' }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(state.project.cells.getCell('0,1').shapes.get('test-shape').color).toBe('#ff0000');
  });

  // --- Cell group routes ---
  test('POST /api/group/cell/create creates a cell group', async () => {
    const res = await fetch(`${baseUrl}/api/group/cell/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'walk', cells: ['0,0', '0,1', '0,2'] }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(db.getCellGroups(state.sessionId).walk).toEqual(['0,0', '0,1', '0,2']);
  });

  test('GET /api/group/cell/list lists cell groups', async () => {
    const res = await fetch(`${baseUrl}/api/group/cell/list`);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.walk).toEqual(['0,0', '0,1', '0,2']);
  });

  test('POST /api/group/cell/add adds cells to group', async () => {
    const res = await fetch(`${baseUrl}/api/group/cell/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'walk', cells: ['0,3'] }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(db.getCellGroups(state.sessionId).walk).toEqual(['0,0', '0,1', '0,2', '0,3']);
  });

  test('POST /api/group/cell/remove removes cells from group', async () => {
    const res = await fetch(`${baseUrl}/api/group/cell/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'walk', cells: ['0,3'] }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(db.getCellGroups(state.sessionId).walk).toEqual(['0,0', '0,1', '0,2']);
  });

  test('POST /api/group/cell/delete deletes a cell group', async () => {
    const res = await fetch(`${baseUrl}/api/group/cell/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'walk' }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(db.getCellGroups(state.sessionId).walk).toBeUndefined();
  });

  // --- Shape group routes ---
  test('POST /api/group/shape/create creates a shape group', async () => {
    const res = await fetch(`${baseUrl}/api/group/shape/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cell: '0,0', name: 'body', shapes: ['test-shape'] }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(db.getShapeGroups(state.sessionId, '0,0').body).toEqual(['test-shape']);
  });

  test('GET /api/group/shape/list lists shape groups', async () => {
    const res = await fetch(`${baseUrl}/api/group/shape/list?cell=0,0`);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.body).toEqual(['test-shape']);
  });

  test('POST /api/group/shape/delete deletes a shape group', async () => {
    const res = await fetch(`${baseUrl}/api/group/shape/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cell: '0,0', name: 'body' }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(db.getShapeGroups(state.sessionId, '0,0').body).toBeUndefined();
  });
});
