import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { startWebServer } from '../../server/web/http.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import os from 'os';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SPRITE_JS = join(__dirname, '..', '..', 'scripts', 'sprite.js');

describe('CLI export destination control', () => {
  let serverInfo;
  let state;
  let port;
  let tmpCwd;
  let tmpDest;
  const sessions = new Map();

  beforeAll(async () => {
    tmpCwd = fs.mkdtempSync(join(os.tmpdir(), 'sprites-cwd-'));
    tmpDest = fs.mkdtempSync(join(os.tmpdir(), 'sprites-dest-'));
    let lastId = 0;
    const mockDb = {
      getLastSession() {
        const all = [...sessions.values()].sort((a, b) => b.updated_at - a.updated_at);
        return all[0] ?? undefined;
      },
      getSession(id) { return sessions.get(id); },
      createSession(fields) {
        const id = `s_${++lastId}`;
        const session = { id, ...fields, created_at: Date.now(), updated_at: Date.now() };
        sessions.set(id, session);
        return session;
      },
      updateDraft(id, json) {
        const s = sessions.get(id);
        if (s) { s.draft_json = json; s.updated_at = Date.now(); }
      },
      getCellGroups() { return {}; },
      setCellGroup() {},
      getCellGroupFps() { return {}; },
      getCellGroupDirections() { return {}; },
      getShapeGroups() { return {}; },
    };
    state = { project: null, sessionId: null, db: mockDb };
    serverInfo = await startWebServer(state, 0);
    port = serverInfo.port;
  });

  afterAll(async () => {
    serverInfo.wss.close();
    await new Promise(r => serverInfo.httpServer.close(r));
    fs.rmSync(tmpCwd, { recursive: true, force: true });
    fs.rmSync(tmpDest, { recursive: true, force: true });
  });

  async function cli(opts, ...args) {
    const { stdout, stderr } = await exec(process.execPath, [SPRITE_JS, ...args], {
      cwd: opts.cwd ?? process.cwd(),
      env: { ...process.env, SPRITE_PORT: String(port) },
      timeout: 15000,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  }

  test('destination defaults to the CLI cwd, not the server cwd', async () => {
    await cli({ cwd: tmpCwd }, 'new', 'cwdproj', '--size', '16', '--rows', '1', '--cols', '1', '--palette', 'pico8');
    const session = [...sessions.values()].find(s => s.project_name === 'cwdproj');
    expect(session.destination_folder).toBe(join(tmpCwd, 'assets', 'claude-sprites', 'cwdproj'));
    expect(session.project_path).toBe(tmpCwd);
  });

  test('--dest overrides the destination parent folder', async () => {
    await cli({ cwd: tmpCwd }, 'new', 'destproj', '--size', '16', '--dest', tmpDest, '--rows', '1', '--cols', '1', '--palette', 'pico8');
    const session = [...sessions.values()].find(s => s.project_name === 'destproj');
    expect(session.destination_folder).toBe(join(tmpDest, 'destproj'));
  });

  test('export --dest writes into exactly that folder for one export', async () => {
    await cli({}, 'draw', 'point', '--cell', '0,0', '--x', '1', '--y', '1', '--color', '#ff004d', '--name', 'dot');
    const oneOff = join(tmpDest, 'oneoff');
    const { stdout } = await cli({}, 'export', '--dest', oneOff);
    expect(stdout).toMatch(/oneoff/);
    expect(fs.existsSync(join(oneOff, 'destproj.png'))).toBe(true);
    expect(fs.existsSync(join(oneOff, 'destproj.atlas.json'))).toBe(true);
  });
});
