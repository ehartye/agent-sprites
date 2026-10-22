/** Own final thumbnail canvases and release their backing stores on eviction. */
export class ThumbnailCache {
  constructor(maxEntries = 128, maxBytes = 8 * 1024 * 1024) {
    this._maxEntries = Math.max(0, maxEntries);
    this._maxBytes = Math.max(0, maxBytes);
    this._entries = new Map();
    this._bytes = 0;
  }

  get(ref) {
    const entry = this._entries.get(ref);
    if (!entry) return null;
    this._entries.delete(ref);
    this._entries.set(ref, entry);
    return entry.canvas;
  }

  set(ref, canvas) {
    this.delete(ref);
    const bytes = canvas.width * canvas.height * 4;
    this._entries.set(ref, { canvas, bytes });
    this._bytes += bytes;
    while (this._entries.size > this._maxEntries || this._bytes > this._maxBytes) {
      this.delete(this._entries.keys().next().value);
    }
  }

  delete(ref) {
    const entry = this._entries.get(ref);
    if (!entry) return;
    this._entries.delete(ref);
    this._bytes -= entry.bytes;
    entry.canvas.width = entry.canvas.height = 0;
  }

  clear() {
    for (const ref of this._entries.keys()) this.delete(ref);
  }
}
