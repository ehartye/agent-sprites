import { Router } from 'express';

export function controlRoutes(state) {
  const r = Router();

  r.post('/shutdown', (_req, res) => {
    res.json({ ok: true, data: 'shutting down' });
    setImmediate(async () => {
      try { state.broadcast?.({ type: 'shutdown' }); } catch {}
      try { await state.disposeImports?.(); } catch (error) { console.error('Import cleanup failed:', error.message); return; }
      try { state.db?.close?.(); } catch {}
      process.exit(0);
    });
  });

  return r;
}
