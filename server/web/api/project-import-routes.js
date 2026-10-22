import { Router, json } from 'express';
import { PassThrough } from 'node:stream';
import { localFileRequestAllowed } from './workbench-routes.js';

export function projectImportRoutes(state, jobs) {
  const router = Router();
  router.use((req, res, next) => {
    if (!localFileRequestAllowed(req)) return res.status(403).json({ ok: false, error: 'Import requires this server’s localhost page and a matching origin.' });
    next();
  });
  const guard = (req, res, next) => {
    const expected = req.get('X-Sprite-Session');
    if (req.path.endsWith('/activate') && jobs.jobs.get(req.params.id)?.state === 'complete') return next();
    if (expected && expected !== state.sessionId) return res.status(409).json({ ok: false, error: 'The active session changed.' });
    next();
  };
  const route = fn => async (req, res) => { try { await fn(req, res); } catch (error) { if (!res.headersSent && !res.destroyed) res.status(error.status ?? 400).json({ ok: false, error: String(error.message).slice(0, 600) }); } };
  router.post('/', guard, json({ limit: '8kb' }), route(async (req, res) => res.status(201).json({ ok: true, data: jobs.status(await jobs.create(req.body)) })));
  router.put('/:id/file', guard, route(async (req, res) => {
    const job = jobs.get(req.params.id); jobs.pins(job);
    if (job.state !== 'uploading' || job.operation) throw Object.assign(new Error('This import is not accepting a file'), { status: 409 });
    // Isolate pipeline destruction from the HTTP socket so rejected uploads still
    // receive a receipt. Backpressure propagates through this bounded stream.
    const input = new PassThrough();
    const interrupted = () => input.destroy(new Error('Upload interrupted'));
    req.once('aborted', interrupted); req.once('error', interrupted); req.pipe(input);
    try { await jobs.upload(job, input); }
    finally { req.off('aborted', interrupted); req.off('error', interrupted); req.unpipe(input); req.resume(); }
    if (!req.complete) res.once('finish', () => req.destroy());
    res.status(202).json({ ok: true, data: jobs.status(job) });
  }));
  router.get('/:id', route((req, res) => res.json({ ok: true, data: jobs.status(jobs.get(req.params.id)) })));
  router.post('/:id/activate', guard, json({ limit: '8kb' }), route(async (req, res) => res.json({ ok: true, data: await jobs.activate(jobs.get(req.params.id)) })));
  router.delete('/:id', route(async (req, res) => { const job = jobs.get(req.params.id); await jobs.cancel(job); res.json({ ok: true, data: jobs.status(job) }); }));
  return router;
}
