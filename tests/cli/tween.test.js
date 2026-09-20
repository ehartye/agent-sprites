import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { startWebServer } from '../../server/web/http.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SPRITE_JS = join(__dirname, '..', '..', 'scripts', 'sprite.js');

describe('CLI tween', () => {
  let serverInfo;
  let state;
  let port;

  beforeAll(async () => {
    const sessions = new Map();
    const cellGroups = new Map();
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
      setCellGroupFps() {},
      getCellGroupFps() { return {}; },
      getShapeGroups() { return {}; },
    };
    state = { project: null, sessionId: null, db: mockDb };
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

  async function shapeParams(cell, name) {
    const r = await fetch(`http://localhost:${port}/api/shapes?cell=${cell}`);
    const json = await r.json();
    return json.data.find(s => s.name === name)?.params;
  }

  test('tweens position linearly across a group', async () => {
    await cli('new', 'tweentest', '--size', '16', '--rows', '1', '--cols', '4', '--palette', 'pico8');
    await cli('draw', 'circle', '--cell', '0,0', '--cx', '2', '--cy', '8', '--r', '2', '--color', '#ff004d', '--name', 'ball');
    await cli('clone-cell', '--from', '0,0', '--to', '0,1 0,2 0,3');
    await cli('group', 'create', 'fly', '0,0', '0,1', '0,2', '0,3');

    const { stdout } = await cli('tween', 'ball', '--group', 'fly', '--to', '12,8');
    expect(stdout).toMatch(/4 frames/);

    expect((await shapeParams('0,0', 'ball')).cx).toBe(2);
    expect((await shapeParams('0,1', 'ball')).cx).toBe(5);  // 2 + 10/3 ≈ 5.33 -> 5
    expect((await shapeParams('0,2', 'ball')).cx).toBe(9);  // 2 + 20/3 ≈ 8.67 -> 9
    expect((await shapeParams('0,3', 'ball')).cx).toBe(12);
    expect((await shapeParams('0,3', 'ball')).cy).toBe(8);
  });

  test('tweens shape params with --to-updates', async () => {
    await cli('tween', 'ball', '--group', 'fly', '--to-updates', '{"r":5}');
    expect((await shapeParams('0,0', 'ball')).r).toBe(2);
    expect((await shapeParams('0,1', 'ball')).r).toBe(3);
    expect((await shapeParams('0,2', 'ball')).r).toBe(4);
    expect((await shapeParams('0,3', 'ball')).r).toBe(5);
  });

  test('ease in front-loads slow movement', async () => {
    await cli('tween', 'ball', '--group', 'fly', '--from', '2,8', '--to', '12,8', '--ease', 'in');
    // t^2 easing: 2, 2+10/9≈3.1->3, 2+40/9≈6.4->6, 12
    expect((await shapeParams('0,1', 'ball')).cx).toBe(3);
    expect((await shapeParams('0,2', 'ball')).cx).toBe(6);
  });

  test('fails clearly when the shape is missing from the group frames', async () => {
    let err;
    try {
      await cli('tween', 'ghost', '--group', 'fly', '--to', '5,5');
    } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(String(err.stderr || err.message)).toMatch(/ghost/);
  });

  test('morphs polygon vertices through JSON flags', async () => {
    await cli('draw', 'polygon', '--cell', '0,0', '--points', '1,1 10,1 6,10', '--color', '#ffffff', '--name', 'fish');
    await cli('clone-cell', '--from', '0,0', '--to', '0,1 0,2 0,3');
    const end = [{ x: 4, y: 4 }, { x: 13, y: 7 }, { x: 6, y: 13 }];
    await cli('tween', 'fish', '--group', 'fly', '--to-updates', JSON.stringify({ points: end }));
    expect((await shapeParams('0,1', 'fish')).points).toEqual([{ x: 2, y: 2 }, { x: 11, y: 3 }, { x: 6, y: 11 }]);
    expect((await shapeParams('0,3', 'fish')).points).toEqual(end);
  });
});
