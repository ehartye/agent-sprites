import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startWebServer } from '../../server/web/http.js';
import { SessionDB } from '../../server/db/session.js';

const exec = promisify(execFile);
const cliPath = resolve('scripts/sprite.js');

describe('batch reports for agent workflows', () => {
  let root, db, server, state;
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'sprite-report-'));
    db = new SessionDB(join(root, 'sessions.db'));
    state = { project: null, sessionId: null, db };
    server = await startWebServer(state, 0);
  });
  afterAll(async () => {
    server.wss.close();
    await new Promise(resolve => server.httpServer.close(resolve));
    db.close();
    rmSync(root, { recursive: true, force: true });
  });

  async function batch(commands, ...flags) {
    const file = join(root, 'ops.json');
    writeFileSync(file, JSON.stringify(commands));
    try {
      return { code: 0, ...await exec(process.execPath, [cliPath, 'batch', file, ...flags], {
        cwd: root, env: { ...process.env, SPRITE_PORT: String(server.port) }, timeout: 10000,
      }) };
    } catch (error) {
      return { code: error.code, stdout: error.stdout, stderr: error.stderr };
    }
  }
  const newProject = { command: 'new', name: 'robot', size: 16, rows: 1, cols: 2 };
  const dot = { command: 'draw', type: 'point', cell: '0,0', x: 2, y: 2, color: '#fff1e8', name: 'eye' };

  test('JSON report returns real export paths, active session and animation metadata', async () => {
    const dest = join(root, 'public art');
    const result = await batch([
      newProject, dot,
      { command: 'group', sub: 'create', name: 'idle', cells: ['0,0', '0,1'], fps: 5 },
      { command: 'export', dest },
    ], '--json');
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({ ok: true, total: 4, attempted: 4, succeeded: 4, failed: 0, errors: [] });
    expect(report.session).toMatchObject({ active: true, session_id: state.sessionId, project_name: 'robot' });
    expect(report.artifacts).toEqual([
      { type: 'sheet', path: join(dest, 'robot.png') },
      { type: 'atlas', path: join(dest, 'robot.atlas.json') },
    ]);
    for (const artifact of report.artifacts) expect(existsSync(artifact.path)).toBe(true);
    const atlas = JSON.parse(readFileSync(report.artifacts[1].path, 'utf8'));
    expect(report.exports[0]).toMatchObject({ session_id: state.sessionId, size: atlas.meta.size, frameTags: atlas.meta.frameTags });
    expect(existsSync(join(root, 'assets'))).toBe(false);
  });

  test('quiet mode keeps the summary and artifact paths without operation chatter', async () => {
    const dest = join(root, 'quiet');
    const result = await batch([newProject, dot, { command: 'export', dest }], '--quiet');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Done: 3/3 succeeded');
    expect(result.stdout).toContain(join(dest, 'robot.png'));
    expect(result.stdout).not.toContain('[1/3]');
  });

  test('continued failures exit nonzero and report the failing operation while later work runs', async () => {
    const result = await batch([newProject, { command: 'unknown' }, dot], '--continue-on-error', '--json');
    expect(result.code).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({ ok: false, total: 3, attempted: 3, succeeded: 2, failed: 1 });
    expect(report.errors[0]).toMatchObject({ index: 2, command: 'unknown' });
    expect(report.errors[0].error).toMatch(/Unknown/);
  });

  test('fail-fast JSON still returns one report with attempted count and failure detail', async () => {
    const result = await batch([newProject, { command: 'unknown' }, dot], '--json');
    expect(result.code).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({ ok: false, total: 3, attempted: 2, succeeded: 1, failed: 1 });
  });

  test('variable substitution failures use the same nonzero report contract', async () => {
    const result = await batch([newProject, { ...dot, x: '{{missing}}' }, dot], '--vars', 'other=1', '--continue-on-error', '--json');
    expect(result.code).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({ failed: 1, succeeded: 2, attempted: 3 });
    expect(report.errors[0].error).toContain('missing');
  });

  test('invalid input returns machine-readable failure without executing operations', async () => {
    const result = await batch({ commands: [newProject] }, '--json');
    expect(result.code).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({ ok: false, total: 0, attempted: 0, succeeded: 0, failed: 1 });
    expect(report.errors[0]).toMatchObject({ index: null, command: 'batch input', error: 'Batch input must be a JSON array' });
  });

  test('quiet failures remain visible and do not hide the failed exit status', async () => {
    const result = await batch([newProject, null, dot], '--quiet', '--continue-on-error');
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('Done: 2/3 succeeded, 1 failed\n');
    expect(result.stderr).toContain('ERROR at op 2/3: invalid operation');
  });
});
