import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { startWebServer } from '../../server/web/http.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import os from 'os';
import { SessionDB } from '../../server/db/session.js';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SPRITE_JS = join(__dirname, '..', '..', 'scripts', 'sprite.js');

describe('CLI export destination control', () => {
  let serverInfo;
  let state;
  let port;
  let tmpCwd;
  let tmpDest;

  beforeAll(async () => {
    tmpCwd = fs.mkdtempSync(join(os.tmpdir(), 'sprites-cwd-'));
    tmpDest = fs.mkdtempSync(join(os.tmpdir(), 'sprites-dest-'));
    const sessionDb = new SessionDB(':memory:');
    state = { project: null, sessionId: null, db: sessionDb };
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
    const session = state.db.findSessionByName('cwdproj');
    expect(session.destination_folder).toBe(join(tmpCwd, 'assets', 'claude-sprites', 'cwdproj'));
    expect(session.project_path).toBe(tmpCwd);
  });

  test('--dest overrides the destination parent folder', async () => {
    await cli({ cwd: tmpCwd }, 'new', 'destproj', '--size', '16', '--dest', tmpDest, '--rows', '1', '--cols', '1', '--palette', 'pico8');
    const session = state.db.findSessionByName('destproj');
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

  test('export --trim true reaches the export route from the CLI and from batch files', async () => {
    const trimmed = join(tmpDest, 'trimmed');
    await cli({}, 'export', '--dest', trimmed, '--trim', 'true');
    const atlas = JSON.parse(fs.readFileSync(join(trimmed, 'destproj.atlas.json'), 'utf8'));
    expect(atlas.frames[0]).toMatchObject({ trimmed: true, spriteSourceSize: { x: 1, y: 1, w: 1, h: 1 } });
    const batched = join(tmpDest, 'batched');
    const ops = join(tmpCwd, 'export-ops.json');
    fs.writeFileSync(ops, JSON.stringify([{ command: 'export', dest: batched, trim: true }]));
    await cli({}, 'batch', ops);
    expect(JSON.parse(fs.readFileSync(join(batched, 'destproj.atlas.json'), 'utf8')).frames[0].trimmed).toBe(true);
  });
});
