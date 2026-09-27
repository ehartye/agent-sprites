import { Router } from 'express';
import { join } from 'node:path';
import { Project } from '../../engine/project.js';
import { Palette } from '../../engine/palette.js';
import { CanvasRenderer } from '../../engine/canvas-renderer.js';
import { captureProjectMetadata, restoreProjectMetadata } from '../../project-state.js';
import { saveDraft } from '../http.js';
import { mapCommandToApi } from '../../../scripts/batch-commands.js';
import { buildProject } from '../../build/project-build.js';
import { traceImageFile } from '../../engine/image-trace.js';
import { verifyAtlasFile } from '../../engine/atlas-verifier.js';
import { applySkinTone, skinToneState } from '../../engine/skin-tones.js';

export function localFileRequestAllowed(req) {
  const remote = req.socket.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) return false;
  try {
    const server = new URL(`http://${req.get('host')}`);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(server.hostname)) return false;
    const origin = req.get('origin');
    return !origin || new URL(origin).origin === server.origin;
  } catch { return false; }
}

function projectName(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 120 || /[<>:"/\\|?*\x00-\x1f]/.test(value) || /[. ]$/.test(value) || ['.', '..'].includes(value)) {
    throw new Error('Use a project name of 1–120 characters without path separators or reserved filename characters');
  }
  return value.trim();
}

function validateImport(data) {
  const w = data?.cellWidth ?? data?.cellSize;
  const h = data?.cellHeight ?? data?.cellSize ?? w;
  const rows = data?.grid?.rows, cols = data?.grid?.cols;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 4096 || h > 4096 ||
      !Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1 || rows > 10 || cols > 10 ||
      w * h * rows * cols > 16_777_216 || !Array.isArray(data.palette) || !data.cells || typeof data.cells !== 'object') {
    throw new Error('Invalid project dimensions, grid, palette or cells');
  }
  let count = 0;
  for (const [ref, cell] of Object.entries(data.cells)) {
    const match = ref.match(/^(\d+),(\d+)$/);
    if (!match || +match[1] >= rows || +match[2] >= cols || !Array.isArray(cell.shapes)) throw new Error('Invalid project cell');
    count += cell.shapes.length;
  }
  if (count > 200_000) throw new Error('Project exceeds 200,000 shapes');
}

