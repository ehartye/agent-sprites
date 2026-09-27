import { beforeEach, afterEach, describe, expect, test } from 'vitest';
import { SessionDB } from '../../server/db/session.js';
import { startWebServer } from '../../server/web/http.js';
import { Project } from '../../server/engine/project.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCanvas } from 'canvas';
import { request as httpRequest } from 'node:http';
import { localFileRequestAllowed } from '../../server/web/api/workbench-routes.js';

describe('collaborative workbench', () => {
  let state, server, base, temp;
  beforeEach(async () => {
    state = { db: new SessionDB(':memory:'), project: null, sessionId: null };
    temp = mkdtempSync(join(tmpdir(), 'sprite-workbench-'));
    server = await startWebServer(state, 0);
    base = `http://localhost:${server.port}`;
  });
  afterEach(async () => {
    server.wss.close();
    await new Promise(resolve => server.httpServer.close(resolve));
    state.db.close();
    rmSync(temp, { recursive: true, force: true });
  });
  async function api(path, body) {
    const response = await fetch(`${base}/api/${path}`, body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return response.json();
  }
  async function make() {
    await api('session/new', { name: 'Original', rows: 1, cols: 2 });
    await api('draw', { type: 'rect', cell: '0,0', shape_name: 'body', color: 'red', x: 1, y: 1, w: 3, h: 4, filled: true });
    await api('group/cell/create', { name: 'idle', cells: ['0,0','0,1'], fps: 6 });
    await api('group/shape/create', { cell: '0,0', name: 'figure', shapes: ['body'] });
    return state.sessionId;
  }
  test('copy makes an independent editable session, preserving groups and never reusing its save path', async () => {
    const original = await make();
    state.db.updateSession(original, { json_file: 'original.project.json' });
    const copy = await api('session/copy', { name: 'Exploration' });
    expect(copy.ok).toBe(true);
    expect(state.sessionId).not.toBe(original);
    expect(state.db.getSession(state.sessionId).json_file).toBeNull();
    expect(state.db.getCellGroups(state.sessionId)).toEqual({ idle: ['0,0','0,1'] });
    expect(state.db.getCellGroupFps(state.sessionId)).toEqual({ idle: 6 });
    expect(state.db.getShapeGroups(state.sessionId, '0,0')).toEqual({ figure: ['body'] });
    await api('shape/recolor', { cell: '0,0', name: 'body', color: 'blue' });
    await api('session/open-session', { ref: original });
    expect(state.project.cells.getCell('0,0').shapes.getByName('body').color).toBe('red');
  });
  test('portable handoff retains review context across import and session switching', async () => {
    const original = await make();
    expect((await api('workbench/handoff', { note: 'Keep the continuous outline; try a cooler shirt.', cell: '0,0', author: 'Artist' })).ok).toBe(true);
    const packet = await api('workbench/project');
    expect(packet.data.review.note).toContain('continuous outline');
    const imported = await api('session/import', { project: packet.data, name: 'Agent pass' });
    expect(imported.ok).toBe(true);
    expect(state.sessionId).not.toBe(original);
    expect(state.project.toJSON().review.note).toContain('continuous outline');
    await api('session/open-session', { ref: original });
    expect((await api('workbench/project')).data.review.author).toBe('Artist');
    expect(Project.fromJSON(packet.data).toJSON().review).toEqual(packet.data.review);
  });
  test('rejects malformed imports before replacing the current project', async () => {
    const original = await make();
    expect((await api('session/import', { project: { name: 'bad', grid: { rows: Infinity, cols: 1 } } })).ok).toBe(false);
    expect(state.sessionId).toBe(original);
    expect((await api('session/copy', { name: '../escape' })).ok).toBe(false);
  });
  test('imports valid large grids without legacy grid, cell-size, or pixel-budget caps', async () => {
    for(const dimensions of [{cellWidth:8,cellHeight:12,rows:12,cols:11},{cellWidth:8192,cellHeight:8,rows:1,cols:1},{cellWidth:4096,cellHeight:4096,rows:2,cols:2}]){
      const project=Project.create({name:'Large atlas',palette:'pico8',...dimensions}).toJSON();
      const result=await api('session/import',{project});expect(result.ok,result.error).toBe(true);
      expect(state.project.cells.rows).toBe(dimensions.rows);expect(state.project.cellWidth).toBe(dimensions.cellWidth);
    }
    const original=state.sessionId,invalid=state.project.toJSON();invalid.grid.rows=Number.MAX_SAFE_INTEGER;
    expect((await api('session/import',{project:invalid})).ok).toBe(false);expect(state.sessionId).toBe(original);
  });
  test('all preset palettes are available together with the active custom palette', async () => {
    await make();
    const palettes = await api('workbench/palettes');
    expect(palettes.ok).toBe(true);
    expect(palettes.data.presets.map(p => p.name)).toEqual(expect.arrayContaining(['pico8','nes','gameboy','db-16','db-32']));
    expect(palettes.data.current.find(c => c.name === 'red').color).toBe('#ff004d');
  });
  test('skin tone selection updates role groups in the draft and persists through session copy', async () => {
    await make();
    await api('group/shape/create', { cell: '0,0', name: 'skin-base', shapes: ['body'] });
    const result = await api('workbench/skin-tone', { tone: 'umber' });
    expect(result.ok).toBe(true);
    expect(state.project.cells.getCell('0,0').shapes.getByName('body').color).toBe('#80362d');
    const palettes = await api('workbench/palettes');
    expect(palettes.data.skinTones).toMatchObject({ supported: true, selected: 'umber' });
    expect(palettes.data.skinTones.presets).toHaveLength(7);
    const saved = JSON.parse(state.db.getSession(state.sessionId).draft_json);
    expect(saved.cells['0,0'].shapes.find(s => s.name === 'body').color).toBe('#80362d');
    await api('session/copy', { name: 'Tone copy' });
    expect((await api('workbench/palettes')).data.skinTones.selected).toBe('umber');
    expect((await api('workbench/skin-tone', { tone: 'bad' })).ok).toBe(false);
  });
  test('metadata restore failure does not activate or retain a half-imported session', async () => {
    const original = await make();
    const count = state.db.listSessions().length;
    const project = state.project.toJSON();
    project.shapeGroups = { '0,0': null };
    expect((await api('session/import', { project, name: 'Bad metadata' })).ok).toBe(false);
    expect(state.sessionId).toBe(original);
    expect(state.project.name).toBe('Original');
    expect(state.db.listSessions()).toHaveLength(count);
  });
  test('guarded workbench edits reject a stale active session instead of changing another design', async () => {
    const original = await make();
    await api('session/new', { name: 'Other' });
    const response = await fetch(`${base}/api/shape/recolor`, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Sprite-Session': original,
    }, body: JSON.stringify({ cell: '0,0', name: 'body', color: 'blue' }) });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('session changed');
    const download = await fetch(`${base}/api/workbench/sheet.png`, { headers: { 'X-Sprite-Session': original } });
    expect(download.status).toBe(409);
  });
  test('trace and verify run in isolation and expose an editable generated project', async () => {
    const original = await make();
    const input = join(temp, 'source.png');
    const canvas = createCanvas(4, 4); const ctx = canvas.getContext('2d'); ctx.fillStyle = '#112233'; ctx.fillRect(0, 0, 4, 4);
    writeFileSync(input, canvas.toBuffer('image/png'));
    const trace = await api('workbench/trace', { path: input, out: join(temp, 'trace'), name: 'traced-design' });
    expect(trace.ok, JSON.stringify(trace)).toBe(true);
    expect(trace.data.differingPixels).toBe(0);
    expect(state.sessionId).toBe(original);
    expect((await api('workbench/verify', { path: trace.data.artifacts.atlas })).data.ok).toBe(true);
    expect((await api('workbench/trace', { path: input, out: join(temp, 'trace') })).ok).toBe(false);
    expect(state.sessionId).toBe(original);
    expect((await api('session/open', { path: trace.data.artifacts.project })).ok).toBe(true);
    expect(state.project.name).toBe('traced-design');
  });
  test('offline file operations reject foreign origins and hostnames', async () => {
    for (const headers of [{ Origin: 'https://other.example' }, { Origin: 'null' }]) {
      const response = await fetch(`${base}/api/workbench/build`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ path: '/missing' }) });
      expect(response.status, JSON.stringify(headers) + await response.text()).toBe(403);
    }
    const badHost = await new Promise((resolve, reject) => {
      const req = httpRequest(`${base}/api/workbench/build`, { method: 'POST', headers: { Host: 'other.example', 'Content-Type': 'application/json' } }, response => { response.resume(); resolve(response.statusCode); });
      req.on('error', reject); req.end(JSON.stringify({ path: '/missing' }));
    });
    expect(badHost).toBe(403);
    expect(localFileRequestAllowed({ socket: { remoteAddress: '192.168.1.5' }, get: () => 'localhost' })).toBe(false);
  });
  test('build publishes artifacts without replacing the active session', async () => {
    const original = await make();
    writeFileSync(join(temp, 'ops.json'), JSON.stringify([{ command: 'new', name: 'built', size: 8, rows: 1, cols: 1 }, { command: 'draw', type: 'point', cell: '0,0', x: 2, y: 2, color: '#000000' }]));
    const config = join(temp, 'build.json');
    writeFileSync(config, JSON.stringify({ version: 1, ops: 'ops.json', output: 'dist' }));
    const result = await api('workbench/build', { path: config });
    expect(result.data.ok).toBe(true);
    expect(result.data.artifacts.project).toContain('built.project.json');
    expect(state.sessionId).toBe(original);
  });
});
