import { beforeEach, afterEach, describe, expect, test } from 'vitest';
import { SessionDB } from '../../server/db/session.js';
import { startWebServer } from '../../server/web/http.js';
import { Project } from '../../server/engine/project.js';

describe('collaborative workbench', () => {
  let state, server, base;
  beforeEach(async () => {
    state = { db: new SessionDB(':memory:'), project: null, sessionId: null };
    server = await startWebServer(state, 0);
    base = `http://localhost:${server.port}`;
  });
  afterEach(async () => {
    server.wss.close();
    await new Promise(resolve => server.httpServer.close(resolve));
    state.db.close();
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
  test('all preset palettes are available together with the active custom palette', async () => {
    await make();
    const palettes = await api('workbench/palettes');
    expect(palettes.ok).toBe(true);
    expect(palettes.data.presets.map(p => p.name)).toEqual(expect.arrayContaining(['pico8','nes','gameboy','db-16','db-32']));
    expect(palettes.data.current.find(c => c.name === 'red').color).toBe('#ff004d');
  });
  test('guarded workbench edits reject a stale active session instead of changing another design', async () => {
    const original = await make();
    await api('session/new', { name: 'Other' });
    const response = await fetch(`${base}/api/shape/recolor`, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Sprite-Session': original,
    }, body: JSON.stringify({ cell: '0,0', name: 'body', color: 'blue' }) });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('session changed');
  });
});
