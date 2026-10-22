import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { WebSocket } from 'ws';
import { SessionDB } from '../../server/db/session.js';
import { Project } from '../../server/engine/project.js';
import { startWebServer } from '../../server/web/http.js';
import { frameLimits } from '../../server/project-view.js';
import { Shape } from '../../server/engine/shape.js';

describe('progressive project protocol', () => {
  let state, server, base, sockets;
  beforeEach(async () => {
    const db = new SessionDB(':memory:');
    const session = db.createSession({ project_name: 'Small', project_path: '.', destination_folder: '.', draft_json: '{}' });
    state = { db, sessionId: session.id, persistDrafts: false,
      project: Project.create({ name: 'Small', cellSize: 8, rows: 1, cols: 3 }) };
    state.project.cells.getCell('0,0').draw('point', { x: 1, y: 2 }, '#ff0000', 'dot');
    sockets = [];
    server = await startWebServer(state, 0);
    base = `http://127.0.0.1:${server.port}`;
  });
  afterEach(async () => {
    for (const ws of sockets) ws.terminate();
    await server.dispose();
    await new Promise(resolve => server.wss.close(resolve));
    await new Promise(resolve => server.httpServer.close(resolve));
    state.db.close();
  });
  const receive = ws => new Promise((resolve, reject) => {
    ws.once('message', raw => resolve(JSON.parse(raw))); ws.once('error', reject);
  });
  async function connect(progressive = true) {
    const ws = new WebSocket(`${base.replace('http:', 'ws:')}/${progressive ? '?project=progressive-v1' : ''}`);
    sockets.push(ws); return { ws, initial: await receive(ws) };
  }
  async function api(path, body, headers = {}) {
    const res = await fetch(`${base}/api/${path}`, body === undefined ? { headers } : {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    return { status: res.status, ...await res.json() };
  }
  const pins = data => new URLSearchParams({ sessionId: data.sessionId, projectId: data.projectId, revision: data.revision });
  const summary = async () => (await api('workbench/project-summary')).data;
  async function restart(options) {
    await server.dispose();
    await new Promise(resolve => server.wss.close(resolve));
    await new Promise(resolve => server.httpServer.close(resolve));
    server = await startWebServer(state, 0, options); base = `http://127.0.0.1:${server.port}`;
  }

  test('connect and resync publish geometry-free summaries without serializing the project or replay', async () => {
    const serialize = vi.spyOn(state.project, 'toJSON');
    state.project.constructionReplay = { get poisonousGraph() { throw new Error('Replay traversed'); } };
    const { ws, initial } = await connect();
    expect(initial.type).toBe('project_summary');
    expect(initial.data).toMatchObject({ name: 'Small', sessionId: state.sessionId, version: 1,
      constructionReplayAvailable: true, cells: { '0,0': { shapeCount: 1 }, '0,1': { shapeCount: 0 } } });
    expect(initial.data.cells['0,0']).not.toHaveProperty('shapes');
    expect(initial.data).not.toHaveProperty('constructionReplay');
    const next = receive(ws); ws.send(JSON.stringify({ action: 'get_project' }));
    expect((await next).data).toEqual(initial.data);
    expect(await summary()).toEqual(initial.data);
    expect(serialize).not.toHaveBeenCalled();
  });

  test('frame reads require exact pins and return only selected complete cells including empty frames', async () => {
    const current = await summary();
    expect(current).toBeDefined();
    const response = await api(`workbench/frames?refs=0,0|0,1&${pins(current)}`);
    expect(response.ok).toBe(true);
    expect(Object.keys(response.data.cells)).toEqual(['0,0', '0,1']);
    expect(response.data.cells['0,0'].shapes).toHaveLength(1);
    expect(response.data.cells['0,1']).toEqual({ name: null, reference: null, shapes: [] });
    expect(response.data.cellVersions['0,0']).toBe(current.cellVersions['0,0']);
    expect(await summary()).toEqual(current);
  });

  test('rejects malformed, duplicate, excessive or unpinned requests before cell serialization', async () => {
    const current = await summary(); expect(current).toBeDefined();
    const serialize = vi.spyOn(state.project.cells.getCell('0,0'), 'toJSON');
    for (const refs of ['', '00,0', '0,00', 'dot', '0,3', '0,0|0,0', Array(9).fill('0,0').join('|')]) {
      expect((await api(`workbench/frames?refs=${refs}&${pins(current)}`)).status).toBe(400);
    }
    expect((await api('workbench/frames?refs=0,0')).status).toBe(400);
    expect((await api(`workbench/frames?refs=0,0&${pins({ ...current, revision: current.revision + 1 })}`)).status).toBe(409);
    expect((await api(`workbench/frames?refs=0,0&${pins(current)}&padding=${'x'.repeat(3000)}`)).status).toBe(400);
    expect(serialize).not.toHaveBeenCalled();
  });

  test('legacy sockets retain expanded project messages', async () => {
    const { initial } = await connect(false);
    expect(initial.type).toBe('project');
    expect(initial.data.cells['0,0'].shapes).toHaveLength(1);
  });

  test('progressive edits guard identity before mutation and invalidate only the edited frame', async () => {
    const { ws, initial } = await connect(), current = initial.data;
    const message = { action: 'draw', type: 'point', params: { cell: '0,1', x: 2, y: 2, color: '#fff' } };
    let next = receive(ws); ws.send(JSON.stringify(message));
    expect((await next).type).toBe('error');
    expect(state.project.cells.getCell('0,1').shapes._byId.size).toBe(0);
    const events = []; ws.on('message', raw => events.push(JSON.parse(raw)));
    next = receive(ws); ws.send(JSON.stringify({ ...message, ...Object.fromEntries(pins(current)) }));
    expect((await next).type).toBe('result');
    const changed = await summary();
    expect(changed.revision).toBeGreaterThan(current.revision);
    expect(changed.cellVersions['0,1']).toBeGreaterThan(current.cellVersions['0,1']);
    expect(changed.cellVersions['0,0']).toBe(current.cellVersions['0,0']);
    expect(events.some(event => event.type === 'draw')).toBe(false);
    next = receive(ws); ws.send(JSON.stringify({ ...message, ...Object.fromEntries(pins(current)) }));
    expect((await next).type).toBe('error');
    expect(state.project.cells.getCell('0,1').shapes._byId.size).toBe(1);
  });

  test('HTTP project pins reject partial or stale edits while legacy and current edits work', async () => {
    const current = await summary();
    const body = { type: 'point', cell: '0,1', x: 1, y: 1, color: '#fff' };
    expect((await api('draw', body, { 'X-Sprite-Project': current.projectId })).status).toBe(400);
    const headers = { 'X-Sprite-Session': current.sessionId, 'X-Sprite-Project': current.projectId, 'X-Sprite-Revision': String(current.revision) };
    expect((await api('draw', body, headers)).ok).toBe(true);
    expect((await api('draw', body, headers)).status).toBe(409);
    expect(state.project.cells.getCell('0,1').shapes._byId.size).toBe(1);
    expect((await api('draw', { ...body, cell: '0,2' })).ok).toBe(true);
    expect((await api('session/status', undefined, headers)).ok).toBe(true);
  });

  test('publishes lazily with zero clients, coalesces progressive batches and targets copy destinations', async () => {
    const serialize = vi.spyOn(state.project, 'toJSON');
    const composition = await api('cell/compose', { cell: '0,0', prefix: 'study',
      parts: { motif: { shapes: [{ name: 'pixel', type: 'point', params: { x: 0, y: 0 }, color: '#ff0000' }] } },
      placements: [{ kind: 'stamp', part: 'motif', name: 'one', x: 2, y: 3 }] });
    expect(composition.ok, composition.error).toBe(true);
    expect(serialize).not.toHaveBeenCalled();
    const { ws, initial } = await connect();
    const events = []; ws.on('message', raw => events.push(JSON.parse(raw)));
    state.broadcast({ type: 'shape_moved', cell: '0,1' });
    state.broadcast({ type: 'shape_recolored', cell: '0,2' });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(events.map(event => event.type)).toEqual(['project_summary']);
    expect(serialize).not.toHaveBeenCalled();
    const before = await summary();
    await api('cell/copy', { from: '0,0', to: '0,2' });
    const after = await summary();
    expect(after.cellVersions['0,0']).toBe(before.cellVersions['0,0']);
    expect(after.cellVersions['0,1']).toBe(before.cellVersions['0,1']);
    expect(after.cellVersions['0,2']).toBeGreaterThan(before.cellVersions['0,2']);
    expect(after.projectId).toBe(initial.data.projectId);
  });

  test('metadata updates preserve frame versions; shape-group member changes invalidate their frame', async () => {
    const before = await summary();
    let previous = before;
    for (const [path, body] of [
      ['group/cell/create', { name: '__proto__', cells: ['0,0'], fps: 5, direction: 'reverse', loop: false }],
      ['cell/duration', { cell: '0,0', ms: 42 }], ['session/pivot', { x: 2, y: 3 }],
      ['workbench/handoff', { note: 'Review me', cell: '0,0' }],
    ]) {
      expect((await api(path, body)).ok).toBe(true);
      const current = await summary(); expect(current.revision).toBeGreaterThan(previous.revision);
      expect(current.cellVersions).toEqual(before.cellVersions); previous = current;
    }
    const metadata = await summary();
    expect(metadata).toMatchObject({ pivot: { x: 2, y: 3 }, review: { note: 'Review me' },
      frameDurations: { '0,0': 42 }, animationFps: { ['__proto__']: 5 }, animationLoops: { ['__proto__']: false } });
    expect(Object.hasOwn(metadata.groups, '__proto__')).toBe(true);
    expect(metadata.cellVersions).toEqual(before.cellVersions);
    await api('group/shape/create', { cell: '0,0', name: '__proto__', shapes: ['dot'] });
    const created = await summary();
    expect(created.shapeGroups['0,0']).toEqual(['__proto__']);
    expect(Object.hasOwn(state.db.getAllShapeGroups(state.sessionId)['0,0'], '__proto__')).toBe(true);
    expect(state.db.getAllShapeGroups(state.sessionId)['0,0'].__proto__).toEqual(['dot']);
    await api('group/shape/remove', { cell: '0,0', name: '__proto__', shapes: ['dot'] });
    const removed = await summary();
    expect(removed.shapeGroups).toEqual(created.shapeGroups);
    expect(removed.cellVersions['0,0']).toBeGreaterThan(created.cellVersions['0,0']);
    expect(removed.cellVersions['0,1']).toBe(before.cellVersions['0,1']);
    const frame = await api(`workbench/frames?refs=0,0&${pins(removed)}`);
    expect(Object.hasOwn(frame.data.shapeGroups['0,0'], '__proto__')).toBe(true);
    expect(frame.data.shapeGroups['0,0'].__proto__).toEqual([]);
  });

  test('detects object or session replacement without a broadcast and rejects old frame pins', async () => {
    const before = await summary();
    state.project = Project.create({ name: 'Replacement', cellSize: 8, rows: 1, cols: 3 });
    const replaced = await summary();
    expect(replaced.projectId).not.toBe(before.projectId);
    expect(replaced.revision).toBeGreaterThan(before.revision);
    expect((await api(`workbench/frames?refs=0,0&${pins(before)}`)).status).toBe(409);
    state.sessionId = state.db.createSession({ project_name: 'Other' }).id;
    expect((await summary()).projectId).not.toBe(replaced.projectId);
  });

  test('enforces trusted count and response limits including shape-group members without partial success', async () => {
    await restart({ frames: { maxRefs: 1, maxResponseBytes: 700 } });
    let current = await summary();
    expect((await api(`workbench/frames?refs=0,0|0,1&${pins(current)}&maxRefs=8`)).status).toBe(400);
    expect((await api(`workbench/frames?refs=0,0&${pins(current)}`)).ok).toBe(true);
    await api('group/shape/create', { cell: '0,0', name: 'large', shapes: ['x'.repeat(800)] });
    current = await summary();
    const oversized = await api(`workbench/frames?refs=0,0&${pins(current)}&maxResponseBytes=999999`);
    expect(oversized.status).toBe(413); expect(oversized.ok).toBe(false); expect(oversized).not.toHaveProperty('data');
    expect((await api(`workbench/frames?refs=0,1&${pins(current)}`)).ok).toBe(true);
    for (const options of [{ maxRefs: 9 }, { maxQueryBytes: 2049 }, { maxResponseBytes: 8 * 1024 * 1024 + 1 }, { maxRefs: 0 }]) expect(() => frameLimits(options)).toThrow('Invalid trusted frame limit');
  });

  test('rejects malformed pins before serializing any frame and reports no active project clearly', async () => {
    const current = await summary();
    const serialize = vi.spyOn(state.project.cells.getCell('0,0'), 'toJSON');
    for (const revision of ['', '-1', '01', '1.5', 'NaN', '9007199254740992']) {
      expect((await api(`workbench/frames?refs=0,0&${pins({ ...current, revision })}`)).status).toBe(400);
    }
    expect((await api(`workbench/frames?refs=0,0&${pins(current)}&revision=${current.revision}`)).status).toBe(400);
    expect(serialize).not.toHaveBeenCalled();
    state.project = null;
    expect(await api('workbench/project-summary')).toMatchObject({ ok: false, error: 'No active project' });
  });

  test('versions cover history, canonical aliases, reference and lighting while unrelated cells remain reusable', async () => {
    await api('cell/name', { cell: '0,1', name: 'blank' });
    const before = await summary();
    await api('draw', { cell: 'blank', type: 'point', x: 2, y: 2, color: '#fff' });
    const drawn = await summary();
    expect(drawn.cellVersions['0,1']).toBeGreaterThan(before.cellVersions['0,1']);
    expect(drawn.cellVersions['0,0']).toBe(before.cellVersions['0,0']);
    await api('cell/undo', { cell: 'blank' });
    const undone = await summary();
    expect(undone.cellVersions['0,1']).toBeGreaterThan(drawn.cellVersions['0,1']);
    const frame = await api(`workbench/frames?refs=0,1&${pins(undone)}`);
    expect(frame.data.cells['0,1'].shapes).toEqual([]);
    await api('cell/redo', { cell: 'blank' });
    expect((await summary()).cellVersions['0,1']).toBeGreaterThan(undone.cellVersions['0,1']);
    state.project.cells.getCell('0,1').reference = { path: 'reference.png', opacity: 0.5 };
    state.broadcast({ type: 'cell_reference', cell: 'blank' });
    const referenced = await summary();
    expect(referenced.cells['0,1'].reference).toEqual({ path: 'reference.png', opacity: 0.5 });
    const refFrame = await api(`workbench/frames?refs=0,1&${pins(referenced)}`);
    expect(refFrame.data.cells['0,1'].reference).toEqual(referenced.cells['0,1'].reference);
    expect((await api('cell/lighting', { cell: 'blank', lighting: { palettePolicy: 'rgb', ambient: 0.25 } })).ok).toBe(true);
    const lit = await summary();
    expect(lit.cellVersions['0,1']).toBeGreaterThan(referenced.cellVersions['0,1']);
    const litFrame = await api(`workbench/frames?refs=0,1&${pins(lit)}`);
    expect(litFrame.data.cells['0,1'].lighting).toEqual(lit.cells['0,1'].lighting);
  });

  test('copies and fanout invalidate actual destinations while unknown changes invalidate all frames', async () => {
    const before = await summary();
    await api('cell/clone-fanout', { from: '0,0', to: ['0,1', '0,2'] });
    const copied = await summary();
    expect(copied.cellVersions['0,0']).toBe(before.cellVersions['0,0']);
    for (const ref of ['0,1', '0,2']) expect(copied.cellVersions[ref]).toBeGreaterThan(before.cellVersions[ref]);
    state.broadcast({ type: 'unclassified_graph_change' });
    const changed = await summary();
    for (const ref of Object.keys(changed.cells)) expect(changed.cellVersions[ref]).toBeGreaterThan(copied.cellVersions[ref]);
  });

  test('rename and copy aliases keep invalidation targeted after their old names disappear', async () => {
    await api('cell/name', { cell: '0,1', name: 'old-name' });
    let before = await summary();
    await api('cell/name', { cell: 'old-name', name: 'new-name' });
    let changed = await summary();
    expect(changed.cellVersions['0,0']).toBe(before.cellVersions['0,0']);
    before = changed;
    await api('cell/copy', { from: '0,0', to: 'new-name' });
    changed = await summary();
    expect(changed.cellVersions['0,0']).toBe(before.cellVersions['0,0']);
    expect(changed.cellVersions['0,2']).toBe(before.cellVersions['0,2']);
    expect(changed.cellVersions['0,1']).toBeGreaterThan(before.cellVersions['0,1']);
  });

  test('selected shape groups retain named-cell membership as canonical frame data', async () => {
    await api('cell/name', { cell: '0,0', name: 'named' });
    await api('group/shape/create', { cell: 'named', name: '__proto__', shapes: ['dot'] });
    const current = await summary();
    expect(current.shapeGroups['0,0']).toEqual(['__proto__']);
    const frame = await api(`workbench/frames?refs=0,0&${pins(current)}`);
    expect(Object.hasOwn(frame.data.shapeGroups['0,0'], '__proto__')).toBe(true);
    expect(frame.data.shapeGroups['0,0'].__proto__).toEqual(['dot']);
  });

  test('shape groups authored via aliases survive renaming and copying to named destinations', async () => {
    await api('cell/name', { cell: '0,0', name: 'source' });
    await api('cell/name', { cell: '0,1', name: 'destination' });
    await api('group/shape/create', { cell: 'source', name: 'part', shapes: ['dot'] });
    await api('cell/name', { cell: 'source', name: 'renamed' });
    let current = await summary(); expect(current).toBeDefined();
    expect((await api('cell/copy', { from: 'renamed', to: 'destination' })).ok).toBe(true);
    current = await summary(); expect(current).toBeDefined();
    const frame = await api(`workbench/frames?refs=0,1&${pins(current)}`);
    expect(frame.data.shapeGroups['0,1']).toEqual({ part: ['dot'] });
  });

  test('palette and background context changes invalidate all frame render versions even with a cell hint', async () => {
    const before = await summary();
    state.project.palette.add('new-color', '#123456');
    state.broadcast({ type: 'palette_changed', cell: '0,0' });
    const colored = await summary();
    for (const ref of Object.keys(colored.cells)) expect(colored.cellVersions[ref]).toBeGreaterThan(before.cellVersions[ref]);
    state.project.background = { mode: 'solid', color: '#123456' };
    state.broadcast({ type: 'background_changed', cell: '0,1' });
    const background = await summary();
    for (const ref of Object.keys(background.cells)) expect(background.cellVersions[ref]).toBeGreaterThan(colored.cellVersions[ref]);
  });

  test('legacy alias-owned groups migrate with rename and copy while orphan metadata stays harmless and untouched', async () => {
    await api('cell/name', { cell: '0,0', name: 'legacy-source' });
    state.db.setShapeGroup(state.sessionId, 'legacy-source', '__proto__', ['dot']);
    state.db.setShapeGroup(state.sessionId, 'missing-cell', 'orphan', ['missing-shape']);
    const current = await summary(); expect(current).toBeDefined();
    expect(current.shapeGroups['0,0']).toEqual(['__proto__']);
    await api('cell/copy', { from: 'legacy-source', to: '0,1' });
    expect(state.db.getShapeGroups(state.sessionId, '0,1').__proto__).toEqual(['dot']);
    await api('cell/name', { cell: '0,0', name: 'renamed-source' });
    const renamed = await summary(); expect(renamed).toBeDefined();
    expect(renamed.shapeGroups['0,0']).toEqual(['__proto__']);
    const frame = await api(`workbench/frames?refs=0,0&${pins(renamed)}`);
    expect(frame.data.shapeGroups['0,0'].__proto__).toEqual(['dot']);
    expect(state.db.getShapeGroups(state.sessionId, 'missing-cell')).toEqual({ orphan: ['missing-shape'] });
  });

  test('fanout rejects an aliased source among canonical destinations before any frame changes', async () => {
    await api('cell/name', { cell: '0,0', name: 'named-source' });
    const before = state.project.toJSON(), current = await summary();
    expect((await api('cell/clone-fanout', { from: 'named-source', to: ['0,0', '0,1'] })).ok).toBe(false);
    expect(state.project.toJSON()).toEqual(before);
    expect(await summary()).toEqual(current);
  });

  test('disposed publication does not schedule metadata work', async () => {
    await connect();
    await server.dispose();
    const index = vi.spyOn(state.db, 'getShapeGroupIndex');
    state.broadcast({ type: 'shape_moved', cell: '0,0' });
    await Promise.resolve();
    expect(index).not.toHaveBeenCalled();
  });

  test('asynchronous summary failures become recoverable websocket errors', async () => {
    const { ws } = await connect();
    const events = []; ws.on('message', raw => events.push(JSON.parse(raw)));
    vi.spyOn(state.db, 'getShapeGroupIndex').mockImplementationOnce(() => { throw new Error('Metadata unavailable'); });
    state.broadcast({ type: 'shape_moved', cell: '0,0' });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(events).toEqual([expect.objectContaining({ type: 'error', message: expect.stringContaining('Metadata unavailable') })]);
    const next = receive(ws); ws.send(JSON.stringify({ action: 'get_project' }));
    expect((await next).type).toBe('project_summary');
  });

  test('mixed clients receive their negotiated project format and ordinary shutdown notifications', async () => {
    const progressive = await connect(), legacy = await connect(false);
    const serialize = vi.spyOn(state.project, 'toJSON');
    let full = receive(legacy.ws), compact = receive(progressive.ws);
    expect((await api('workbench/handoff', { note: 'Check detail' })).ok).toBe(true);
    expect((await full).data.cells['0,0'].shapes).toHaveLength(1);
    const update = await compact;
    expect(update.type).toBe('project_summary'); expect(update.data.cells['0,0']).not.toHaveProperty('shapes');
    expect(serialize).toHaveBeenCalledTimes(1);
    full = receive(legacy.ws); compact = receive(progressive.ws);
    state.broadcast({ type: 'shutdown' });
    expect((await full).type).toBe('shutdown'); expect((await compact).type).toBe('shutdown');
  });

  test('summary discovers storage format cheaply and eight distinct selected empty frames remain explicit', async () => {
    state.project = Project.create({ name: 'Eight', cellSize: 8, rows: 1, cols: 8 });
    Object.defineProperty(state.project, 'storageVersion', { get: () => 2 });
    const serialize = vi.spyOn(state.project, 'toJSON');
    const current = await summary(); expect(current.storageVersion).toBe(2);
    const refs = Array.from({ length: 8 }, (_, col) => `0,${col}`);
    const frames = await api(`workbench/frames?refs=${refs.join('|')}&${pins(current)}`);
    expect(Object.keys(frames.data.cells)).toEqual(refs);
    for (const ref of refs) expect(frames.data.cells[ref].shapes).toEqual([]);
    expect(serialize).not.toHaveBeenCalled();
  });

  test('reference-like coordinate names remain ordinary metadata when renamed by their true coordinate', async () => {
    expect((await api('cell/name', { cell: '0,0', name: '9,9' })).ok).toBe(true);
    expect((await api('cell/name', { cell: '0,0', name: 'renamed' })).ok).toBe(true);
    expect((await summary()).cells['0,0'].name).toBe('renamed');
  });

  test('copy, session reopening, import and new publish fresh progressive identities', async () => {
    const originalId = state.sessionId;
    state.db.updateDraft(originalId, JSON.stringify(state.project.toJSON()));
    const { ws, initial } = await connect();
    let previous = initial.data;
    const importData = state.project.toJSON();
    for (const [path, body] of [
      ['session/copy', { name: 'Copy' }], ['session/open-session', { ref: originalId }],
      ['session/import', { project: importData, name: 'Imported' }], ['session/new', { name: 'New', rows: 1, cols: 1 }],
    ]) {
      const next = receive(ws);
      expect((await api(path, body)).ok).toBe(true);
      const message = await next;
      expect(message.type).toBe('project_summary');
      expect(message.data.projectId).not.toBe(previous.projectId);
      expect(message.data.revision).toBeGreaterThan(previous.revision);
      expect(Object.values(message.data.cells).every(cell => !Object.hasOwn(cell, 'shapes'))).toBe(true);
      previous = message.data;
    }
    expect(previous.name).toBe('New');
  });

  test('summaries never traverse shape geometry or retrieve group members', async () => {
    const shape = state.project.cells.getCell('0,0').shapes;
    vi.spyOn(shape, 'listByZ').mockImplementation(() => { throw new Error('Geometry traversed'); });
    vi.spyOn(state.db, 'getAllShapeGroups').mockImplementation(() => { throw new Error('Members retrieved'); });
    state.db.setShapeGroup(state.sessionId, '0,0', '__proto__', ['dot']);
    state.db.db.prepare('UPDATE shape_groups SET shapes = ? WHERE session_id = ?').run('invalid JSON', state.sessionId);
    const current = await summary();
    expect(current.cells['0,0'].shapeCount).toBe(1);
    expect(current.shapeGroups['0,0']).toEqual(['__proto__']);
  });

  test('editing valid legacy alias groups never resurrects old members or deleted groups', async () => {
    await api('cell/name', { cell: '0,0', name: 'legacy' });
    state.db.setShapeGroup(state.sessionId, 'legacy', 'part', ['old-member']);
    state.db.setShapeGroup(state.sessionId, '0,0', 'part', ['dot']);
    let current = await summary();
    let frame = await api(`workbench/frames?refs=0,0&${pins(current)}`);
    expect(frame.data.shapeGroups['0,0']).toEqual({ part: ['dot'] });
    expect((await api('group/shape/remove', { cell: 'legacy', name: 'part', shapes: ['dot'] })).ok).toBe(true);
    current = await summary(); frame = await api(`workbench/frames?refs=0,0&${pins(current)}`);
    expect(frame.data.shapeGroups['0,0']).toEqual({ part: [] });
    await api('group/shape/delete', { cell: 'legacy', name: 'part' });
    expect((await summary()).shapeGroups).toEqual({});
    expect((await api('group/shape/create', { cell: 'missing-cell', name: 'invalid', shapes: [] })).ok).toBe(false);
    expect(state.db.getShapeGroups(state.sessionId, 'missing-cell')).toEqual({});
  });

  test('frame overflow stops before later shape geometry or cells are serialized', async () => {
    const cell = state.project.cells.getCell('0,0');
    cell.shapes.getByName('dot').params.note = 'x'.repeat(800);
    const later = cell.draw('point', { x: 2, y: 2 }, '#fff');
    const params = later.params, read = vi.fn(() => params);
    Object.defineProperty(later, 'params', { get: read });
    const other = vi.spyOn(state.project.cells.getCell('0,1'), 'toJSON');
    await restart({ frames: { maxResponseBytes: 500 } });
    const current = await summary();
    expect((await api(`workbench/frames?refs=0,0|0,1&${pins(current)}`)).status).toBe(413);
    expect(read).not.toHaveBeenCalled(); expect(other).not.toHaveBeenCalled();
  });

  test('bounded frame encoding preserves canonical values and exact UTF-8 byte limits', async () => {
    const cell = state.project.cells.getCell('0,0');
    cell.reference = { path: '雪😀\\"\n\u0000', opacity: 0.35 };
    const shape = cell.shapes.getByName('dot');
    shape.params.extra = { text: '雪😀\\"\b\t\n\f\r\u0000\ud800', values: [null, 1.25, true] };
    shape.zIndex = 1.25;
    state.db.setShapeGroup(state.sessionId, '0,0', '__proto__', ['dot']);
    const current = await summary();
    const expected = { ok: true, data: { sessionId: current.sessionId, projectId: current.projectId, revision: current.revision,
      cells: { '0,0': cell.toJSON() }, cellVersions: { '0,0': current.cellVersions['0,0'] }, shapeGroups: { '0,0': { ['__proto__']: ['dot'] } } } };
    const bytes = Buffer.byteLength(JSON.stringify(expected));
    await restart({ frames: { maxResponseBytes: bytes } });
    const response = await fetch(`${base}/api/workbench/frames?refs=0,0&${pins(current)}`);
    const json = await response.text();
    expect(response.status).toBe(200); expect(JSON.parse(json)).toEqual(expected); expect(Buffer.byteLength(json)).toBe(bytes);
    await restart({ frames: { maxResponseBytes: bytes - 1 } });
    expect((await api(`workbench/frames?refs=0,0&${pins(current)}`)).status).toBe(413);
  });

  test('session copies preserve prototype-like groups without inventing inherited timing metadata', async () => {
    for (const name of ['__proto__', 'constructor', 'toString']) {
      expect((await api('group/cell/create', { name, cells: ['0,0'] })).ok).toBe(true);
      expect((await api('group/shape/create', { cell: '0,0', name, shapes: ['dot'] })).ok).toBe(true);
    }
    const copied = await api('session/copy', { name: 'Copy' });
    expect(copied.ok, copied.error).toBe(true);
    const current = await summary();
    for (const name of ['__proto__', 'constructor', 'toString']) {
      expect(Object.hasOwn(current.groups, name)).toBe(true);
      expect(Object.hasOwn(current.animationFps, name)).toBe(false);
      expect(Object.hasOwn(current.animationDirections, name)).toBe(false);
    }
    expect(current.shapeGroups['0,0']).toEqual(['__proto__', 'constructor', 'toString']);
  });

  test.each(['zero clients', 'progressive only'])('cell publications avoid full cell cloning with %s', async mode => {
    if (mode === 'progressive only') await connect();
    const cell = state.project.cells.getCell('0,0');
    cell.shapes.getByName('dot').params.layers = [{ id: 'panel', x: 0, y: 0, w: 7, h: 7, z: 0, background: { mode: 'transparent' } }];
    const serialize = vi.spyOn(cell, 'toJSON');
    for (const [path, body] of [
      ['cell/lighting', { cell: '0,0', lighting: { palettePolicy: 'rgb', ambient: 0.25 } }],
      ['cell/surface', { cell: '0,0', shape: 'dot', surface: { normal: { mode: 'flat' } } }],
      ['cell/layer', { cell: '0,0', id: 'panel', dx: 1, dy: 0 }],
    ]) expect((await api(path, body)).ok).toBe(true);
    expect(serialize).not.toHaveBeenCalled();
  });

  test.each(['zero clients', 'progressive only'])('draw, clone and scoped duplicate publications avoid shape cloning with %s', async mode => {
    if (mode === 'progressive only') await connect();
    const serialize = vi.spyOn(Shape.prototype, 'toJSON');
    try {
      expect((await api('draw', { type: 'point', cell: '0,1', x: 2, y: 2, color: '#fff', shape_name: 'new-dot' })).ok).toBe(true);
      expect((await api('shape/clone', { from_cell: '0,1', to_cell: '0,2', shape: 'new-dot', new_name: 'clone' })).ok).toBe(true);
      expect((await api('shape/duplicate', { cell: '0,1', shape: 'new-dot', as: 'duplicate', mirror: 'horizontal' })).ok).toBe(true);
      expect(serialize).not.toHaveBeenCalled();
    } finally { serialize.mockRestore(); }
  });

  test('lazy cell and shape payloads remain canonical for legacy sockets alongside progressive summaries', async () => {
    const legacy = await connect(false), progressive = await connect();
    const cell = state.project.cells.getCell('0,0'), serialize = vi.spyOn(cell, 'toJSON');
    let expanded = receive(legacy.ws), compact = receive(progressive.ws);
    expect((await api('cell/lighting', { cell: '0,0', lighting: { palettePolicy: 'rgb', ambient: 0.25 } })).ok).toBe(true);
    const lighting = await expanded;
    expect(lighting.type).toBe('cell_update'); expect(lighting.cellData.shapes).toHaveLength(1);
    expect(lighting.cellData.lighting).toMatchObject({ ambient: 0.25 });
    expect((await compact).type).toBe('project_summary'); expect(serialize).toHaveBeenCalledTimes(1);
    expanded = receive(legacy.ws); compact = receive(progressive.ws);
    const result = await api('shape/duplicate', { cell: '0,0', shape: 'dot', as: 'mirror', mirror: 'horizontal' });
    expect(result.ok).toBe(true);
    const drawing = await expanded;
    expect(drawing.type).toBe('draw'); expect(drawing.shape).toMatchObject({ id: result.data.shapeId, name: 'mirror', params: { x: 6, y: 2 } });
    expect((await compact).type).toBe('project_summary');
  });

  test.each([false, true])('all-cell group actions resolve alias ownership once and prefer canonical members with orphan=%s', async orphan => {
    await api('cell/name', { cell: '0,0', name: 'legacy' });
    await api('cell/name', { cell: '0,1', name: 'alias-only' });
    const first = state.project.cells.getCell('0,0'), second = state.project.cells.getCell('0,1');
    first.draw('point', { x: 4, y: 2 }, '#00ff00', 'alias-member');
    second.draw('point', { x: 2, y: 2 }, '#00ff00', 'only-member');
    state.db.setShapeGroup(state.sessionId, '0,0', 'part', ['dot']);
    state.db.setShapeGroup(state.sessionId, 'legacy', 'part', ['dot', 'alias-member']);
    state.db.setShapeGroup(state.sessionId, 'alias-only', 'part', ['only-member']);
    state.db.setShapeGroup(state.sessionId, '0,1', 'other', ['only-member']);
    if (orphan) state.db.setShapeGroup(state.sessionId, 'missing-cell', 'part', ['missing-shape']);
    const metadata = state.db.getAllShapeGroups(state.sessionId), before = await summary();
    expect((await api('group/shape/move', { name: 'part', all_cells: true, dx: 1, dy: 0 })).ok).toBe(true);
    expect(first.shapes.getByName('dot').params.x).toBe(2);
    expect(first.shapes.getByName('alias-member').params.x).toBe(4);
    expect(second.shapes.getByName('only-member').params.x).toBe(3);
    expect((await api('group/shape/recolor', { name: 'part', all_cells: true, color: '#123456' })).ok).toBe(true);
    expect(first.shapes.getByName('dot').color).toBe('#123456');
    expect(first.shapes.getByName('alias-member').color).toBe('#00ff00');
    expect(second.shapes.getByName('only-member').color).toBe('#123456');
    expect(state.db.getAllShapeGroups(state.sessionId)).toEqual(metadata);
    const after = await summary();
    expect(after.cellVersions['0,2']).toBe(before.cellVersions['0,2']);
  });

  test('draw auto-grouping writes canonical ownership for a named cell and expires only its frame', async () => {
    await api('cell/name', { cell: '0,0', name: 'legacy' });
    const before = await summary();
    const drawn = await api('draw', { type: 'point', cell: 'legacy', x: 2, y: 2, color: '#fff', shape_name: 'joined', group: 'new-part' });
    expect(drawn.ok, drawn.error).toBe(true);
    expect(state.db.getShapeGroups(state.sessionId, '0,0')).toEqual({ 'new-part': ['joined'] });
    expect(state.db.getShapeGroups(state.sessionId, 'legacy')).toEqual({});
    const after = await summary();
    expect(after.cellVersions['0,0']).toBeGreaterThan(before.cellVersions['0,0']);
    for (const ref of ['0,1', '0,2']) expect(after.cellVersions[ref]).toBe(before.cellVersions[ref]);
    const frame = await api(`workbench/frames?refs=0,0&${pins(after)}`);
    expect(frame.data.shapeGroups['0,0']).toEqual({ 'new-part': ['joined'] });
  });

  test('draw auto-grouping retains existing members with canonical precedence and leaves legacy owners untouched', async () => {
    await api('cell/name', { cell: '0,0', name: 'legacy' });
    state.project.cells.getCell('0,0').draw('point', { x: 3, y: 2 }, '#fff', 'alias-member');
    state.db.setShapeGroup(state.sessionId, '0,0', 'part', ['dot']);
    state.db.setShapeGroup(state.sessionId, 'legacy', 'part', ['alias-member']);
    state.db.setShapeGroup(state.sessionId, 'legacy', 'alias-only', ['alias-member']);
    const legacy = state.db.getShapeGroups(state.sessionId, 'legacy');
    for (const [group, shape] of [['part', 'joined'], ['alias-only', 'joined-alias']]) {
      const result = await api('draw', { type: 'point', cell: 'legacy', x: 2, y: 2, color: '#fff', shape_name: shape, group });
      expect(result.ok, result.error).toBe(true);
    }
    expect(state.db.getShapeGroups(state.sessionId, '0,0')).toEqual({ part: ['dot', 'joined'], 'alias-only': ['alias-member', 'joined-alias'] });
    expect(state.db.getShapeGroups(state.sessionId, 'legacy')).toEqual(legacy);
  });

  test.each(['__proto__', 'constructor', 'toString'])('draw auto-grouping treats %s as an own group name and retains its members', async group => {
    const before = await summary();
    for (const name of ['first', 'second']) {
      const drawn = await api('draw', { type: 'point', cell: '0,1', x: 1, y: 1, color: '#fff', shape_name: name, group });
      expect(drawn.ok, drawn.error).toBe(true);
    }
    const groups = state.db.getShapeGroups(state.sessionId, '0,1');
    expect(Object.hasOwn(groups, group)).toBe(true); expect(groups[group]).toEqual(['first', 'second']);
    const after = await summary();
    expect(after.cellVersions['0,1']).toBeGreaterThan(before.cellVersions['0,1']);
    for (const ref of ['0,0', '0,2']) expect(after.cellVersions[ref]).toBe(before.cellVersions[ref]);
    const frame = await api(`workbench/frames?refs=0,1&${pins(after)}`);
    expect(Object.hasOwn(frame.data.shapeGroups['0,1'], group)).toBe(true);
    expect(frame.data.shapeGroups['0,1'][group]).toEqual(['first', 'second']);
  });

  test('duplicate cell rename preserves the requested alias owner and its unchanged frame version', async () => {
    for (const [cell, name] of [['0,0', 'first'], ['0,1', 'second'], ['0,2', 'third']]) await api('cell/name', { cell, name });
    const owner = state.project.cells.getCell('0,1');
    owner.draw('point', { x: 2, y: 2 }, '#fff', 'owner-shape');
    owner.draw('point', { x: 3, y: 2 }, '#fff', 'alias-shape');
    state.db.setShapeGroup(state.sessionId, 'first', 'target-group', ['dot']);
    state.db.setShapeGroup(state.sessionId, 'second', 'owned-group', ['owner-shape']);
    state.db.setShapeGroup(state.sessionId, 'second', '__proto__', ['alias-shape']);
    state.db.setShapeGroup(state.sessionId, '0,1', '__proto__', ['owner-shape']);
    state.db.setShapeGroup(state.sessionId, 'third', 'unrelated', []);
    state.db.setShapeGroup(state.sessionId, 'missing-cell', 'orphan', ['foreign-shape']);
    const foreign = state.db.getShapeGroups(state.sessionId, 'third'), orphan = state.db.getShapeGroups(state.sessionId, 'missing-cell');
    const before = await summary();
    const initial = await api(`workbench/frames?refs=0,0|0,1&${pins(before)}`);
    expect((await api('cell/name', { cell: 'first', name: 'second' })).ok).toBe(true);
    const after = await summary();
    const current = await api(`workbench/frames?refs=0,0|0,1&${pins(after)}`);
    expect(current.data.cells['0,1']).toEqual(initial.data.cells['0,1']);
    expect(current.data.shapeGroups['0,1']).toEqual(initial.data.shapeGroups['0,1']);
    expect(current.data.shapeGroups['0,0']).toEqual(initial.data.shapeGroups['0,0']);
    expect(after.cellVersions['0,0']).toBeGreaterThan(before.cellVersions['0,0']);
    for (const ref of ['0,1', '0,2']) expect(after.cellVersions[ref]).toBe(before.cellVersions[ref]);
    expect(state.project.cells.getCell('0,0').name).toBe('second'); expect(owner.name).toBe('second');
    expect(state.db.getShapeGroups(state.sessionId, '0,1')).toEqual({ ['__proto__']: ['owner-shape'], 'owned-group': ['owner-shape'] });
    expect(state.db.getShapeGroups(state.sessionId, 'third')).toEqual(foreign);
    expect(state.db.getShapeGroups(state.sessionId, 'missing-cell')).toEqual(orphan);
  });

  test('coordinate-like new names do not migrate a different alias owned by their coordinate', async () => {
    await api('cell/name', { cell: '0,0', name: 'first' });
    await api('cell/name', { cell: '0,1', name: 'second' });
    state.db.setShapeGroup(state.sessionId, 'second', 'owned', []);
    state.db.setShapeGroup(state.sessionId, 'missing-cell', 'orphan', []);
    const metadata = state.db.getAllShapeGroups(state.sessionId), before = await summary();
    const initial = await api(`workbench/frames?refs=0,1&${pins(before)}`);
    expect((await api('cell/name', { cell: '0,0', name: '0,1' })).ok).toBe(true);
    const after = await summary(), current = await api(`workbench/frames?refs=0,1&${pins(after)}`);
    expect(state.db.getAllShapeGroups(state.sessionId)).toEqual(metadata);
    expect(current.data.cells['0,1']).toEqual(initial.data.cells['0,1']);
    expect(current.data.shapeGroups['0,1']).toEqual(initial.data.shapeGroups['0,1']);
    expect(after.cellVersions['0,1']).toBe(before.cellVersions['0,1']);
  });
});
