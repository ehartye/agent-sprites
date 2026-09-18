import { Router } from 'express';
import { Project } from '../../engine/project.js';
import { GroupManager } from '../../engine/group-manager.js';
import { CanvasRenderer } from '../../engine/canvas-renderer.js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { saveDraft } from '../http.js';

export function sessionRoutes(state) {
  const r = Router();

  r.get('/status', (_req, res) => {
    const session = state.sessionId && state.project ? state.db.getSession(state.sessionId) : null;
    if (!session) return res.json({ ok: true, data: { active: false } });
    res.json({ ok: true, data: {
      active: true,
      project_name: session.project_name,
      project_path: session.project_path,
      destination_folder: session.destination_folder,
      json_file: session.json_file,
      session_id: session.id,
    }});
  });

  r.post('/new', (req, res) => {
    try {
      const { name, size = 16, width, height, rows = 4, cols = 4, palette = 'pico8', cwd, dest } = req.body;
      if (!name) return res.json({ ok: false, error: 'name required' });
      // Destination follows the CLI caller's cwd (or an explicit --dest parent),
      // not wherever the server process happened to start.
      const project_path = cwd ?? process.cwd();
      const destination_folder = dest ? join(dest, name) : join(project_path, 'assets', 'claude-sprites', name);
      const w = width ?? size;
      const h = height ?? w;
      const project = Project.create({ name, cellWidth: w, cellHeight: h, rows, cols, palette });
      state.project = project;
      const draft_json = JSON.stringify(project.toJSON());
      const session = state.db.createSession({ project_name: name, project_path, destination_folder, json_file: null, draft_json });
      state.sessionId = session.id;
      state.broadcast?.({ type: 'project', data: project.toJSON() });
      res.json({ ok: true, data: `Created "${name}" (${w}x${h}px ${rows}x${cols})` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.post('/open', (req, res) => {
    try {
      const { path: filePath } = req.body;
      if (!filePath) return res.json({ ok: false, error: 'path required' });
      const project = Project.load(filePath);
      state.project = project;
      const name = project.name;
      const project_path = process.cwd();
      const destination_folder = join(project_path, 'assets', 'claude-sprites', name);
      const draft_json = JSON.stringify(project.toJSON());
      const session = state.db.createSession({ project_name: name, project_path, destination_folder, json_file: filePath, draft_json });
      state.sessionId = session.id;
      state.broadcast?.({ type: 'project', data: project.toJSON() });
      res.json({ ok: true, data: `Opened "${name}" from ${filePath}` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.post('/save', (req, res) => {
    try {
      if (!state.project) return res.json({ ok: false, error: 'No active project' });
      const session = state.db.getSession(state.sessionId);
      let target = session?.json_file;
      if (!target) {
        mkdirSync(session.destination_folder, { recursive: true });
        target = join(session.destination_folder, `${session.project_name}.json`);
        state.db.updateSession(state.sessionId, { json_file: target });
      }
      writeFileSync(target, JSON.stringify(state.project.toJSON(), null, 2));
      res.json({ ok: true, data: `Saved to ${target}`, artifacts: [{ type: 'project', path: resolve(target) }] });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.get('/list', (_req, res) => {
    try { res.json({ ok: true, data: state.db.listSessions() }); }
    catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.post('/open-session', (req, res) => {
    try {
      const { ref } = req.body;
      if (!ref) return res.json({ ok: false, error: 'ref required' });
      const session = state.db.getSession(ref) ?? state.db.findSessionByName(ref);
      if (!session) return res.json({ ok: false, error: `No session matching "${ref}"` });
      if (!session.draft_json) return res.json({ ok: false, error: `Session "${ref}" has no draft to restore` });
      state.project = Project.fromJSON(JSON.parse(session.draft_json));
      state.sessionId = session.id;
      state.project.groups = GroupManager.fromJSON(state.db.getCellGroups(session.id));
      state.broadcast?.({ type: 'project', data: state.project.toJSON() });
      res.json({ ok: true, data: `Opened "${session.project_name}" (${session.id})` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.post('/pivot', (req, res) => {
    try {
      if (!state.project) return res.json({ ok: false, error: 'No active project' });
      const { x, y, anchor } = req.body;
      let pivot;
      if (anchor) {
        const w = state.project.cellWidth, h = state.project.cellHeight;
        const presets = {
          'center': { x: Math.floor(w / 2), y: Math.floor(h / 2) },
          'top-center': { x: Math.floor(w / 2), y: 0 },
          'bottom-center': { x: Math.floor(w / 2), y: h - 1 },
          'bottom-left': { x: 0, y: h - 1 },
          'bottom-right': { x: w - 1, y: h - 1 },
        };
        pivot = presets[anchor];
        if (!pivot) return res.json({ ok: false, error: `Unknown anchor "${anchor}" (use ${Object.keys(presets).join('|')})` });
      } else if (x !== undefined && y !== undefined) {
        pivot = { x, y };
      } else {
        return res.json({ ok: false, error: 'pivot requires --x and --y, or --anchor' });
      }
      state.project.pivot = pivot;
      saveDraft(state);
      res.json({ ok: true, data: `Pivot set to ${pivot.x},${pivot.y}` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.post('/export', (req, res) => {
    try {
      if (!state.project) return res.json({ ok: false, error: 'No active project' });
      const session = state.db.getSession(state.sessionId);
      // One-off destination override; the session's stored folder is untouched.
      const dest = req.body?.dest ?? session.destination_folder;
      const renderer = new CanvasRenderer(state.project.palette, { background: state.project.background });
      // gap: 0 — the atlas rects are gapless, so the sheet must be too
      const png = renderer.renderSheet(state.project.cells, { gap: 0 });
      mkdirSync(dest, { recursive: true });
      const pngPath = join(dest, `${session.project_name}.png`);
      const atlasPath = join(dest, `${session.project_name}.atlas.json`);
      const atlas = state.project.exportAseprite({
        imageName: `${session.project_name}.png`,
        groups: state.db.getCellGroups(state.sessionId),
        fpsMap: state.db.getCellGroupFps(state.sessionId),
      });
      writeFileSync(pngPath, png);
      writeFileSync(atlasPath, JSON.stringify(atlas, null, 2));
      res.json({
        ok: true,
        data: `Exported sheet ${pngPath} + atlas ${atlasPath}`,
        artifacts: [{ type: 'sheet', path: resolve(pngPath) }, { type: 'atlas', path: resolve(atlasPath) }],
        export: { session_id: state.sessionId, size: atlas.meta.size, frameTags: atlas.meta.frameTags },
      });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  return r;
}
