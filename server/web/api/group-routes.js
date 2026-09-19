import { Router } from 'express';
import { saveDraft } from '../http.js';
import { GroupManager } from '../../engine/group-manager.js';

// Rebuild state.project.groups from SQLite and notify the browser.
function syncCellGroups(state) {
  const groups = state.db.getCellGroups(state.sessionId);
  state.project.groups = GroupManager.fromJSON(groups);
  state.broadcast?.({ type: 'group_created' }); // triggers get_project resync in UI
}

export function groupRoutes(state) {
  const r = Router();

  // --- Cell groups (animation frame sets) ---
  r.post('/group/cell/create', (req, res) => {
    try {
      const { name, cells, fps } = req.body;
      state.db.setCellGroup(state.sessionId, name, cells);
      if (fps != null) state.db.setCellGroupFps(state.sessionId, name, fps);
      syncCellGroups(state);
      res.json({ ok: true, data: `Created cell group "${name}"` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.post('/group/cell/fps', (req, res) => {
    try {
      const { name, fps } = req.body;
      const groups = state.db.getCellGroups(state.sessionId);
      if (!(name in groups)) return res.json({ ok: false, error: `Group "${name}" not found` });
      if (!Number.isFinite(fps) || fps <= 0) return res.json({ ok: false, error: 'fps must be a positive number' });
      state.db.setCellGroupFps(state.sessionId, name, fps);
      res.json({ ok: true, data: `Group "${name}" fps set to ${fps}` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.get('/group/cell/list', (_req, res) => {
    try {
      res.json({ ok: true, data: state.db.getCellGroups(state.sessionId) });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.post('/group/cell/add', (req, res) => {
    try {
      const { name, cells: newCells } = req.body;
      const groups = state.db.getCellGroups(state.sessionId);
      const existing = groups[name] ?? [];
      state.db.setCellGroup(state.sessionId, name, [...new Set([...existing, ...newCells])]);
      syncCellGroups(state);
      res.json({ ok: true, data: `Added to group "${name}"` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.post('/group/cell/remove', (req, res) => {
    try {
      const { name, cells: remove } = req.body;
      const groups = state.db.getCellGroups(state.sessionId);
      const updated = (groups[name] ?? []).filter(c => !remove.includes(c));
      state.db.setCellGroup(state.sessionId, name, updated);
      syncCellGroups(state);
      res.json({ ok: true, data: `Removed from group "${name}"` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.post('/group/cell/delete', (req, res) => {
    try {
      state.db.deleteCellGroup(state.sessionId, req.body.name);
      syncCellGroups(state);
      res.json({ ok: true, data: `Deleted group "${req.body.name}"` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  // --- Shape groups (per-cell, move as unit) ---
  r.post('/group/shape/create', (req, res) => {
    try {
      const { cell, name, shapes, all_cells, pattern } = req.body;
      if (all_cells && pattern) {
        let re;
        try { re = new RegExp(pattern); }
        catch (e) { throw new Error(`Invalid pattern "${pattern}": ${e.message}`); }
        const { rows, cols } = state.project.cells;
        const matched = [];
        for (let r2 = 0; r2 < rows; r2++) {
          for (let c2 = 0; c2 < cols; c2++) {
            const ref = `${r2},${c2}`;
            const cellObj = state.project.cells.getCell(ref);
            const names = cellObj.shapes.listByZ()
              .map(s => s.name)
              .filter(n => n && re.test(n));
            if (names.length) {
              state.db.setShapeGroup(state.sessionId, ref, name, names);
              matched.push(ref);
            }
          }
        }
        return res.json({ ok: true, data: `Created shape group "${name}" in ${matched.length} cells` });
      }
      state.db.setShapeGroup(state.sessionId, cell, name, shapes);
      res.json({ ok: true, data: `Created shape group "${name}" in ${cell}` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.get('/group/shape/list', (req, res) => {
    try {
      res.json({ ok: true, data: state.db.getShapeGroups(state.sessionId, req.query.cell) });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  // All shape groups across every cell. UI uses this to compute cross-cell counts.
  r.get('/group/shape/list-all', (_req, res) => {
    try {
      res.json({ ok: true, data: state.db.getAllShapeGroups(state.sessionId) });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.post('/group/shape/add', (req, res) => {
    try {
      const { cell, name, shapes: newShapes } = req.body;
      const groups = state.db.getShapeGroups(state.sessionId, cell);
      const existing = groups[name] ?? [];
      state.db.setShapeGroup(state.sessionId, cell, name, [...new Set([...existing, ...newShapes])]);
      res.json({ ok: true, data: `Added shapes to group "${name}"` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.post('/group/shape/remove', (req, res) => {
    try {
      const { cell, name, shapes: remove } = req.body;
      const groups = state.db.getShapeGroups(state.sessionId, cell);
      const updated = (groups[name] ?? []).filter(s => !remove.includes(s));
      state.db.setShapeGroup(state.sessionId, cell, name, updated);
      res.json({ ok: true, data: `Removed shapes from group "${name}"` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.post('/group/shape/delete', (req, res) => {
    try {
      state.db.deleteShapeGroup(state.sessionId, req.body.cell, req.body.name);
      res.json({ ok: true, data: `Deleted shape group "${req.body.name}"` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.post('/group/shape/move', (req, res) => {
    try {
      const { name, cell, all_cells, dx, dy } = req.body;
      const cellsToUpdate = all_cells
        ? Object.keys(state.db.getAllShapeGroups(state.sessionId)).filter(c => {
            const groups = state.db.getShapeGroups(state.sessionId, c);
            return name in groups;
          })
        : [cell];
      for (const c of cellsToUpdate) {
        const groups = state.db.getShapeGroups(state.sessionId, c);
        const shapes = groups[name] ?? [];
        const cellObj = state.project.cells.getCell(c);
        for (const shapeName of shapes) {
          cellObj.moveShape(shapeName, dx, dy);
        }
        state.broadcast?.({ type: 'shape_moved', cell: c });
      }
      saveDraft(state);
      res.json({ ok: true, data: `Moved group "${name}" by (${dx},${dy})` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.post('/group/shape/recolor', (req, res) => {
    try {
      const { name, cell, all_cells, color, color2 } = req.body;
      const cellsToUpdate = all_cells
        ? Object.keys(state.db.getAllShapeGroups(state.sessionId)).filter(c => {
            return name in state.db.getShapeGroups(state.sessionId, c);
          })
        : [cell];
      for (const c of cellsToUpdate) {
        const groups = state.db.getShapeGroups(state.sessionId, c);
        const shapes = groups[name] ?? [];
        const cellObj = state.project.cells.getCell(c);
        for (const shapeName of shapes) {
          cellObj.recolorShape(shapeName, color, color2);
        }
        state.broadcast?.({ type: 'shape_recolored', cell: c });
      }
      saveDraft(state);
      res.json({ ok: true, data: `Recolored group "${name}" to ${color}` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  return r;
}
