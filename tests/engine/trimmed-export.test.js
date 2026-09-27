import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadImage, createCanvas } from 'canvas';
import { Project } from '../../server/engine/project.js';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';
import { handleDraw } from '../../server/handlers/draw.js';
import { exportTrimmed } from '../../server/engine/trimmed-export.js';
import { verifyAtlasFile } from '../../server/engine/atlas-verifier.js';
import { buildProject } from '../../server/build/project-build.js';
import { SessionDB } from '../../server/db/session.js';
import { startWebServer } from '../../server/web/http.js';

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sprite-trim-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function lesson() {
  const state = { project: Project.create({ name: 'mondrian', cellSize: 16, rows: 2, cols: 2, palette: 'pico8' }), broadcast: () => {} };
  handleDraw(state, 'rect', { cell: '0,0', x: 3, y: 5, w: 4, h: 2, color: '#ff004d', shape_name: 'red' });
  handleDraw(state, 'point', { cell: '0,1', x: 15, y: 0, color: '#29adff', shape_name: 'blue' });
  handleDraw(state, 'rect', { cell: '1,0', x: 0, y: 0, w: 16, h: 16, color: '#ffec27', shape_name: 'full' });
  state.project.cells.getCell('0,0').name = 'red';
  state.project.pivot = { x: 8, y: 15 };
  return state.project;
}
const options = { imageName: 'mondrian.png', groups: { pulse: ['0,0', '0,1', '0,0'] }, fpsMap: { pulse: 5 }, directionMap: {} };

async function pixels(buffer) {
  const img = await loadImage(buffer), c = createCanvas(img.width, img.height), ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0); return { img, c };
}

test('trimmed frames carry opaque bounds and reconstruct every cell exactly', async () => {
  const project = lesson(), renderer = new CanvasRenderer(project.palette);
  const { png, atlas } = await exportTrimmed(project, renderer, options);
  const plain = project.exportAseprite(options);
  expect(atlas.frames.map(f => f.filename)).toEqual(plain.frames.map(f => f.filename));
  expect(atlas.meta.frameTags).toEqual(plain.meta.frameTags);
  expect(atlas.meta.slices).toEqual(plain.meta.slices); // pivot stays cell-relative
  const red = atlas.frames.find(f => f.filename === 'red');
  expect(red).toMatchObject({ trimmed: true, spriteSourceSize: { x: 3, y: 5, w: 4, h: 2 }, sourceSize: { w: 16, h: 16 } });
  expect(red.frame).toMatchObject({ w: 4, h: 2 });
  expect(atlas.frames[3]).toMatchObject({ trimmed: true, spriteSourceSize: { w: 1, h: 1 } }); // empty cell 1,1
  expect(atlas.frames[2]).toMatchObject({ trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 } });
  expect(atlas.meta.size.w * atlas.meta.size.h).toBeLessThan(plain.meta.size.w * plain.meta.size.h);
  const sheet = (await pixels(png)).c;
  expect([sheet.width, sheet.height]).toEqual([atlas.meta.size.w, atlas.meta.size.h]);
  // Placing each trimmed frame at its offset recreates the untrimmed cell render.
  const full = (await pixels(new CanvasRenderer(project.palette).renderSheet(project.cells, { gap: 0 }))).c;
  plain.frames.forEach((p, i) => {
    const t = atlas.frames[i], rebuilt = createCanvas(16, 16);
    rebuilt.getContext('2d').drawImage(sheet, t.frame.x, t.frame.y, t.frame.w, t.frame.h, t.spriteSourceSize.x, t.spriteSourceSize.y, t.frame.w, t.frame.h);
    const expected = full.getContext('2d').getImageData(p.frame.x, p.frame.y, 16, 16).data;
    expect(Buffer.from(rebuilt.getContext('2d').getImageData(0, 0, 16, 16).data)).toEqual(Buffer.from(expected));
  });
  writeFileSync(join(dir, 'mondrian.png'), png); writeFileSync(join(dir, 'mondrian.atlas.json'), JSON.stringify(atlas));
  const verified = await verifyAtlasFile(join(dir, 'mondrian.atlas.json'), { expectedTags: ['pulse'], expectedFrames: ['red'] });
  expect(verified.errors).toEqual([]);
});

test('trimming is refused on a chroma background, where every pixel is opaque', async () => {
  const project = lesson();
  project.background = { mode: 'chroma', color: '#00ff00' };
  await expect(exportTrimmed(project, new CanvasRenderer(project.palette, { background: project.background }), options)).rejects.toThrow(/transparent background/);
});

test('build config trim publishes a verified trimmed atlas; non-boolean trim is rejected', async () => {
  const ops = [{ command: 'new', name: 'dot', size: 16, rows: 1, cols: 2 }, { command: 'draw', type: 'point', cell: '0,0', name: 'p', x: 9, y: 4, color: '#ffffff' }];
  writeFileSync(join(dir, 'ops.json'), JSON.stringify(ops));
  const config = join(dir, 'sprite-project.json');
  writeFileSync(config, JSON.stringify({ version: 1, ops: 'ops.json', output: 'dist', scale: 1, trim: true }));
  const result = await buildProject(config);
  expect(result.errors).toEqual([]);
  const atlas = JSON.parse(readFileSync(result.artifacts.atlas, 'utf8'));
  expect(atlas.frames[0]).toMatchObject({ trimmed: true, spriteSourceSize: { x: 9, y: 4, w: 1, h: 1 } });
  writeFileSync(config, JSON.stringify({ version: 1, ops: 'ops.json', output: 'dist', scale: 1, trim: 'yes' }));
  const bad = await buildProject(config);
  expect(bad.ok).toBe(false);
  expect(bad.errors[0].message).toMatch(/trim must be true or false/);
}, 30000);

test('session export --trim writes a trimmed sheet to the destination', async () => {
  const db = new SessionDB(':memory:'), state = { db, project: null, sessionId: null };
  const server = await startWebServer(state, 0), url = `http://127.0.0.1:${server.port}`;
  const post = async (path, body) => (await fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  try {
    expect((await post('/api/session/new', { name: 'trimmy', rows: 1, cols: 1, size: 16, dest: dir })).ok).toBe(true);
    expect((await post('/api/draw', { type: 'point', cell: '0,0', name: 'p', x: 2, y: 3, color: '#ffffff' })).ok).toBe(true);
    const res = await post('/api/session/export', { dest: dir, trim: true });
    expect(res.ok, res.error).toBe(true);
    const atlas = JSON.parse(readFileSync(join(dir, 'trimmy.atlas.json'), 'utf8'));
    expect(atlas.frames[0]).toMatchObject({ trimmed: true, spriteSourceSize: { x: 2, y: 3, w: 1, h: 1 } });
  } finally { server.wss.close(); await new Promise(r => { server.httpServer.close(r); server.httpServer.closeAllConnections?.(); }); db.close(); }
}, 30000);

test('UI builds reject trim because the UI runtime composites whole glyph cells', async () => {
  const config = join(dir, 'sprite-project.json');
  writeFileSync(config, JSON.stringify({ version: 1, output: 'dist', trim: true, ui: { name: 'f', kind: 'font', characters: ' A' } }));
  const result = await buildProject(config);
  expect(result.ok).toBe(false);
  expect(result.errors[0].message).toMatch(/trim is not supported for UI builds/);
}, 30000);
