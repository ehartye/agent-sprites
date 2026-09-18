import { describe, test, expect, afterEach, beforeEach } from 'vitest';
import { startWebServer } from '../../server/web/http.js';

describe('Session API Routes', () => {
  const servers = [];
  let baseUrl;
  let state;

  beforeEach(async () => {
    // Create a mock db that satisfies the session routes
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
    };
    state = { project: null, sessionId: null, db: mockDb };
    const info = await startWebServer(state, 0);
    servers.push(info);
    baseUrl = `http://localhost:${info.port}`;
  });

  afterEach(async () => {
    for (const { httpServer, wss } of servers) {
      wss.close();
      await new Promise((resolve) => httpServer.close(resolve));
    }
    servers.length = 0;
  });

  async function api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(`${baseUrl}${path}`, opts);
    return r.json();
  }

  test('GET /api/session/status with no active session', async () => {
    const res = await api('GET', '/api/session/status');
    expect(res.ok).toBe(true);
    expect(res.data.active).toBe(false);
  });

  test('POST /api/session/new creates a project', async () => {
    const res = await api('POST', '/api/session/new', {
      name: 'test', size: 16, rows: 2, cols: 4, palette: 'pico8',
    });
    expect(res.ok).toBe(true);
    expect(res.data).toContain('Created "test"');
    expect(state.project).not.toBeNull();
    expect(state.sessionId).toBeTruthy();
  });

  test('POST /api/session/new requires name', async () => {
    const res = await api('POST', '/api/session/new', {});
    expect(res.ok).toBe(false);
    expect(res.error).toContain('name required');
  });

  test('GET /api/session/status after new returns active', async () => {
    await api('POST', '/api/session/new', { name: 'test' });
    const res = await api('GET', '/api/session/status');
    expect(res.ok).toBe(true);
    expect(res.data.active).toBe(true);
    expect(res.data.project_name).toBe('test');
  });

  test('POST /api/session/save without project returns error', async () => {
    const res = await api('POST', '/api/session/save', {});
    expect(res.ok).toBe(false);
    expect(res.error).toContain('No active project');
  });

  test('status reports this server active session even if another session was modified last', async () => {
    await api('POST', '/api/session/new', { name: 'active' });
    const activeId = state.sessionId;
    const other = state.db.createSession({ project_name: 'another-server' });
    other.updated_at = Date.now() + 1000;
    const res = await api('GET', '/api/session/status');
    expect(res.data).toMatchObject({ session_id: activeId, project_name: 'active' });
  });

  test('GET /health returns ok', async () => {
    const res = await api('GET', '/health');
    expect(res.ok).toBe(true);
  });
});
