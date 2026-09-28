import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { startWebServer } from '../../server/web/http.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SessionDB } from '../../server/db/session.js';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SPRITE_JS = join(__dirname, '..', '..', 'scripts', 'sprite.js');

describe('CLI non-square cells', () => {
  let serverInfo;
  let state;
  let port;

  beforeAll(async () => {
    const sessionDb = new SessionDB(':memory:');
    state = { project: null, sessionId: null, db: sessionDb };
    serverInfo = await startWebServer(state, 0);
    port = serverInfo.port;
  });

  afterAll(async () => {
    serverInfo.wss.close();
    await new Promise(r => serverInfo.httpServer.close(r));
  });

  async function cli(...args) {
    const { stdout, stderr } = await exec(process.execPath, [SPRITE_JS, ...args], {
      env: { ...process.env, SPRITE_PORT: String(port) },
      timeout: 15000,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  }

  test('new accepts WxH size and the full stack honors both axes', async () => {
    const { stdout } = await cli('new', 'tallguy', '--size', '8x16', '--rows', '1', '--cols', '2', '--palette', 'pico8');
    expect(stdout).toMatch(/8x16px/);

    await cli('draw', 'point', '--cell', '0,0', '--x', '0', '--y', '15', '--color', '#ff004d', '--name', 'foot');
    await cli('mirror', '--cell', '0,0', '--axis', 'vertical');
    const r = await fetch(`http://localhost:${port}/api/shapes?cell=0,0`);
    const json = await r.json();
    expect(json.data.find(s => s.name === 'foot').params.y).toBe(0);
  });
});
