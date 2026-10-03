import { createRequire } from 'module';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const DEFAULT_PATH = join(homedir(), '.claude-sprites', 'session.db');

export class SessionDB {
  constructor(dbPath = process.env.SPRITE_DB_PATH || DEFAULT_PATH) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    // WAL + synchronous=FULL ensures every commit is fsynced — force-kills
    // can no longer lose the most recent writes. Minor perf cost, acceptable
    // for this workload (draws are low-frequency vs fsync cost).
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');
    this._init();
  }

  _init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        created_at INTEGER,
        updated_at INTEGER,
        project_name TEXT,
        json_file TEXT,
        project_path TEXT,
        destination_folder TEXT,
        draft_json TEXT
      );
      CREATE TABLE IF NOT EXISTS cell_groups (
        session_id TEXT,
        name TEXT,
        cells TEXT,
        PRIMARY KEY (session_id, name)
      );
      CREATE TABLE IF NOT EXISTS shape_groups (
        session_id TEXT,
        cell TEXT,
        name TEXT,
        shapes TEXT,
        PRIMARY KEY (session_id, cell, name)
      );
    `);
    // fps column arrived after the table shipped; older DBs lack it.
    try { this.db.exec('ALTER TABLE cell_groups ADD COLUMN fps INTEGER'); } catch { /* already present */ }
    try { this.db.exec('ALTER TABLE cell_groups ADD COLUMN direction TEXT'); } catch { /* already present */ }
  }

  createSession({ project_name, project_path, destination_folder, json_file, draft_json }) {
    const id = `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO sessions (id, created_at, updated_at, project_name, json_file, project_path, destination_folder, draft_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, now, now, project_name, json_file, project_path, destination_folder, draft_json);
    return this.getSession(id);
  }

  getSession(id) {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  }

  getLastSession() {
    // rowid is strictly monotonic per-insert — reliable tiebreak for
    // same-millisecond updated_at values.
    return this.db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC, rowid DESC LIMIT 1').get();
  }

  updateDraft(id, draft_json) {
    // The written row must become the globally most-recent even when writes
    // land within the same millisecond, so "most recently updated" ordering
    // (listSessions, findSessionByName, getLastSession) never ties.
    this.db.prepare(`
      UPDATE sessions SET draft_json = ?,
        updated_at = MAX(?, (SELECT MAX(updated_at) FROM sessions) + 1)
      WHERE id = ?
    `).run(draft_json, Date.now(), id);
  }

  updateSession(id, fields) {
    const entries = Object.entries(fields);
    const set = entries.map(([k]) => `${k} = ?`).join(', ');
    const vals = entries.map(([, v]) => v);
    this.db.prepare(`UPDATE sessions SET ${set}, updated_at = MAX(?, (SELECT MAX(updated_at) FROM sessions) + 1) WHERE id = ?`)
      .run(...vals, Date.now(), id);
  }

  listSessions(limit = 20) {
    return this.db.prepare(`
      SELECT id, project_name, created_at, updated_at FROM sessions
      ORDER BY updated_at DESC, rowid DESC LIMIT ?
    `).all(limit);
  }

  findSessionByName(name) {
    return this.db.prepare(`
      SELECT * FROM sessions WHERE project_name = ?
      ORDER BY updated_at DESC, rowid DESC LIMIT 1
    `).get(name);
  }

  setCellGroup(sessionId, name, cells) {
    // Upsert that leaves fps intact (INSERT OR REPLACE would null it out)
    this.db.prepare(`
      INSERT INTO cell_groups (session_id, name, cells) VALUES (?, ?, ?)
      ON CONFLICT (session_id, name) DO UPDATE SET cells = excluded.cells
    `).run(sessionId, name, JSON.stringify(cells));
  }

  setCellGroupFps(sessionId, name, fps) {
    this.db.prepare('UPDATE cell_groups SET fps = ? WHERE session_id = ? AND name = ?')
      .run(fps, sessionId, name);
  }

  getCellGroupFps(sessionId) {
    const rows = this.db.prepare('SELECT name, fps FROM cell_groups WHERE session_id = ? AND fps IS NOT NULL').all(sessionId);
    return Object.fromEntries(rows.map(r => [r.name, r.fps]));
  }

  setCellGroupDirection(sessionId, name, direction) {
    this.db.prepare('UPDATE cell_groups SET direction = ? WHERE session_id = ? AND name = ?')
      .run(direction, sessionId, name);
  }

  getCellGroupDirections(sessionId) {
    const rows = this.db.prepare('SELECT name, direction FROM cell_groups WHERE session_id = ? AND direction IS NOT NULL').all(sessionId);
    return Object.fromEntries(rows.map(r => [r.name, r.direction]));
  }

  deleteCellGroup(sessionId, name) {
    this.db.prepare('DELETE FROM cell_groups WHERE session_id = ? AND name = ?').run(sessionId, name);
  }

  getCellGroups(sessionId) {
    const rows = this.db.prepare('SELECT name, cells FROM cell_groups WHERE session_id = ?').all(sessionId);
    return Object.fromEntries(rows.map(r => [r.name, JSON.parse(r.cells)]));
  }

  setShapeGroup(sessionId, cell, name, shapes) {
    this.db.prepare(`
      INSERT OR REPLACE INTO shape_groups (session_id, cell, name, shapes) VALUES (?, ?, ?, ?)
    `).run(sessionId, cell, name, JSON.stringify(shapes));
  }

  deleteShapeGroup(sessionId, cell, name) {
    this.db.prepare('DELETE FROM shape_groups WHERE session_id = ? AND cell = ? AND name = ?')
      .run(sessionId, cell, name);
  }

  getShapeGroups(sessionId, cell) {
    const rows = this.db.prepare('SELECT name, shapes FROM shape_groups WHERE session_id = ? AND cell = ?')
      .all(sessionId, cell);
    return Object.fromEntries(rows.map(r => [r.name, JSON.parse(r.shapes)]));
  }

  getAllShapeGroups(sessionId) {
    const rows = this.db.prepare('SELECT cell, name, shapes FROM shape_groups WHERE session_id = ?').all(sessionId);
    const result = {};
    for (const r of rows) {
      if (!result[r.cell]) result[r.cell] = {};
      result[r.cell][r.name] = JSON.parse(r.shapes);
    }
    return result;
  }

  close() { this.db.close(); }
}
