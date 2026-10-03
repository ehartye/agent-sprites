import { describe, test, expect, afterAll } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import net from 'net';
import fs from 'fs';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SPRITE_JS = join(__dirname, '..', '..', 'scripts', 'sprite.js');

async function pickPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// PNG views go through state.tmpDir, which only the REAL server entry point
// (server/index.js) is responsible for setting — the route tests inject a
// mock state, which is exactly how a missing tmpDir shipped unnoticed.
describe('view --png against the real server process', () => {
  let port;
  let baseUrl;

  afterAll(async () => {
    if (baseUrl) {
      try { await fetch(`${baseUrl}/api/control/shutdown`, { method: 'POST' }); } catch {}
    }
  });

  test('cell and sheet PNG views write real files', async () => {
    port = await pickPort();
    baseUrl = `http://localhost:${port}`;
    const env = { ...process.env, SPRITE_PORT: String(port) };
    expect(env.SPRITE_DB_PATH).toMatch(/agent-sprites-tests-/);
    const run = (...args) => exec(process.execPath, [SPRITE_JS, ...args], { env, timeout: 20000 });

    await run('new', 'tmpdirtest', '--size', '8', '--rows', '1', '--cols', '1', '--palette', 'pico8');
    expect(fs.existsSync(env.SPRITE_DB_PATH)).toBe(true);

    const cellOut = await run('view', '--cell', '0,0', '--png', 'true', '--scale', '4');
    const cellPath = JSON.parse(cellOut.stdout).path;
    expect(fs.existsSync(cellPath)).toBe(true);
    expect(fs.readFileSync(cellPath).readUInt32BE(16)).toBe(32); // 8 * 4

    const sheetOut = await run('view', '--sheet', 'true', '--scale', '2');
    const sheetPath = JSON.parse(sheetOut.stdout).path;
    expect(fs.existsSync(sheetPath)).toBe(true);
  }, 40000);
});
