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

describe('CLI sessions / open --session', () => {
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

  test('sessions lists projects, and open --session restores an earlier one', async () => {
    await cli('new', 'first', '--size', '16', '--rows', '1', '--cols', '2', '--palette', 'pico8');
    await cli('draw', 'circle', '--cell', '0,0', '--cx', '8', '--cy', '8', '--r', '4', '--color', '#ff004d', '--name', 'orb');
    await cli('group', 'create', 'spin', '0,0', '0,1');

    await cli('new', 'second', '--size', '16', '--rows', '1', '--cols', '1', '--palette', 'pico8');
    await cli('draw', 'point', '--cell', '0,0', '--x', '1', '--y', '1', '--color', '#29adff', '--name', 'dot');

    const { stdout: list } = await cli('sessions');
    expect(list).toMatch(/first/);
    expect(list).toMatch(/second/);

    const { stdout: opened } = await cli('open', '--session', 'first');
    expect(opened).toMatch(/first/);

    // the first project's shape is live again
    const r = await fetch(`http://localhost:${port}/api/shapes?cell=0,0`);
    const shapes = (await r.json()).data;
    expect(shapes.find(s => s.name === 'orb')).toBeTruthy();

    // and its cell groups came back with it
    const g = await fetch(`http://localhost:${port}/api/group/cell/list`);
    expect((await g.json()).data).toHaveProperty('spin');
  });

  test('open --session with an unknown ref fails clearly', async () => {
    let err;
    try {
      await cli('open', '--session', 'no-such-project');
    } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(String(err.stderr || '')).toMatch(/no-such-project/);
  });
});
