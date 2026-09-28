import { test, expect, beforeAll, afterAll } from 'vitest';
import { startWebServer } from '../../server/web/http.js';
import { Project, TAG_DIRECTIONS } from '../../server/engine/project.js';
import { SessionDB } from '../../server/db/session.js';
import { handleDraw } from '../../server/handlers/draw.js';
import { COMMANDS } from '../../server/web/public/js/command-catalog.js';

let info, db, state, url;
beforeAll(async () => {
  db = new SessionDB(':memory:');
  const project = Project.create({ name: 'drift', cellSize: 8, rows: 1, cols: 3, palette: 'pico8' });
  const session = db.createSession({ project_name: 'drift', project_path: '.', destination_folder: '.', json_file: null, draft_json: JSON.stringify(project.toJSON()) });
  state = { project, sessionId: session.id, db, broadcasts: [] };
  info = await startWebServer(state, 0);
  const send = state.broadcast;
  state.broadcast = msg => { state.broadcasts.push(msg); send?.(msg); };
  url = `http://127.0.0.1:${info.port}`;
});
afterAll(async () => { info.wss.close(); await new Promise(r => info.httpServer.close(r)); db.close(); });
const post = async (path, body) => (await fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();

test('fps and direction changes reach the live project the editor preview reads, and notify it', async () => {
  expect((await post('/api/group/cell/create', { name: 'chomp', cells: ['0,0', '0,1', '0,2'] })).ok).toBe(true);
  state.broadcasts.length = 0;
  expect((await post('/api/group/cell/direction', { name: 'chomp', direction: 'pingpong' })).ok).toBe(true);
  expect(state.project.animationDirections).toEqual({ chomp: 'pingpong' });
  expect(state.broadcasts.length).toBeGreaterThan(0);
  expect((await post('/api/group/cell/fps', { name: 'chomp', fps: 12 })).ok).toBe(true);
  expect(state.project.animationFps).toEqual({ chomp: 12 });
});

test('project files with an unknown tag direction are rejected, not exported verbatim', () => {
  const p = Project.create({ name: 'x', cellSize: 8, rows: 1, cols: 1 });
  expect(TAG_DIRECTIONS).toEqual(['forward', 'reverse', 'pingpong']);
  expect(() => Project.fromJSON({ ...p.toJSON(), animationDirections: { walk: 'sideways' } })).toThrow(/Animation "walk" direction must be forward, reverse or pingpong/);
});

test('an eraser cannot be combined with clip-to, which would emit opaque pixels', () => {
  const s = { project: Project.create({ name: 'e', cellSize: 16, rows: 1, cols: 1, palette: 'pico8' }), broadcast: () => {} };
  handleDraw(s, 'rect', { cell: '0,0', x: 0, y: 0, w: 16, h: 16, color: '#ff004d', shape_name: 'mask' });
  expect(() => handleDraw(s, 'ellipse', { cell: '0,0', cx: 8, cy: 8, rx: 5, ry: 3, filled: false, clip_to: 'mask', erase: true })).toThrow(/erase cannot be combined with clip-to/);
});

test('the web tool catalog exposes the new operations', () => {
  const paths = COMMANDS.map(c => c.path);
  expect(paths).toContain('/api/group/cell/direction');
  expect(paths).toContain('/api/view/stack');
  expect(COMMANDS.find(c => c.id === 'export').description).toMatch(/trim/);
  expect(COMMANDS.find(c => c.id === 'draw line').description).toMatch(/width/);
  expect(COMMANDS.find(c => c.id === 'draw rect').description).toMatch(/erase/);
  expect(COMMANDS.find(c => c.id === 'sphere-shade' || c.id === 'draw sphere-shade')?.description ?? '').toMatch(/coverage/);
});
