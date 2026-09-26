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
  }

  /**
   * Connect to the WebSocket server.
   * @param {string} [url] - Override URL; defaults to current host on same port.
   */
  connect(url) {
    this._url = url || `ws://${location.host}`;
    this._open();
  }

  /** Send an operation message to the server. */
  send(msg) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ ...msg, ...(this.sessionId ? { sessionId: this.sessionId } : {}) }));
    }
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
        if (msg.sessionId) {
          this.sessionId = msg.sessionId;
          this._emit('_session', msg.sessionId);
        }
        if (msg.type) {
          this._emit(msg.type, msg.data ?? msg);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    this._ws.onclose = () => {
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
