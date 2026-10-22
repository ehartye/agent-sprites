// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { WebSocketClient } from '../../server/web/public/js/websocket.js';

test('startup opts into progressive protocol and nested summary sessions; only owned receipts settle requests', async () => {
  const sockets = []; const old = globalThis.WebSocket;
  globalThis.WebSocket = class { static OPEN = 1; readyState = 1; sent = []; constructor(url) { this.url = url; sockets.push(this); } send(s) { this.sent.push(JSON.parse(s)); } close() {} };
  try {
    const client = new WebSocketClient(); client.connect(); const socket = sockets[0];
    expect(socket.url).toContain('project=progressive-v1');
    socket.onmessage({ data: JSON.stringify({ type: 'project_summary', data: { sessionId: 's', projectId: 'p', revision: 1 } }) });
    expect(client.sessionId).toBe('s');
    let settled = false; const request = client.request({ action: 'undo', sessionId: 's', projectId: 'p', revision: 1 }).then(value => { settled = true; return value; });
    socket.onmessage({ data: JSON.stringify({ type: 'error', message: 'unrelated' }) }); await Promise.resolve(); expect(settled).toBe(false);
    socket.onmessage({ data: JSON.stringify({ type: 'result', requestId: socket.sent[0].requestId, data: 'ok', pins: { sessionId: 's', projectId: 'p', revision: 2 } }) });
    expect((await request).pins.revision).toBe(2);
  } finally { globalThis.WebSocket = old; }
});
