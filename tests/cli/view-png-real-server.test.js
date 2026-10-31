// @subject server/index.js
// @subject scripts/sprite.js
import { describe, test, expect, afterAll } from 'vitest';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import net from 'net';
import fs from 'fs';
import { ownedChildProcess } from '../support/owned-child-process.js';
import { ownedCli } from '../support/owned-cli.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPRITE_JS = join(__dirname, '..', '..', 'scripts', 'sprite.js');
const SERVER_JS = join(__dirname, '..', '..', 'server', 'index.js');
const runtimeRoot = fs.realpathSync(join(__dirname, '..', '..'));
const version = JSON.parse(fs.readFileSync(join(runtimeRoot, 'package.json'), 'utf8')).version;

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
  let serverOwner;
  let cliOwner;

  afterAll(async () => {
    let cliFailure;
    try { await cliOwner?.close(); }
    catch (error) { cliFailure = error; throw error; }
    finally {
      try {
        if (serverOwner) {
          const result = await serverOwner.shutdown(async () => {
            const response = await fetch(`${baseUrl}/api/control/shutdown`, { method: 'POST', signal: AbortSignal.timeout(2000) });
            expect(response.ok).toBe(true);
            expect((await response.json()).ok).toBe(true);
          });
          // This describe hook finishes before setup-session-db's outer afterAll deletes the private DB.
          expect(result).toEqual({ code: 0, signal: null });
        }
      } catch (serverFailure) {
        if (cliFailure) throw new AggregateError([cliFailure, serverFailure], 'CLI and server cleanup failed');
        throw serverFailure;
      }
    }
  });

  test('cell and sheet PNG views write real files', async () => {
    port = await pickPort();
    baseUrl = `http://localhost:${port}`;
    const env = { ...process.env, SPRITE_PORT: String(port) };
    expect(env.SPRITE_DB_PATH).toMatch(/agent-sprites-tests-[^\\/]+[\\/]sessions\.db$/);
    cliOwner = ownedCli(process.execPath, [SPRITE_JS], { env, timeout: 20000 });
    serverOwner = ownedChildProcess(process.execPath, [SERVER_JS], { env, cwd: runtimeRoot });
    await serverOwner.waitUntilReady(async () => {
      let response;
      try { response = await fetch(`${baseUrl}/health`, { redirect: 'manual', signal: AbortSignal.timeout(500) }); }
      catch (error) { if (error.cause?.code === 'ECONNREFUSED') return false; throw error; }
      const identity = await response.json();
      expect(response.ok).toBe(true);
      expect(identity).toMatchObject({ ok: true, service: 'agent-sprites', protocol: 1, version, runtimeRoot });
      return true;
    }, { startupMessage: `Sprite editor: http://localhost:${port}` });
    const run = (...args) => cliOwner.run(...args);

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
