import { afterEach, expect, test, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionDB } from '../../server/db/session.js';

const dirs = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function databasePath() {
  const dir = mkdtempSync(join(tmpdir(), 'sprite-session-isolation-'));
  dirs.push(dir); return join(dir, 'nested', 'sessions.db');
}

test('the test harness supplies a private database to every file and its subprocesses', () => {
  expect(process.env.SPRITE_DB_PATH).toMatch(/agent-sprites-tests-[^\\/]+[\\/]sessions\.db$/);
});

test('the default session database honors an isolated path inherited by server processes', () => {
  const path = databasePath(); vi.stubEnv('SPRITE_DB_PATH', path);
  const db = new SessionDB();
  try {
    // Assert isolation before any write so the regression cannot pollute the
    // normal database when it fails.
    expect(db.db.name).toBe(path);
    db.createSession({ project_name: 'isolated', project_path: '/test', destination_folder: '/test/out', json_file: null, draft_json: '{}' });
  } finally { db.close(); }
  expect(existsSync(path)).toBe(true);
  const restored = new SessionDB(path);
  try { expect(restored.getLastSession().project_name).toBe('isolated'); }
  finally { restored.close(); }
});

test('an explicit in-memory database takes precedence over the environment', () => {
  const path = databasePath(); vi.stubEnv('SPRITE_DB_PATH', path);
  const db = new SessionDB(':memory:');
  try { expect(db.db.name).toBe(':memory:'); }
  finally { db.close(); }
  expect(existsSync(path)).toBe(false);
});
