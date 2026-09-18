import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { startWebServer } from '../../server/web/http.js';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import os from 'os';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SPRITE_JS = join(__dirname, '..', '..', 'scripts', 'sprite.js');

describe('CLI batch mode', () => {
  let serverInfo;
  let state;
  let port;
  let tmpDir;

  beforeAll(async () => {
    tmpDir = join(os.tmpdir(), `sprites-batch-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    const sessions = new Map();
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
      getCellGroups() { return {}; },
      setCellGroup() {},
    };
    state = { project: null, sessionId: null, db: mockDb };
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

  test('batch executes commands from JSON file', async () => {
    // First create a project
    await cli('new', 'batchtest', '--size', '16', '--rows', '2', '--cols', '4', '--palette', 'pico8');

    const commands = [
      { command: 'draw', type: 'circle', cell: '0,0', cx: 8, cy: 8, r: 4, color: '#ff004d', name: 'ball' },
      { command: 'draw', type: 'rect', cell: '0,0', x: 0, y: 12, w: 16, h: 4, color: '#008751', name: 'ground' },
    ];

    const batchFile = join(tmpDir, 'commands.json');
    fs.writeFileSync(batchFile, JSON.stringify(commands));

    const { stdout } = await cli('batch', batchFile);
    expect(stdout).toContain('[1/2]');
    expect(stdout).toContain('[2/2]');
    expect(stdout).toContain('Done: 2/2 succeeded');
  });

  test('batch reports progress for each command', async () => {
    const commands = [
      { command: 'draw', type: 'point', cell: '0,0', x: 0, y: 0, color: '#ff004d', name: 'p1' },
      { command: 'draw', type: 'point', cell: '0,0', x: 1, y: 1, color: '#29adff', name: 'p2' },
      { command: 'draw', type: 'point', cell: '0,0', x: 2, y: 2, color: '#00e436', name: 'p3' },
    ];

    const batchFile = join(tmpDir, 'progress.json');
    fs.writeFileSync(batchFile, JSON.stringify(commands));

    const { stdout } = await cli('batch', batchFile);
    expect(stdout).toContain('[1/3]');
    expect(stdout).toContain('[2/3]');
    expect(stdout).toContain('[3/3]');
    expect(stdout).toContain('Done: 3/3 succeeded');
  });

  test('batch stops on error by default', async () => {
    const commands = [
      { command: 'draw', type: 'point', cell: '0,0', x: 3, y: 3, color: '#ff004d', name: 'ok1' },
      { command: 'draw', type: 'hexagon', cell: '0,0', color: '#ff004d' },
      { command: 'draw', type: 'point', cell: '0,0', x: 4, y: 4, color: '#ff004d', name: 'never' },
    ];

    const batchFile = join(tmpDir, 'error.json');
    fs.writeFileSync(batchFile, JSON.stringify(commands));

    try {
      await cli('batch', batchFile);
      expect.unreachable('Should have thrown');
    } catch (e) {
      // Exit code should be 1
      expect(e.code).toBe(1);
      // Should show progress up to the failure
      expect(e.stdout).toContain('[1/3]');
      expect(e.stdout).toContain('[2/3]');
      // Should NOT have reached command 3
      expect(e.stdout).not.toContain('[3/3]');
      // Structured stderr: "ERROR at op N/M: <label> — <message>"
      expect(e.stderr).toMatch(/ERROR at op 2\/3: .+ — .+/);
    }
  });

  test('batch --continue-on-error keeps going after failure', async () => {
    const commands = [
      { command: 'draw', type: 'point', cell: '0,0', x: 5, y: 5, color: '#ff004d', name: 'ok_a' },
      { command: 'draw', type: 'hexagon', cell: '0,0', color: '#ff004d' },
      { command: 'draw', type: 'point', cell: '0,0', x: 6, y: 6, color: '#ff004d', name: 'ok_b' },
    ];

    const batchFile = join(tmpDir, 'continue.json');
    fs.writeFileSync(batchFile, JSON.stringify(commands));

    const error = await cli('batch', batchFile, '--continue-on-error', 'true').catch(e => e);
    expect(error.code).toBe(1);
    const { stdout } = error;
    expect(stdout).toContain('[1/3]');
    expect(stdout).toContain('[2/3]');
    expect(stdout).toContain('[3/3]');
    expect(stdout).toContain('2/3 succeeded');
    expect(stdout).toContain('1 failed');
  });

  test('batch supports copy command', async () => {
    const commands = [
      { command: 'copy', from: '0,0', to: '0,1' },
    ];
    const batchFile = join(tmpDir, 'copy.json');
    fs.writeFileSync(batchFile, JSON.stringify(commands));

    const { stdout } = await cli('batch', batchFile);
    expect(stdout).toContain('[1/1]');
    expect(stdout).toContain('Done: 1/1 succeeded');
  });

  test('batch supports group create command', async () => {
    const commands = [
      { command: 'group', sub: 'create', name: 'walk', cells: ['0,0', '0,1'] },
    ];
    const batchFile = join(tmpDir, 'group.json');
    fs.writeFileSync(batchFile, JSON.stringify(commands));

    const { stdout } = await cli('batch', batchFile);
    expect(stdout).toContain('Done: 1/1 succeeded');
  });

  test('batch supports move-to command', async () => {
    const commands = [
      { command: 'move-to', shape: 'ball', cell: '0,0', x: 4, y: 4 },
    ];
    const batchFile = join(tmpDir, 'moveto.json');
    fs.writeFileSync(batchFile, JSON.stringify(commands));

    const { stdout } = await cli('batch', batchFile);
    expect(stdout).toContain('Done: 1/1 succeeded');
  });

  test('batch --vars substitutes placeholders in ops', async () => {
    const commands = [
      { command: 'draw', type: 'rect', cell: '{{cell}}', x: '{{x}}', y: 0, w: 2, h: 2, color: '#ffffff', name: 'vr1' },
    ];
    const batchFile = join(tmpDir, 'vars.json');
    fs.writeFileSync(batchFile, JSON.stringify(commands));

    const { stdout } = await cli('batch', batchFile, '--vars', 'cell=0,0,x=5');
    expect(stdout).toContain('Done: 1/1 succeeded');

    const shapes = await cli('shapes', '--cell', '0,0');
    expect(shapes.stdout).toContain('vr1');
  });

  test('batch --vars errors on undefined placeholder', async () => {
    const commands = [
      { command: 'draw', type: 'rect', cell: '0,0', x: '{{missing}}', y: 0, w: 2, h: 2, color: '#ffffff', name: 'xfail' },
    ];
    const batchFile = join(tmpDir, 'vars-missing.json');
    fs.writeFileSync(batchFile, JSON.stringify(commands));

    try {
      await cli('batch', batchFile, '--vars', 'cell=0,0');
      expect.unreachable('should have failed');
    } catch (e) {
      expect(e.code).toBe(1);
      expect(e.stderr).toMatch(/variable ['"]missing['"] not defined/);
    }
  });

  test('batch --vars-file iterates ops per frame dict', async () => {
    const ops = [
      { command: 'draw', type: 'rect', cell: '{{cell}}', x: 0, y: 0, w: '{{w}}', h: '{{w}}', color: '#ffffff', name: '{{tag}}' },
    ];
    const frames = [
      { cell: '0,2', w: 3, tag: 'frame_a' },
      { cell: '0,3', w: 5, tag: 'frame_b' },
    ];
    const opsFile = join(tmpDir, 'vf-ops.json');
    const framesFile = join(tmpDir, 'vf-frames.json');
    fs.writeFileSync(opsFile, JSON.stringify(ops));
    fs.writeFileSync(framesFile, JSON.stringify(frames));

    const { stdout } = await cli('batch', opsFile, '--vars-file', framesFile);
    expect(stdout).toContain('Done: 2/2 succeeded');

    const sA = await cli('shapes', '--cell', '0,2');
    expect(sA.stdout).toContain('frame_a');
    const sB = await cli('shapes', '--cell', '0,3');
    expect(sB.stdout).toContain('frame_b');
  });

  test('batch --vars-file rejects non-array file', async () => {
    const opsFile = join(tmpDir, 'vf-ops2.json');
    const badFile = join(tmpDir, 'vf-bad.json');
    fs.writeFileSync(opsFile, JSON.stringify([{ command: 'draw', type: 'point', cell: '0,0', x: 0, y: 0, color: '#fff', name: 'p' }]));
    fs.writeFileSync(badFile, JSON.stringify({ cell: '0,0' }));

    try {
      await cli('batch', opsFile, '--vars-file', badFile);
      expect.unreachable('should have failed');
    } catch (e) {
      expect(e.code).toBe(1);
      expect(e.stderr).toMatch(/vars-file.*array/i);
    }
  });

  test('batch reads from stdin with --stdin flag', async () => {
    const commands = [
      { command: 'draw', type: 'point', cell: '0,0', x: 7, y: 7, color: '#ff004d', name: 'stdin_pt' },
    ];

    const stdout = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [SPRITE_JS, 'batch', '--stdin', 'true'], {
        env: { ...process.env, SPRITE_PORT: String(port) },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let out = '';
      let err = '';
      child.stdout.on('data', d => out += d);
      child.stderr.on('data', d => err += d);
      child.on('close', code => {
        if (code !== 0) reject(new Error(`Exit ${code}: ${err}`));
        else resolve(out);
      });
      child.stdin.write(JSON.stringify(commands));
      child.stdin.end();
    });
    expect(stdout.trim()).toContain('Done: 1/1 succeeded');
  }, 15000);
});
