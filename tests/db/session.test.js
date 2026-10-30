import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionDB } from '../../server/db/session.js';

let db;
let dir;
beforeEach(() => {
  // A private directory per test: no shared file name between tests or checkouts, and removed afterwards.
  dir = mkdtempSync(join(tmpdir(), 'sprite-session-'));
  db = new SessionDB(join(dir, 'sessions.db'));
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('creates a new session', () => {
  const session = db.createSession({
    project_name: 'bounce',
    project_path: '/tmp/myproject',
    destination_folder: '/tmp/myproject/assets/claude-sprites/bounce',
    json_file: null,
    draft_json: '{}',
  });
  expect(session.id).toBeTruthy();
  expect(session.project_name).toBe('bounce');
});

test('loads last session', () => {
  db.createSession({ project_name: 'a', project_path: '/a', destination_folder: '/a/assets', json_file: null, draft_json: '{}' });
  db.createSession({ project_name: 'b', project_path: '/b', destination_folder: '/b/assets', json_file: null, draft_json: '{}' });
  const last = db.getLastSession();
  expect(last.project_name).toBe('b');
});

test('updates draft_json', () => {
  const s = db.createSession({ project_name: 'x', project_path: '/x', destination_folder: '/x/assets', json_file: null, draft_json: '{}' });
  db.updateDraft(s.id, '{"cells":{}}');
  const loaded = db.getLastSession();
  expect(loaded.draft_json).toBe('{"cells":{}}');
});

test('creates and retrieves cell group', () => {
  const s = db.createSession({ project_name: 'x', project_path: '/x', destination_folder: '/x/assets', json_file: null, draft_json: '{}' });
  db.setCellGroup(s.id, 'walk', ['0,0', '0,1', '0,2']);
  const groups = db.getCellGroups(s.id);
  expect(groups).toEqual({ walk: ['0,0', '0,1', '0,2'] });
});

test('creates and retrieves shape group', () => {
  const s = db.createSession({ project_name: 'x', project_path: '/x', destination_folder: '/x/assets', json_file: null, draft_json: '{}' });
  db.setShapeGroup(s.id, '0,0', 'body', ['torso', 'left_arm']);
  const groups = db.getShapeGroups(s.id, '0,0');
  expect(groups).toEqual({ body: ['torso', 'left_arm'] });
});
