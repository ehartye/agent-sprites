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

describe('CLI transforms (mirror / flip / rotate / rotate-cell)', () => {
  let serverInfo;
  let state;
  let port;
  let tmpDir;

  beforeAll(async () => {
    tmpDir = join(os.tmpdir(), `sprites-transforms-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const sessionDb = new SessionDB(':memory:');
    state = { project: null, sessionId: null, db: sessionDb };
    serverInfo = await startWebServer(state, 0);
    port = serverInfo.port;
  });

  afterAll(async () => {
    serverInfo.wss.close();
    await new Promise(r => serverInfo.httpServer.close(r));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function cli(...args) {
    const { stdout, stderr } = await exec(process.execPath, [SPRITE_JS, ...args], {
      env: { ...process.env, SPRITE_PORT: String(port) },
      timeout: 15000,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  }

  async function shapeParams(cell, name) {
    const r = await fetch(`http://localhost:${port}/api/shapes?cell=${cell}`);
    const json = await r.json();
    const shape = json.data.find(s => s.name === name);
    return shape?.params;
  }

  test('mirror flips a whole cell horizontally', async () => {
    await cli('new', 'transformtest', '--size', '16', '--rows', '2', '--cols', '2', '--palette', 'pico8');
    await cli('draw', 'point', '--cell', '0,0', '--x', '0', '--y', '7', '--color', '#ff004d', '--name', 'dot');
    await cli('mirror', '--cell', '0,0', '--axis', 'horizontal');
    const p = await shapeParams('0,0', 'dot');
    expect(p.x).toBe(15);
  });

  test('flip flips one shape about the cell', async () => {
    await cli('draw', 'point', '--cell', '0,1', '--x', '2', '--y', '3', '--color', '#ff004d', '--name', 'mark');
    await cli('flip', 'mark', '--cell', '0,1', '--axis', 'vertical', '--about', 'cell');
    const p = await shapeParams('0,1', 'mark');
    expect(p.y).toBe(12);
    expect(p.x).toBe(2);
  });

  test('rotate rotates one shape 90° about itself', async () => {
    await cli('draw', 'rect', '--cell', '1,0', '--x', '2', '--y', '4', '--w', '6', '--h', '2', '--color', '#ff004d', '--name', 'bar');
    await cli('rotate', 'bar', '--cell', '1,0', '--deg', '90');
    const p = await shapeParams('1,0', 'bar');
    expect(p.w).toBe(2);
    expect(p.h).toBe(6);
  });

  test('rotate-cell rotates every shape in a cell', async () => {
    await cli('draw', 'point', '--cell', '1,1', '--x', '3', '--y', '1', '--color', '#ff004d', '--name', 'pt');
    await cli('rotate-cell', '--cell', '1,1', '--deg', '90');
    const p = await shapeParams('1,1', 'pt');
    expect(p.x).toBe(14);
    expect(p.y).toBe(3);
  });

  test('batch supports flip and rotate ops', async () => {
    await cli('draw', 'rect', '--cell', '0,0', '--x', '1', '--y', '1', '--w', '4', '--h', '2', '--color', '#ff004d', '--name', 'slab');
    const ops = [
      { command: 'rotate', cell: '0,0', shape: 'slab', deg: 90 },
      { command: 'flip', cell: '0,0', shape: 'slab', axis: 'horizontal', about: 'cell' },
    ];
    const opsPath = join(tmpDir, 'transform-ops.json');
    fs.writeFileSync(opsPath, JSON.stringify(ops));
    const { stdout } = await cli('batch', opsPath);
    expect(stdout).toMatch(/2\/2 succeeded/);
    const p = await shapeParams('0,0', 'slab');
    expect(p.w).toBe(2);
    expect(p.h).toBe(4);
  });
});
