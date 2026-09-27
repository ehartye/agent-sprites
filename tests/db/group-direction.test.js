import { test, expect, beforeEach, afterEach } from 'vitest';
import { SessionDB } from '../../server/db/session.js';
import { Project } from '../../server/engine/project.js';
import { mapCommandToApi } from '../../scripts/batch-commands.js';
import { buildProject } from '../../server/build/project-build.js';
import { tmpdir } from 'os';
import { join } from 'path';
import fs from 'fs';
import { createRequire } from 'module';

let db, dbPath;
const session = () => db.createSession({ project_name: 'p', project_path: '.', destination_folder: '.', json_file: null, draft_json: '{}' });
beforeEach(() => {
  dbPath = join(tmpdir(), `test-groupdir-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  db = new SessionDB(dbPath);
});
afterEach(() => { db.close(); fs.rmSync(dbPath, { force: true }); });

test('stores per-group direction and preserves it across cell and fps updates', () => {
  const s = session();
  db.setCellGroup(s.id, 'chomp', ['0,0', '0,1', '0,2']);
  db.setCellGroupDirection(s.id, 'chomp', 'pingpong');
  db.setCellGroupFps(s.id, 'chomp', 12);
  db.setCellGroup(s.id, 'chomp', ['0,0', '0,1']);
  expect(db.getCellGroupDirections(s.id)).toEqual({ chomp: 'pingpong' });
  expect(db.getCellGroupFps(s.id)).toEqual({ chomp: 12 });
});

test('groups without a direction are absent from the direction map', () => {
  const s = session();
  db.setCellGroup(s.id, 'walk', ['0,0']);
  expect(db.getCellGroupDirections(s.id)).toEqual({});
});

test('migrates an existing database missing the direction column', () => {
  db.close();
  fs.rmSync(dbPath, { force: true });
  const Database = createRequire(import.meta.url)('better-sqlite3');
  const raw = new Database(dbPath);
  raw.exec(`CREATE TABLE cell_groups (session_id TEXT, name TEXT, cells TEXT, fps INTEGER, PRIMARY KEY (session_id, name));`);
  raw.prepare(`INSERT INTO cell_groups (session_id, name, cells, fps) VALUES (?, ?, ?, ?)`).run('s1', 'walk', '["0,0"]', 10);
  raw.close();
  db = new SessionDB(dbPath);
  db.setCellGroupDirection('s1', 'walk', 'reverse');
  expect(db.getCellGroupDirections('s1')).toEqual({ walk: 'reverse' });
  expect(db.getCellGroupFps('s1')).toEqual({ walk: 10 });
});

test('exported tags carry their direction and default to forward', () => {
  const p = Project.create({ name: 'pac', cellSize: 8, rows: 1, cols: 3 });
  const atlas = p.exportAseprite({ imageName: 'pac.png', groups: { chomp: ['0,0', '0,1', '0,2'], idle: ['0,0'] }, directionMap: { chomp: 'pingpong' } });
  expect(Object.fromEntries(atlas.meta.frameTags.map(t => [t.name, t.direction]))).toEqual({ chomp: 'pingpong', idle: 'forward' });
});

test('project files round-trip animation directions', () => {
  const p = Project.create({ name: 'pac', cellSize: 8, rows: 1, cols: 2 });
  p.animationDirections = { chomp: 'reverse' };
  expect(Project.fromJSON(p.toJSON()).animationDirections).toEqual({ chomp: 'reverse' });
  expect(Project.fromJSON({ ...p.toJSON(), animationDirections: undefined }).animationDirections).toEqual({});
});

test('batch maps direction on create and as its own sub-command', () => {
  expect(mapCommandToApi({ command: 'group', sub: 'create', name: 'chomp', cells: ['0,0'], direction: 'pingpong' }).body.direction).toBe('pingpong');
  expect(mapCommandToApi({ command: 'group', sub: 'direction', name: 'chomp', direction: 'reverse' })).toMatchObject({ path: '/api/group/cell/direction', body: { name: 'chomp', direction: 'reverse' } });
});

test('a build publishes the pingpong tag and rejects an unknown direction', async () => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'sprite-direction-'));
  try {
    const ops = [
      { command: 'new', name: 'pac', size: 8, rows: 1, cols: 3 },
      { command: 'draw', type: 'point', cell: '0,0', name: 'p', x: 1, y: 1, color: '#ffffff' },
      { command: 'group', sub: 'create', name: 'chomp', cells: ['0,0', '0,1', '0,2'], fps: 10, direction: 'pingpong' },
    ];
    fs.writeFileSync(join(dir, 'ops.json'), JSON.stringify(ops));
    fs.writeFileSync(join(dir, 'sprite-project.json'), JSON.stringify({ version: 1, ops: 'ops.json', output: 'dist', expectedTags: ['chomp'], scale: 1 }));
    const result = await buildProject(join(dir, 'sprite-project.json'));
    expect(result.errors).toEqual([]);
    const atlas = JSON.parse(fs.readFileSync(result.artifacts.atlas, 'utf8'));
    expect(atlas.meta.frameTags[0]).toMatchObject({ name: 'chomp', direction: 'pingpong' });
    expect(JSON.parse(fs.readFileSync(result.artifacts.project, 'utf8')).animationDirections).toEqual({ chomp: 'pingpong' });
    ops[2].direction = 'sideways';
    fs.writeFileSync(join(dir, 'ops.json'), JSON.stringify(ops));
    const bad = await buildProject(join(dir, 'sprite-project.json'));
    expect(bad.ok).toBe(false);
    expect(bad.errors[0].message).toMatch(/direction must be forward, reverse or pingpong/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}, 30000);
