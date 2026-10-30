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

function pngDims(p) {
  const buf = fs.readFileSync(p);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe('CLI view --scale / view --sheet', () => {
  let serverInfo;
  let state;
  let port;

  beforeAll(async () => {
    const sessionDb = new SessionDB(':memory:');
    state = { project: null, sessionId: null, db: sessionDb, tmpDir: fs.mkdtempSync(join(os.tmpdir(), 'sprites-viewscale-cli-')) };
    serverInfo = await startWebServer(state, 0);
    port = serverInfo.port;
  });

  afterAll(async () => {
    serverInfo.wss.close();
    await new Promise(r => serverInfo.httpServer.close(r));
    fs.rmSync(state.tmpDir, { recursive: true, force: true });
  });

  async function cli(...args) {
    const { stdout, stderr } = await exec(process.execPath, [SPRITE_JS, ...args], {
      env: { ...process.env, SPRITE_PORT: String(port) },
      timeout: 15000,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  }

  test('view --png --scale writes an upscaled cell render', async () => {
    await cli('new', 'viewscale', '--size', '16', '--rows', '1', '--cols', '2', '--palette', 'pico8');
    const { stdout } = await cli('view', '--cell', '0,0', '--png', 'true', '--scale', '8');
    const { path } = JSON.parse(stdout);
    expect(pngDims(path)).toEqual({ w: 128, h: 128 });
  });

  test('view --sheet renders the whole sheet to a PNG path', async () => {
    const { stdout } = await cli('view', '--sheet', 'true', '--scale', '2');
    const { path } = JSON.parse(stdout);
    expect(pngDims(path)).toEqual({ w: 66, h: 32 });
  });

  test('bare --sheet followed by another flag parses as boolean true', async () => {
    const { stdout } = await cli('view', '--sheet', '--scale', '2');
    const { path } = JSON.parse(stdout);
    expect(pngDims(path)).toEqual({ w: 66, h: 32 });
  });

  test('view --out writes exactly where asked (and implies png)', async () => {
    const out = join(state.tmpDir, 'qa', 'cell-qa.png');
    const { stdout } = await cli('view', '--cell', '0,0', '--scale', '4', '--out', out);
    expect(JSON.parse(stdout).path).toBe(out);
    expect(pngDims(out)).toEqual({ w: 64, h: 64 });
  });
});
