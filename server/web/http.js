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
  if (state.sessionId && state.project) {
    state.db.updateDraft(state.sessionId, JSON.stringify(state.project.toJSON()));
  }
}

export function dispatchWebMessage(state, msg) {
  const handler = DISPATCH[msg.action];
  if (!handler) throw new Error(`Unknown action: ${msg.action}`);
  return handler(state, msg);
}

export async function startWebServer(state, port) {
  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'agent-sprites', protocol: 1, version, runtimeRoot }));
  app.use('/api/session', sessionRoutes(state));
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

  // Broadcast helper — tools call this after state changes
  state.broadcast = (msg) => {
    const data = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(data);
    }
  };

  wss.on('connection', (ws) => {
    // Send current project state on connect
    if (state.project) {
      ws.send(JSON.stringify({ type: 'project', data: state.project.toJSON() }));
    }

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        // Handle project state request (for resync after MCP mutations)
        if (msg.action === 'get_project') {
          if (state.project) {
            ws.send(JSON.stringify({ type: 'project', data: state.project.toJSON() }));
          }
          return;
        }
        const result = dispatchWebMessage(state, msg);
        saveDraft(state);
        ws.send(JSON.stringify({ type: 'result', action: msg.action, data: result }));
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: e.message }));
      }
    });
  });

  return { port: actualPort, httpServer, wss };
}
