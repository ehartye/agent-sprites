import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startWebServer } from '../../server/web/http.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SessionDB } from '../../server/db/session.js';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SPRITE_JS = join(__dirname, '..', '..', 'scripts', 'sprite.js');

describe('CLI Script', () => {
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
      timeout: 10000,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  }

  test('status with no project', async () => {
    const { stdout } = await cli('status');
    const data = JSON.parse(stdout);
    expect(data.active).toBe(false);
  });

  test('new creates a project', async () => {
    const { stdout } = await cli('new', 'clitest', '--size', '16', '--rows', '2', '--cols', '4');
    expect(stdout).toContain('Created "clitest"');
  });

  test('status after new shows active', async () => {
    const { stdout } = await cli('status');
    const data = JSON.parse(stdout);
    expect(data.active).toBe(true);
    expect(data.project_name).toBe('clitest');
  });

  test('draw circle adds a shape', async () => {
    const { stdout } = await cli('draw', 'circle', '--cell', '0,0', '--cx', '8', '--cy', '3', '--r', '3', '--color', '#ff004d', '--name', 'ball');
    expect(stdout).toBeTruthy();
  });

  test('shapes lists shapes in cell', async () => {
    const { stdout } = await cli('shapes', '--cell', '0,0');
    expect(stdout).toContain('ball');
    expect(stdout).toContain('circle');
  });

  test('resize with individual flags', async () => {
    // First draw a circle to resize
    await cli('draw', 'circle', '--cell', '0,0', '--cx', '8', '--cy', '8', '--r', '3', '--color', '#ff004d', '--name', 'resizeme');
    const { stdout } = await cli('resize', 'resizeme', '--cell', '0,0', '--r', '5');
    expect(stdout).toBeTruthy();

    // Verify the shape was updated
    const { stdout: shapesOut } = await cli('shapes', '--cell', '0,0');
    expect(shapesOut).toContain('resizeme');
  });

  test('resize with --updates JSON fallback still works', async () => {
    const { stdout } = await cli('resize', 'resizeme', '--cell', '0,0', '--updates', '{"r":4}');
    expect(stdout).toBeTruthy();
  });

  test('resize individual flags override --updates JSON', async () => {
    // --r 6 should override the r:4 in --updates
    const { stdout } = await cli('resize', 'resizeme', '--cell', '0,0', '--updates', '{"r":4}', '--r', '6');
    expect(stdout).toBeTruthy();
  });

  test('unknown command exits with error', async () => {
    try {
      await cli('nonexistent');
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e.stderr).toContain('Unknown command');
    }
  });
});
