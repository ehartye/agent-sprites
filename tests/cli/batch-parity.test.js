import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { startWebServer } from '../../server/web/http.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createCanvas } from 'canvas';
import fs from 'fs';
import os from 'os';
import { SessionDB } from '../../server/db/session.js';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SPRITE_JS = join(__dirname, '..', '..', 'scripts', 'sprite.js');

describe('CLI batch parity (full pipeline in one ops file)', () => {
  let serverInfo;
  let state;
  let port;
  let tmp;
  let refPath;

  beforeAll(async () => {
    tmp = fs.mkdtempSync(join(os.tmpdir(), 'sprites-batchparity-'));
    const c = createCanvas(4, 4);
    c.getContext('2d').fillRect(0, 0, 4, 4);
    refPath = join(tmp, 'ref.png');
    fs.writeFileSync(refPath, c.toBuffer('image/png'));
    const sessionDb = new SessionDB(':memory:');
    state = { project: null, sessionId: null, db: sessionDb };
    serverInfo = await startWebServer(state, 0);
    port = serverInfo.port;
  });

  afterAll(async () => {
    serverInfo.wss.close();
    await new Promise(r => serverInfo.httpServer.close(r));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  async function cli(...args) {
    const { stdout, stderr } = await exec(process.execPath, [SPRITE_JS, ...args], {
      env: { ...process.env, SPRITE_PORT: String(port) },
      timeout: 20000,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  }

  test('a complete asset build runs as one batch file', async () => {
    const ops = [
      { command: 'new', name: 'batchproj', size: '8x8', rows: 1, cols: 2, palette: 'pico8', dest: tmp },
      { command: 'draw', type: 'circle', cell: '0,0', cx: 4, cy: 4, r: 3, color: '#ff004d', name: 'orb' },
      { command: 'clone-cell', from: '0,0', to: ['0,1'] },
      { command: 'group', sub: 'create', name: 'spin', cells: ['0,0', '0,1'], fps: 10 },
      { command: 'group', sub: 'fps', name: 'spin', fps: 12 },
      { command: 'shape-group', sub: 'create', cell: '0,0', name: 'bits', shapes: ['orb'] },
      { command: 'move-group', name: 'bits', cell: '0,0', dx: 1, dy: 0 },
      { command: 'tween', shape: 'orb', group: 'spin', to: '6,4', ease: 'linear' },
      { command: 'duplicate', shape: 'orb', cell: '0,0', as: 'orb2', mirror: 'horizontal' },
      { command: 'pivot', anchor: 'center' },
      { command: 'ref', sub: 'set', cell: '0,0', path: refPath, opacity: 0.4 },
      { command: 'ref', sub: 'clear', cell: '0,0' },
      { command: 'save' },
      { command: 'export' },
    ];
    const opsPath = join(tmp, 'build.json');
    fs.writeFileSync(opsPath, JSON.stringify(ops));

    const { stdout } = await cli('batch', opsPath);
    expect(stdout).toMatch(/14\/14 succeeded/);

    // export landed under --dest parent
    const atlas = JSON.parse(fs.readFileSync(join(tmp, 'batchproj', 'batchproj.atlas.json'), 'utf-8'));
    const tag = atlas.meta.frameTags.find(t => t.name === 'spin');
    expect(tag).toBeTruthy();
    expect(atlas.frames[tag.from].duration).toBe(Math.round(1000 / 12)); // group fps op applied
    expect(atlas.meta.slices[0].keys[0].pivot).toEqual({ x: 4, y: 4 });  // pivot center of 8x8

    // move-group applied (frame 0 keeps the tween start = its own position)
    const r = await fetch(`http://localhost:${port}/api/shapes?cell=0,0`);
    const orb = (await r.json()).data.find(s => s.name === 'orb');
    expect(orb.params.cx).toBe(5);

    // batched tween moved the last frame's copy to the target
    const r1 = await fetch(`http://localhost:${port}/api/shapes?cell=0,1`);
    const orb1 = (await r1.json()).data.find(s => s.name === 'orb');
    expect(orb1.params.cx).toBe(6);
    expect(orb1.params.cy).toBe(4);

    // batched duplicate --mirror produced the mirrored twin (8px cell: 7 - 5 = 2)
    const orb2 = (await (await fetch(`http://localhost:${port}/api/shapes?cell=0,0`)).json()).data.find(s => s.name === 'orb2');
    expect(orb2.params.cx).toBe(2);

    // save wrote the project file
    expect(fs.existsSync(join(tmp, 'batchproj', 'batchproj.json'))).toBe(true);
  });

  test('vertex morphs work in the batch pipeline', async () => {
    const end = [{ x: 4, y: 4 }, { x: 13, y: 7 }, { x: 6, y: 13 }];
    const ops = [
      { command: 'new', name: 'morphproj', size: 16, rows: 1, cols: 4, palette: 'pico8', dest: tmp },
      { command: 'draw', type: 'polyline', cell: '0,0', points: '1,1 10,1 6,10', color: '#ffffff', name: 'fin' },
      { command: 'clone-cell', from: '0,0', to: ['0,1', '0,2', '0,3'] },
      { command: 'group', sub: 'create', name: 'morph', cells: ['0,0', '0,1', '0,2', '0,3'] },
      { command: 'tween', shape: 'fin', group: 'morph', to_updates: { points: end } },
    ];
    const opsPath = join(tmp, 'morph.json');
    fs.writeFileSync(opsPath, JSON.stringify(ops));
    const { stdout } = await cli('batch', opsPath);
    expect(stdout).toMatch(/5\/5 succeeded/);
    const frame = await (await fetch(`http://localhost:${port}/api/shapes?cell=0,2`)).json();
    expect(frame.data.find(s => s.name === 'fin').params.points).toEqual([{ x: 3, y: 3 }, { x: 12, y: 5 }, { x: 6, y: 12 }]);
  });
});
