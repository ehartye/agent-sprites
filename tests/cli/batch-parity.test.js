import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { startWebServer } from '../../server/web/http.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createCanvas } from 'canvas';
import fs from 'fs';
import os from 'os';

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

    const sessions = new Map();
    const cellGroups = new Map();
    const groupFps = new Map();
    const shapeGroups = new Map();
    let lastId = 0;
    const mockDb = {
      getLastSession() {
        const all = [...sessions.values()].sort((a, b) => b.updated_at - a.updated_at);
        return all[0] ?? undefined;
      },
      getSession(id) { return sessions.get(id); },
      createSession(fields) {
        const id = `s_${++lastId}`;
        const session = { id, ...fields, created_at: Date.now(), updated_at: Date.now() };
        sessions.set(id, session);
        return session;
      },
      updateSession(id, fields) {
        const s = sessions.get(id);
        if (s) Object.assign(s, fields, { updated_at: Date.now() });
      },
      updateDraft(id, json) {
        const s = sessions.get(id);
        if (s) { s.draft_json = json; s.updated_at = Date.now(); }
      },
      setCellGroup(sessionId, name, cells) { cellGroups.set(`${sessionId}/${name}`, cells); },
      deleteCellGroup(sessionId, name) { cellGroups.delete(`${sessionId}/${name}`); },
      getCellGroups(sessionId) {
        const out = {};
        for (const [k, v] of cellGroups) {
          const [sid, name] = k.split('/');
          if (sid === sessionId) out[name] = v;
        }
        return out;
      },
      setCellGroupFps(sessionId, name, fps) { groupFps.set(`${sessionId}/${name}`, fps); },
      getCellGroupFps(sessionId) {
        const out = {};
        for (const [k, v] of groupFps) {
          const [sid, name] = k.split('/');
          if (sid === sessionId) out[name] = v;
        }
        return out;
      },
      setShapeGroup(sessionId, cell, name, shapes) { shapeGroups.set(`${sessionId}/${cell}/${name}`, shapes); },
      getAllShapeGroups(sessionId) {
        const out = {};
        for (const [k, shapes] of shapeGroups) {
          const [sid, cell, name] = k.split('/');
          if (sid === sessionId) { out[cell] ??= {}; out[cell][name] = shapes; }
        }
        return out;
      },
      deleteShapeGroup(sessionId, cell, name) { shapeGroups.delete(`${sessionId}/${cell}/${name}`); },
      getShapeGroups(sessionId, cell) {
        const out = {};
        for (const [k, v] of shapeGroups) {
          const [sid, c, name] = k.split('/');
          if (sid === sessionId && c === cell) out[name] = v;
        }
        return out;
      },
    };
    state = { project: null, sessionId: null, db: mockDb };
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
});