/** Browser collaboration uses the same project format and editing routes as CLI. */
export function workbenchRoutes(state) {
  const router = Router();
  const route = (fn) => async (req, res) => {
    try { await fn(req, res); }
    catch (error) { res.json({ ok: false, error: error.message }); }
  };
  const requireProject = () => {
    if (!state.project || !state.sessionId) throw new Error('No active project');
    captureProjectMetadata(state);
    return state.project;
  };
  function activateCopy(project, origin) {
    const parent = state.sessionId ? state.db.getSession(state.sessionId) : null;
    const projectPath = parent?.project_path ?? process.cwd();
    // Session id in the destination guarantees that saving a copy never overwrites
    // another copy with the same friendly name, or the imported source file.
    const session = state.db.db.transaction(() => {
      const pending = state.db.createSession({ project_name: project.name, project_path: projectPath,
        destination_folder: '', json_file: null, draft_json: JSON.stringify(project.toJSON()) });
      state.db.updateSession(pending.id, { destination_folder: join(projectPath, 'assets', 'claude-sprites', pending.id, project.name) });
      restoreProjectMetadata({ ...state, project, sessionId: pending.id });
      return pending;
    })();
    state.project = project;
    state.sessionId = session.id;
    state.broadcast?.({ type: 'project', data: project.toJSON(), sessionId: session.id });
    return { session_id: session.id, project_name: project.name, copied_from: origin ?? null };
  }
  router.post('/session/copy', route((req, res) => {
    const source = requireProject();
    const name = projectName(req.body.name ?? `${source.name} copy`);
    const project = Project.fromJSON(source.toJSON());
    project.name = name;
    res.json({ ok: true, data: activateCopy(project, state.sessionId) });
  }));
  router.post('/session/import', route((req, res) => {
    validateImport(req.body.project);
    const project = Project.fromJSON(req.body.project);
    project.name = projectName(req.body.name ?? project.name);
    res.json({ ok: true, data: activateCopy(project) });
  }));
  router.get('/workbench/project', route((_req, res) => {
    res.json({ ok: true, data: requireProject().toJSON(), session_id: state.sessionId });
  }));
  router.get('/workbench/sheet.png', route((_req, res) => {
    const project = requireProject();
    const renderer = new CanvasRenderer(project.palette, { background: project.background });
    res.type('png').send(renderer.renderSheet(project.cells, { gap: 0 }));
  }));
  router.get('/workbench/atlas', route((_req, res) => {
    const project = requireProject();
    res.json({ ok: true, data: project.exportAseprite({ imageName: `${project.name}.png` }) });
  }));
  router.post('/workbench/handoff', route((req, res) => {
    const project = requireProject();
    const { note, cell = '0,0', author = 'Artist' } = req.body;
    if (typeof note !== 'string' || note.length > 20_000 || typeof author !== 'string' || author.length > 120) throw new Error('Review note or author is too long');
    project.cells.getCell(cell);
    project.review = { note, cell, author, updatedAt: new Date().toISOString() };
    saveDraft(state);
    state.broadcast?.({ type: 'project', data: project.toJSON(), sessionId: state.sessionId });
    res.json({ ok: true, data: project.review });
  }));
  router.get('/workbench/palettes', route((_req, res) => {
    if (state.project) captureProjectMetadata(state);
    res.json({ ok: true, data: { current: state.project?.palette.toJSON() ?? [],
      presets: Palette.listPresets().map(name => ({ name, colors: Palette.fromPreset(name).toJSON() })),
      skinTones: { ...skinToneState(state.project), sessionId: state.sessionId },
    } });
  }));
  router.post('/workbench/skin-tone', route((req, res) => {
    const project = requireProject();
    const result = applySkinTone(project, req.body.tone);
    saveDraft(state);
    state.broadcast?.({ type: 'project', data: project.toJSON(), sessionId: state.sessionId });
    res.json({ ok: true, data: result });
  }));
  router.post('/workbench/map-operations', route((req, res) => {
    const operations = req.body.operations;
    if (!Array.isArray(operations) || !operations.length || operations.length > 1000) throw new Error('Provide 1–1000 expanded batch operations');
    const requests = operations.map((operation, index) => {
      if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw new Error(`Invalid operation ${index + 1}`);
      // Session changes must be explicit UI actions, never hidden inside an edit handoff.
      if (['new', 'save', 'export'].includes(operation.command)) throw new Error(`Use the ${operation.command} tool separately from editing operations`);
      return mapCommandToApi(operation);
    });
    res.json({ ok: true, data: requests });
  }));
  const localFilesOnly = (req, res, next) => {
    if (!localFileRequestAllowed(req)) return res.status(403).json({ ok: false, error: 'Local file tools require this server’s localhost page and a matching origin.' });
    next();
  };
  for (const command of ['build', 'trace', 'verify']) {
    router.post(`/workbench/${command}`, localFilesOnly, route(async (req, res) => {
      if (typeof req.body.path !== 'string' || !req.body.path.trim()) throw new Error('A local input file path is required');
      let report;
      if (command === 'build') report = await buildProject(req.body.path);
      if (command === 'trace') report = await traceImageFile(req.body.path, { output: req.body.out, name: req.body.name || 'image-trace' });
      if (command === 'verify') {
        const options = { ...req.body }; delete options.path;
        if (Array.isArray(options.outlineColors) && options.outlineColors.length === 0) delete options.outlineColors;
        report = await verifyAtlasFile(req.body.path, options);
      }
      res.json({ ok: true, data: report });
    }));
  }
  return router;
}
