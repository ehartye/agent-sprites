import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { activateProjectCopy, projectName } from '../../session-activation.js';
import { Project } from '../../engine/project.js';
import { Palette } from '../../engine/palette.js';
import { CanvasRenderer } from '../../engine/canvas-renderer.js';
import { captureProjectMetadata } from '../../project-state.js';
import { saveDraft } from '../http.js';
import { mapCommandToApi } from '../../../scripts/batch-commands.js';
import { buildProject } from '../../build/project-build.js';
import { traceImageFile } from '../../engine/image-trace.js';
import { verifyAtlasFile } from '../../engine/atlas-verifier.js';
import { renderAtlasProof } from '../../engine/atlas-proof.js';
import { applySkinTone, skinToneState } from '../../engine/skin-tones.js';
import { COMMANDS } from '../../commands/catalog.js';

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

function validateImport(data) {
  const rows = data?.grid?.rows, cols = data?.grid?.cols;
  // Project.fromJSON delegates dimensions and exact arithmetic to CellManager
  // before activation. Import must accept the same grids the engine can export.
  if (!Array.isArray(data?.palette) || !data?.cells || typeof data.cells !== 'object') {
    throw new Error('Invalid project palette or cells');
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
  router.get('/workbench/commands', route((_req, res) => {
    res.json({ ok: true, data: COMMANDS });
  }));
  router.post('/session/copy', route((req, res) => {
    const source = requireProject();
    const name = projectName(req.body.name ?? `${source.name} copy`);
    const project = Project.fromJSON(source.toJSON());
    project.name = name;
    res.json({ ok: true, data: activateProjectCopy(state, project, { origin: state.sessionId }) });
  }));
  router.post('/session/import', route((req, res) => {
    validateImport(req.body.project);
    const project = Project.fromJSON(req.body.project);
    project.name = projectName(req.body.name ?? project.name);
    res.json({ ok: true, data: activateProjectCopy(state, project) });
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
  for (const command of ['build', 'trace', 'verify', 'atlas-proof']) {
    router.post(`/workbench/${command}`, localFilesOnly, route(async (req, res) => {
      if (typeof req.body.path !== 'string' || !req.body.path.trim()) throw new Error('A local input file path is required');
      let report;
      if (command === 'atlas-proof') {
        report = await renderAtlasProof(req.body.path, { output: req.body.out });
        return res.json({ ok: true, data: report,
          preview: `data:image/gif;base64,${readFileSync(report.artifacts.gif).toString('base64')}`,
          previewPoster: `data:image/png;base64,${readFileSync(report.artifacts.frames[0]).toString('base64')}`,
        });
      }
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
