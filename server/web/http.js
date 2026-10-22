import http from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, realpathSync } from 'fs';
import { handleDraw } from '../handlers/draw.js';
import { handleNameShape, handleMoveShape, handleRecolorShape, handleDeleteShape, handleSetZ, handleShapeZDirection, handleCloneShape, handleResizeShape, handleMoveShapeTo } from '../handlers/shape.js';
import { handleShiftCell, handleMirrorCell, handleCopyCell, handleClearCell, handleNameCell } from '../handlers/cell.js';
import { handleUndo, handleRedo } from '../handlers/history.js';
import { sessionRoutes } from './api/session-routes.js';
import { drawRoutes } from './api/draw-routes.js';
import { shapeRoutes } from './api/shape-routes.js';
import { cellRoutes } from './api/cell-routes.js';
import { groupRoutes } from './api/group-routes.js';
import { controlRoutes } from './api/control-routes.js';
import { castingRoutes } from './api/casting-routes.js';
import { workbenchRoutes } from './api/workbench-routes.js';
import { constructionReplayRoutes } from './api/construction-replay-routes.js';
import { API_BODY_LIMIT } from './api/policy.js';
import { ProjectImportJobs } from '../import/project-import-jobs.js';
import { projectImportRoutes } from './api/project-import-routes.js';
import { projectSummary, projectView, frameLimits, assertProjectPins, assertOptionalProjectPins, invalidateProject } from '../project-view.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = realpathSync(path.join(__dirname, '..', '..'));
const version = JSON.parse(readFileSync(path.join(runtimeRoot, 'package.json'), 'utf8')).version;

const DISPATCH = {
  draw:               (state, msg) => handleDraw(state, msg.type, msg.params),
  name_shape:         (state, msg) => handleNameShape(state, msg.params),
  move_shape:         (state, msg) => handleMoveShape(state, msg.params),
  recolor_shape:      (state, msg) => handleRecolorShape(state, msg.params),
  delete_shape:       (state, msg) => handleDeleteShape(state, msg.params),
  set_z:              (state, msg) => handleSetZ(state, msg.params),
  shape_z:            (state, msg) => handleShapeZDirection(state, msg.params),
  clone_shape:        (state, msg) => handleCloneShape(state, msg.params),
  resize_shape:       (state, msg) => handleResizeShape(state, msg.params),
  move_shape_to:      (state, msg) => handleMoveShapeTo(state, msg.params),
  undo:               (state, msg) => handleUndo(state, msg.params),
  redo:               (state, msg) => handleRedo(state, msg.params),
  shift_cell:         (state, msg) => handleShiftCell(state, msg.params),
  mirror_cell:        (state, msg) => handleMirrorCell(state, msg.params),
  copy_cell:          (state, msg) => handleCopyCell(state, msg.params),
  clear_cell:         (state, msg) => handleClearCell(state, msg.params),
  name_cell:          (state, msg) => handleNameCell(state, msg.params),
};

export function saveDraft(state) {
  // Only the isolated build runner opts out. Live sessions keep autosaving by
  // default; request bodies and unrelated concurrent sessions cannot change it.
  if (state.persistDrafts === false) return;
  if (state.sessionId && state.project) {
    state.db.updateDraft(state.sessionId, JSON.stringify(state.project.toStorageJSON()));
  }
}

export function dispatchWebMessage(state, msg) {
  const handler = DISPATCH[msg.action];
  if (!handler) throw new Error(`Unknown action: ${msg.action}`);
  return handler(state, msg);
}

