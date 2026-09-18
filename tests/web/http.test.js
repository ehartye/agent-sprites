import { describe, it, expect, afterEach } from 'vitest';
import { startWebServer } from '../../server/web/http.js';

describe('Web Server Bootstrap', () => {
  const servers = [];

  afterEach(async () => {
    for (const { httpServer, wss } of servers) {
      wss.close();
      await new Promise((resolve) => httpServer.close(resolve));
    }
    servers.length = 0;
  });

  it('starts on a given port and returns port info', async () => {
    const state = { project: null };
    const info = await startWebServer(state, 0);
    servers.push(info);

    expect(info.port).toBeGreaterThan(0);
  });

  it('attaches broadcast function and wss to state', async () => {
    const state = { project: null };
    const info = await startWebServer(state, 0);
    servers.push(info);

    expect(typeof state.broadcast).toBe('function');
    expect(state.wss).toBeDefined();
  });

  it('returns httpServer and wss for lifecycle management', async () => {
    const state = { project: null };
    const info = await startWebServer(state, 0);
    servers.push(info);

    expect(info.httpServer).toBeDefined();
    expect(info.wss).toBeDefined();
  });

  it('identifies the sprite service and protocol in health responses', async () => {
    const state = { project: null };
    const info = await startWebServer(state, 0);
    servers.push(info);

    const res = await fetch(`http://localhost:${info.port}/health`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, service: 'agent-sprites', protocol: 1 });
  });

  it('rejects an occupied requested port rather than choosing another', async () => {
    const info = await startWebServer({ project: null }, 0);
    servers.push(info);
    const attempt = startWebServer({ project: null }, info.port).then(unexpected => {
      servers.push(unexpected);
      return unexpected;
    });
    await expect(attempt).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });
});
