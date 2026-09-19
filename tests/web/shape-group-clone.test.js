import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { startWebServer } from '../../server/web/http.js';
import { Project } from '../../server/engine/project.js';
import { SessionDB } from '../../server/db/session.js';
import { tmpdir } from 'os';
import { join } from 'path';

describe('shape groups travel with cloned cells', () => {
  let info, db, state, baseUrl;
  const post = (path, body) => fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());

  beforeAll(async () => {
    db = new SessionDB(join(tmpdir(), `test-group-clone-${Date.now()}.db`));
    const project = Project.create({ name: 'test', cellSize: 16, rows: 2, cols: 3, palette: 'pico8' });
    const cell = project.cells.getCell('0,0');
    cell.draw('rect', { x: 0, y: 0, w: 4, h: 4, filled: true }, '#ff0000', 'patch_a');
    cell.draw('rect', { x: 6, y: 6, w: 4, h: 4, filled: true }, '#ff0000', 'patch_b');
    cell.draw('rect', { x: 12, y: 0, w: 2, h: 2, filled: true }, '#00ff00', 'other');
    const session = db.createSession({ project_name: 'test', project_path: '/tmp', destination_folder: '/tmp/assets', json_file: null, draft_json: JSON.stringify(project.toJSON()) });
    state = { project, sessionId: session.id, db };
    info = await startWebServer(state, 0);
    baseUrl = `http://localhost:${info.port}`;
    const created = await post('/api/group/shape/create', { cell: '0,0', name: 'patches', shapes: ['patch_a', 'patch_b'] });
    expect(created.ok).toBe(true);
    expect(db.getShapeGroups(state.sessionId, '0,0').patches).toEqual(['patch_a', 'patch_b']);
  });

  afterAll(async () => { await info.close?.(); db.close(); });

  test('clone-fanout copies the source cell\'s shape groups so recolor-group works on the clones', async () => {
    const cloned = await post('/api/cell/clone-fanout', { from: '0,0', to: ['0,1', '0,2'] });
    expect(cloned.ok).toBe(true);
    expect(db.getShapeGroups(state.sessionId, '0,1').patches).toEqual(['patch_a', 'patch_b']);
    expect(db.getShapeGroups(state.sessionId, '0,2').patches).toEqual(['patch_a', 'patch_b']);
    const recolored = await post('/api/group/shape/recolor', { name: 'patches', cell: '0,1', color: '#0000ff' });
    expect(recolored.ok).toBe(true);
    const clone = state.project.cells.getCell('0,1');
    expect(clone.shapes.get('patch_a').color).toBe('#0000ff');
    expect(clone.shapes.get('patch_b').color).toBe('#0000ff');
    expect(clone.shapes.get('other').color).toBe('#00ff00');
    expect(state.project.cells.getCell('0,0').shapes.get('patch_a').color).toBe('#ff0000');   // source untouched
  });

  test('cell copy carries shape groups too', async () => {
    const copied = await post('/api/cell/copy', { from: '0,0', to: '1,0' });
    expect(copied.ok).toBe(true);
    expect(db.getShapeGroups(state.sessionId, '1,0').patches).toEqual(['patch_a', 'patch_b']);
  });

  test('recolor-group and move-group refuse a cell that lacks the group instead of silently doing nothing', async () => {
    const recolored = await post('/api/group/shape/recolor', { name: 'patches', cell: '1,2', color: '#0000ff' });
    expect(recolored.ok).toBe(false);
    expect(recolored.error).toMatch(/patches.*1,2|1,2.*patches/);
    const moved = await post('/api/group/shape/move', { name: 'patches', cell: '1,2', dx: 1, dy: 0 });
    expect(moved.ok).toBe(false);
    expect(moved.error).toMatch(/patches/);
    // all_cells keeps skipping cells without the group, by design
    const all = await post('/api/group/shape/move', { name: 'patches', all_cells: true, dx: 1, dy: 0 });
    expect(all.ok).toBe(true);
  });
});