export async function startWebServer(state, port, options = {}) {
  const app = express();
  const frames = frameLimits(options.frames);
  const imports = new ProjectImportJobs(state, options.imports);
  app.use('/api/workbench/imports', projectImportRoutes(state, imports));
  app.use(express.json({ limit: API_BODY_LIMIT }));
  // Optional optimistic session guard for the collaborative browser. CLI clients
  // remain compatible, while stale tabs cannot accidentally edit a newly opened design.
  app.use('/api', (req, res, next) => {
    const readOnly = req.method === 'GET' || ['/cell/ascii-read', '/cell/compose-plan', '/cell/view', '/view/stack', '/view/sheet', '/workbench/replay', '/workbench/map-operations', '/workbench/build', '/workbench/trace', '/workbench/verify', '/workbench/atlas-proof'].includes(req.path);
    const projectId = req.get('X-Sprite-Project'), revision = req.get('X-Sprite-Revision');
    if (!readOnly) {
      try { assertOptionalProjectPins(state, { sessionId: req.get('X-Sprite-Session'), projectId, revision }); }
      catch (error) { return res.status(error.status ?? 400).json({ ok: false, error: error.message }); }
    }
    const expected = req.get('X-Sprite-Session');
    if (expected && expected !== state.sessionId) {
      return res.status(409).json({ ok: false, error: 'The active session changed. Refresh the design before editing.' });
    }
    next();
  });
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'agent-sprites', protocol: 1, version, runtimeRoot }));
  app.use('/api/session', sessionRoutes(state));
  app.use('/api', workbenchRoutes(state, { frames }));
  app.use('/api', constructionReplayRoutes(state));
  app.use('/api', drawRoutes(state));
  app.use('/api', shapeRoutes(state));
  app.use('/api', cellRoutes(state));
  app.use('/api', groupRoutes(state));
  app.use('/api/control', controlRoutes(state));
  app.use('/api', castingRoutes(state));
  app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false, setHeaders: (res) => res.setHeader('Cache-Control', 'no-store') }));

  const httpServer = http.createServer(app);
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, '0.0.0.0', resolve);
  });

  const actualPort = httpServer.address().port;

  const wss = new WebSocketServer({ server: httpServer });
  state.wss = wss;

  let summaryPending = false, disposed = false;
  const clients = progressive => [...wss.clients].filter(client => client.readyState === 1 && client.progressiveProject === progressive);
  const publishSummary = () => {
    if (disposed || summaryPending || !clients(true).length) return;
    summaryPending = true;
    queueMicrotask(() => {
      summaryPending = false;
      if (disposed) return;
      const recipients = clients(true);
      if (!recipients.length || !state.project) return;
      try {
        const data = JSON.stringify({ type: 'project_summary', data: projectSummary(state) });
        for (const client of recipients) client.send(data);
      } catch (error) {
        const data = JSON.stringify({ type: 'error', message: `Project summary unavailable: ${error.message}` });
        for (const client of recipients) if (client.readyState === 1) client.send(data);
      }
    });
  };
  // Full project serialization is deliberately reserved for legacy clients.
  state.broadcast = (msg, createPayload) => {
    if (disposed) return;
    const notification = ['shutdown', 'error'].includes(msg.type);
    if (!notification) invalidateProject(state, msg);
    const recipients = notification ? [...clients(false), ...clients(true)] : clients(false);
    if (recipients.length) {
      const expanded = createPayload ? { ...msg, ...createPayload() } : msg;
      const message = expanded.type === 'project' && !expanded.data ? { ...expanded, data: state.project.toJSON() } : expanded;
      const data = JSON.stringify({ ...message, sessionId: state.sessionId });
      for (const client of recipients) client.send(data);
    }
    if (!notification) publishSummary();
  };
  state.broadcast.supportsLazyPayloads = true;
  state.broadcast.needsPayload = () => clients(false).length > 0;
  state.broadcastProject = change => state.broadcast({ type: 'project', ...change });

  wss.on('connection', (ws, req) => {
    const progressive = new URL(req.url, 'http://localhost').searchParams.get('project') === 'progressive-v1';
    ws.progressiveProject = progressive;
    // Send current project state on connect
    if (state.project) {
      try { ws.send(JSON.stringify(progressive ? { type: 'project_summary', data: projectSummary(state) } : { type: 'project', data: state.project.toJSON(), sessionId: state.sessionId })); }
      catch (error) { ws.send(JSON.stringify({ type: 'error', message: error.message })); }
    }

    ws.on('message', (raw) => {
      let requestId;
      const receipt = () => {
        if (!requestId) return {};
        const view = projectView(state);
        return { requestId, ...(state.project ? { pins: { sessionId: view.sessionId, projectId: view.projectId, revision: view.revision } } : {}) };
      };
      try {
        const msg = JSON.parse(raw);
        if (progressive && msg.requestId !== undefined) {
          if (typeof msg.requestId !== 'string' || !msg.requestId.length || msg.requestId.length > 80) throw new Error('requestId must be a nonempty string of at most 80 characters');
          requestId = msg.requestId;
        }
        // Handle project state request (for resync after MCP mutations)
        if (msg.action === 'get_project') {
          if (state.project) {
            ws.send(JSON.stringify(progressive ? { type: 'project_summary', data: projectSummary(state) } : { type: 'project', data: state.project.toJSON(), sessionId: state.sessionId }));
          }
          return;
        }
        if (progressive) assertProjectPins(state, msg);
        else if (msg.sessionId && msg.sessionId !== state.sessionId) throw new Error('The active session changed. Refresh the design before editing.');
        const result = dispatchWebMessage(state, msg);
        saveDraft(state);
        ws.send(JSON.stringify({ type: 'result', action: msg.action, data: result, ...receipt() }));
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: e.message, ...receipt(), ...(requestId ? { status: e.status ?? 400 } : {}) }));
      }
    });
  });

  const dispose = () => { disposed = true; return imports.close(); };
  state.disposeImports = dispose;
  httpServer.once('close', () => { void dispose(); });
  return { port: actualPort, httpServer, wss, imports, dispose };
}
