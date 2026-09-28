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

describe('CLI view-anim', () => {
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

  test('setup project and group for animation tests', async () => {
    await cli('new', 'animtest', '--size', '16', '--rows', '2', '--cols', '4', '--palette', 'pico8');
    await cli('draw', 'circle', '--cell', '0,0', '--cx', '8', '--cy', '8', '--r', '4', '--color', '#ff004d', '--name', 'ball');
    await cli('draw', 'circle', '--cell', '0,1', '--cx', '8', '--cy', '4', '--r', '4', '--color', '#ff004d', '--name', 'ball');
    await cli('group', 'create', 'bounce', '0,0', '0,1');
    const { stdout } = await cli('group', 'list');
    expect(stdout).toContain('bounce');
  });

  test('view-anim runs 1 loop and exits', async () => {
    const { stdout } = await cli('view-anim', 'bounce', '--loops', '1', '--fps', '30');
    // Should contain frame counter
    expect(stdout).toContain('Frame');
    // Should contain ANSI content or block characters
    expect(stdout.length).toBeGreaterThan(50);
  });

  test('view-anim shows frame count', async () => {
    const { stdout } = await cli('view-anim', 'bounce', '--loops', '1', '--fps', '30');
    // Frame 1/2 and Frame 2/2
    expect(stdout).toContain('Frame 1/2');
    expect(stdout).toContain('Frame 2/2');
  });

  test('view-anim shows group name in footer', async () => {
    const { stdout } = await cli('view-anim', 'bounce', '--loops', '1', '--fps', '30');
    expect(stdout).toContain('bounce');
  });

  test('view-anim fails for nonexistent group', async () => {
    try {
      await cli('view-anim', 'nonexistent', '--loops', '1');
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e.stderr).toBeTruthy();
    }
  });
});
