// @subject scripts/sprite.js
import { describe, test, expect, afterAll } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import net from 'net';

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

describe('sprite restart CLI', () => {
  let port;
  let baseUrl;

  afterAll(async () => {
    // Best-effort cleanup: if a server was spawned by the test, shut it down.
    if (baseUrl) {
      try { await fetch(`${baseUrl}/api/control/shutdown`, { method: 'POST' }); } catch {}
    }
  });

  test('runs to completion and prints restart confirmation', async () => {
    port = await pickPort();
    baseUrl = `http://localhost:${port}`;

    const { stdout, stderr } = await exec(process.execPath, [SPRITE_JS, 'restart'], {
      env: { ...process.env, SPRITE_PORT: String(port) },
      timeout: 15000,
    });

    // Tight assertion: "restarted" is the literal token emitted only after
    // respawn completes. Matching shutdown-path tokens alone would hide a
    // regression where shutdown succeeds but ensureServer() silently fails.
    expect(stdout).toMatch(/^restarted$/m);
  }, 20000);
});
