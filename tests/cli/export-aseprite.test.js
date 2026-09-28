import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { startWebServer } from '../../server/web/http.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { SessionDB } from '../../server/db/session.js';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SPRITE_JS = join(__dirname, '..', '..', 'scripts', 'sprite.js');
const PROJECT_NAME = 'tmp-export-test';
const DEST = join(process.cwd(), 'assets', 'claude-sprites', PROJECT_NAME);

describe('CLI aseprite export (group fps, pivot, atlas)', () => {
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
    fs.rmSync(DEST, { recursive: true, force: true });
  });

  async function cli(...args) {
    const { stdout, stderr } = await exec(process.execPath, [SPRITE_JS, ...args], {
      env: { ...process.env, SPRITE_PORT: String(port) },
      timeout: 15000,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  }

  test('exports a gapless sheet PNG and an Aseprite atlas with tags, fps, and pivot', async () => {
    await cli('new', PROJECT_NAME, '--size', '16', '--rows', '2', '--cols', '2', '--palette', 'pico8');
    await cli('draw', 'circle', '--cell', '0,0', '--cx', '8', '--cy', '8', '--r', '5', '--color', '#ff004d', '--name', 'ball');
    await cli('group', 'create', 'walk', '0,0', '0,1', '--fps', '10');
    await cli('group', 'fps', 'walk', '12');
    await cli('pivot', '--anchor', 'bottom-center');

    const { stdout } = await cli('export');
    expect(stdout).toMatch(/atlas/);

    // Sheet PNG: gapless 2x2 grid of 16px cells = 32x32 (IHDR width/height at bytes 16..24)
    const png = fs.readFileSync(join(DEST, `${PROJECT_NAME}.png`));
    expect(png.readUInt32BE(16)).toBe(32);
    expect(png.readUInt32BE(20)).toBe(32);

    const atlas = JSON.parse(fs.readFileSync(join(DEST, `${PROJECT_NAME}.atlas.json`), 'utf-8'));
    expect(atlas.frames).toHaveLength(6); // 4 grid + 2 walk
    const tag = atlas.meta.frameTags.find(t => t.name === 'walk');
    expect(tag.from).toBe(4);
    expect(tag.to).toBe(5);
    expect(atlas.frames[4].duration).toBe(Math.round(1000 / 12)); // group fps updated to 12
    expect(atlas.meta.slices[0].keys[0].pivot).toEqual({ x: 8, y: 15 }); // bottom-center of 16x16
    expect(atlas.meta.image).toBe(`${PROJECT_NAME}.png`);
  });
});
