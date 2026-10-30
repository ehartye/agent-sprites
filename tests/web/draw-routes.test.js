import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { startWebServer } from '../../server/web/http.js';
import { Project } from '../../server/engine/project.js';
import { SessionDB } from '../../server/db/session.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Draw + Shape Routes', () => {
  let info, db, state, baseUrl, dir;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'sprite-draw-routes-'));
    db = new SessionDB(':memory:');
    const project = Project.create({ name: 'test', cellSize: 16, rows: 4, cols: 4, palette: 'pico8' });
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

  test('POST /api/draw creates a shape', async () => {
    const res = await fetch(`${baseUrl}/api/draw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'rect', cell: '0,0', x: 0, y: 0, w: 4, h: 4, color: '#ff0000' }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    const shapes = state.project.cells.getCell('0,0').shapes.listByZ();
    expect(shapes).toHaveLength(1);
    expect(shapes[0]).toMatchObject({ type: 'rect', color: '#ff0000', params: { x: 0, y: 0, w: 4, h: 4 } });
  });

  test('GET /api/shapes returns shapes for a cell', async () => {
    const res = await fetch(`${baseUrl}/api/shapes?cell=0,0`);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test('POST /api/shape/move moves a shape', async () => {
    const listRes = await fetch(`${baseUrl}/api/shapes?cell=0,0`);
    const listBody = await listRes.json();
    const shapeRef = listBody.data[0].name ?? listBody.data[0].id;

    const res = await fetch(`${baseUrl}/api/shape/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cell: '0,0', name: shapeRef, dx: 1, dy: 1 }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(state.project.cells.getCell('0,0').shapes.listByZ()[0].params).toMatchObject({ x: 1, y: 1 });
  });

  test('POST /api/shape/clone clones a shape', async () => {
    const listRes = await fetch(`${baseUrl}/api/shapes?cell=0,0`);
    const listBody = await listRes.json();
    const shapeRef = listBody.data[0].name ?? listBody.data[0].id;

    const res = await fetch(`${baseUrl}/api/shape/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_cell: '0,0', to_cell: '0,0', shape: shapeRef }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(state.project.cells.getCell('0,0').shapes.listByZ()).toHaveLength(2);
  });

  test('POST /api/shape/delete deletes a shape', async () => {
    const listRes = await fetch(`${baseUrl}/api/shapes?cell=0,0`);
    const listBody = await listRes.json();
    const last = listBody.data[listBody.data.length - 1];
    const shapeRef = last.name ?? last.id;

    const res = await fetch(`${baseUrl}/api/shape/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cell: '0,0', name: shapeRef }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(state.project.cells.getCell('0,0').shapes.listByZ()).toHaveLength(1);
  });
});
