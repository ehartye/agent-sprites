import { describe, it, expect, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { startWebServer } from '../../server/web/http.js';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Web Server Bootstrap', () => {
  const servers = [];

  afterEach(async () => {
    for (const { httpServer, wss } of servers) {
      wss.close();
      await new Promise((resolve) => httpServer.close(resolve));
    }
    servers.length = 0;
  });

  it('state.broadcast delivers a notification to a connected socket', async () => {
    const state = { project: null };
    const info = await startWebServer(state, 0);
    servers.push(info);
    expect(state.wss).toBe(info.wss);

    const socket = new WebSocket(`ws://127.0.0.1:${info.port}/`);
    try {
      await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
      const received = new Promise((resolve, reject) => { socket.once('message', raw => resolve(JSON.parse(raw))); socket.once('error', reject); });
      state.broadcast({ type: 'shutdown' });
      expect(await received).toMatchObject({ type: 'shutdown' });
    } finally {
      socket.terminate();
    }
  });

  it('returns the listening httpServer on the reported port for lifecycle management', async () => {
    const info = await startWebServer({ project: null }, 0);
    servers.push(info);

    expect(info.httpServer.listening).toBe(true);
    expect(info.httpServer.address().port).toBe(info.port);
    expect(info.wss.options.server).toBe(info.httpServer);
  });

  it('identifies the sprite service and protocol in health responses', async () => {
    const state = { project: null };
    const info = await startWebServer(state, 0);
    servers.push(info);

    const res = await fetch(`http://localhost:${info.port}/health`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, service: 'agent-sprites', protocol: 1,
      version: JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version,
      runtimeRoot: realpathSync(resolve('.')) });
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
