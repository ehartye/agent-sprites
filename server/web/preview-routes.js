import { Router, json } from 'express';
import { fileURLToPath } from 'node:url';
import { PreviewGrants, previewLinks, sameOrigin } from './preview-access.js';
import { projectView, projectSummary, projectFrames } from '../project-view.js';

const page = fileURLToPath(new URL('./public/preview.html', import.meta.url));
const cookieName = id => `sprites_preview_${id}`;
const validId = id => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
const cookieToken = (req, id) => {
  const values = (req.headers.cookie ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${cookieName(id)}=`));
  return values.length === 1 ? values[0].slice(cookieName(id).length + 1) : null;
};
export function createPreviewRoutes(state, { frames }) {
  const grants = new PreviewGrants(), owner = Router(), preview = Router();
  const deny = res => res.status(403).json({ ok: false, error: 'Preview unavailable. Ask for a new link.' });
  const activeId = () => state.project && state.sessionId ? projectView(state).projectId : null;
  owner.use(json({ limit: '4kb' }));
  owner.get('/status', (_req, res) => res.json({ ok: true, data: { protocol: 1 } }));
  owner.post('/', (req, res) => {
    try {
      const projectId = activeId(); if (!projectId) throw new Error('No active project');
      if (req.get('X-Sprite-Session') && req.get('X-Sprite-Session') !== state.sessionId) throw Object.assign(new Error('The active session changed. Refresh before sharing.'), { status: 409 });
      if (req.body?.feedback !== undefined) throw new Error('Sprite previews are read-only');
      const { grant, token } = grants.issue(projectId, req.body?.seconds);
      const port = req.socket.localPort;
      res.json({ ok: true, data: { id: grant.id, ...previewLinks(port, `/preview/${grant.id}#preview=${token}`), expiresAt: new Date(grant.expires).toISOString(), access: 'read-only' } });
    } catch (error) { res.status(error.status ?? 400).json({ ok: false, error: error.message }); }
  });
  owner.post('/revoke', (req, res) => {
    if (!validId(req.body?.id)) return res.status(400).json({ ok: false, error: 'Provide the preview share id' });
    res.json({ ok: true, data: { revoked: grants.revoke(req.body.id) } });
  });
  preview.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; worker-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" });
    // The shell contains no project data or credential; chat links navigate cross-site.
    const shell = ['GET', 'HEAD'].includes(req.method) && /^\/[a-f0-9]{32}\/?$/.test(req.path);
    if (!shell && !sameOrigin(req)) return deny(res); next();
  });
  preview.get('/:id', (req, res) => validId(req.params.id) ? res.sendFile(page) : deny(res));
  preview.post('/:id/exchange', json({ limit: '4kb' }), (req, res) => {
    const { id } = req.params;
    const grant = validId(id) && grants.get(id, req.body?.token, activeId());
    if (!grant) return deny(res);
    res.cookie(cookieName(id), req.body.token, { httpOnly: true, sameSite: 'strict', path: `/preview/${id}`, maxAge: grant.expires - Date.now() });
    res.json({ ok: true, access: 'read-only' });
  });
  preview.use('/:id', (req, res, next) => {
    if (!validId(req.params.id) || !grants.get(req.params.id, cookieToken(req, req.params.id), activeId())) return deny(res);
    next();
  });
  preview.get('/:id/summary', (_req, res) => {
    try { res.json({ ok: true, data: projectSummary(state, { preview: true }) }); }
    catch (error) { res.status(error.status ?? 400).json({ ok: false, error: 'Preview unavailable' }); }
  });
  preview.get('/:id/frames', (req, res) => {
    try { res.type('json').send(projectFrames(state, req.query, req.url.split('?')[1] ?? '', frames, { preview: true })); }
    catch (error) { res.status(error.status ?? 400).json({ ok: false, error: error.message }); }
  });
  preview.use((_req, res) => deny(res));
  preview.use((error, _req, res, _next) => res.status(error.status === 413 ? 413 : 400).json({ ok: false, error: 'Invalid preview request' }));
  return { owner, preview, clear: () => grants.clear() };
}
