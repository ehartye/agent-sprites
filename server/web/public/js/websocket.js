/**
 * WebSocket client — connects to the sprite server, receives state updates,
 * and sends operations.
 */

const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 30000;

export class WebSocketClient {
  constructor() {
    /** @type {WebSocket|null} */
    this._ws = null;
    this._url = null;
    this._reconnectDelay = RECONNECT_DELAY;
    this._reconnectTimer = null;
    this._handlers = new Map();
    this._connected = false;
    this._requests = new Map(); this._requestSequence = 0;
  }

  /**
   * Connect to the WebSocket server.
   * @param {string} [url] - Override URL; defaults to current host on same port.
   */
  connect(url) {
    this._url = url || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/?project=progressive-v1`;
    this._open();
  }

  /** Send an operation message to the server. */
  send(msg) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ ...(this.sessionId ? { sessionId: this.sessionId } : {}), ...msg }));
      return true;
    }
    return false;
  }

  request(msg) {
    if (this._requests.size >= 32) return Promise.reject(new Error('Too many pending WebSocket edits'));
    const requestId = `edit-${++this._requestSequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this._requests.delete(requestId); reject(new Error('Edit receipt timed out. Refresh to inspect the result before editing again.')); }, 15000);
      this._requests.set(requestId, { resolve, reject, timer });
      if (!this.send({ ...msg, requestId })) { clearTimeout(timer); this._requests.delete(requestId); reject(new Error('Disconnected. Edit was not sent.')); }
    });
  }

  /** Register a handler for a message type. */
  on(type, callback) {
    if (!this._handlers.has(type)) {
      this._handlers.set(type, []);
    }
    this._handlers.get(type).push(callback);
  }

  /** Remove a handler. */
  off(type, callback) {
    const list = this._handlers.get(type);
    if (!list) return;
    const idx = list.indexOf(callback);
    if (idx !== -1) list.splice(idx, 1);
  }

  get connected() { return this._connected; }

  /* -- Internal -- */

  _open() {
    if (this._ws) {
      this._ws.onclose = null;
      this._ws.close();
    }

    this._ws = new WebSocket(this._url);

    this._ws.onopen = () => {
      this._connected = true;
      this._reconnectDelay = RECONNECT_DELAY;
      this._emit('_connected');
      this._updateStatus(true);
    };

    this._ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const sessionId = msg.type === 'project_summary' ? msg.data?.sessionId : msg.sessionId;
        if (sessionId) {
          this.sessionId = sessionId;
          this._emit('_session', sessionId);
        }
        const pending = this._requests.get(msg.requestId);
        if (pending && ['result', 'error'].includes(msg.type)) {
          clearTimeout(pending.timer); this._requests.delete(msg.requestId);
          if (msg.type === 'error') pending.reject(Object.assign(new Error(msg.message), { status: msg.status, pins: msg.pins }));
          else pending.resolve(msg);
          return;
        }
        if (msg.type) {
          this._emit(msg.type, msg.data ?? msg);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    this._ws.onclose = () => {
      for (const request of this._requests.values()) { clearTimeout(request.timer); request.reject(new Error('Disconnected before edit receipt. Refresh to inspect the result.')); }
      this._requests.clear();
      this._connected = false;
      this._updateStatus(false);
      this._scheduleReconnect();
    };

    this._ws.onerror = () => {
      // onclose will fire after this
    };
  }

  _emit(type, data) {
    const list = this._handlers.get(type);
    if (!list) return;
    for (const cb of list) {
      try { cb(data); } catch (e) { console.error(`WS handler error [${type}]:`, e); }
    }
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._open();
    }, this._reconnectDelay);
    this._reconnectDelay = Math.min(this._reconnectDelay * 1.5, MAX_RECONNECT_DELAY);
  }

  _updateStatus(connected) {
    const el = document.getElementById('connection-status');
    if (!el) return;
    el.textContent = connected ? 'Connected' : 'Disconnected';
    el.className = connected ? 'connected' : 'disconnected';
  }
}
