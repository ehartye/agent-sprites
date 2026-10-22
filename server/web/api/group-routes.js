import { Router } from 'express';
import { saveDraft } from '../http.js';
import { GroupManager } from '../../engine/group-manager.js';
import { TAG_DIRECTIONS as DIRECTIONS } from '../../engine/project.js';
import { moveLayerSelection } from '../../engine/shape-layers.js';
import { durationFromFps } from '../public/js/shared/timing.js';
import { editCells } from '../../handlers/edit.js';
import { canonicalizeCellShapeGroups, getCellShapeGroups } from '../../project-state.js';

// Rebuild state.project.groups from SQLite and notify the browser.
function syncCellGroups(state) {
  const groups = state.db.getCellGroups(state.sessionId);
  state.project.groups = GroupManager.fromJSON(groups);
  // The editor preview reads timing and direction from the live project.
  state.project.animationFps = state.db.getCellGroupFps(state.sessionId);
  state.project.animationDirections = state.db.getCellGroupDirections(state.sessionId);
  saveDraft(state);
  state.broadcast?.({ type: 'group_created', groupKind: 'cell' }); // triggers legacy UI resync
}

/** A single-cell group operation must name a group that exists in that cell; silently touching nothing hid real mistakes. */
function requireGroupInCell(state, name, cell) {
  if (!Object.hasOwn(state.db.getShapeGroups(state.sessionId, cell), name)) throw new Error(`Shape group "${name}" not found in cell ${cell}`);
  return cell;
}

const DIRECTION_ERROR = 'direction must be forward, reverse, pingpong or pingpong_reverse';

function canonicalCellRefs(state, cells) {
  if (!Array.isArray(cells) || cells.some(cell => typeof cell !== 'string')) throw new Error('Animation group cells must be an array of cell references');
  return cells.map(cell => state.project.cells.resolveRef(cell));
}

export function groupRoutes(state) {
  const r = Router();
  // Bind per-cell groups to stable coordinates before aliases can be renamed.
  r.use('/group/shape', (req, res, next) => {
    try {
      if (req.method === 'POST' && req.body?.cell !== undefined && !req.body.all_cells) {
        req.body.cell = state.project.cells.resolveRef(req.body.cell);
        canonicalizeCellShapeGroups(state, req.body.cell);
      }
      next();
    } catch (error) { res.json({ ok: false, error: error.message }); }
  });
  r.use('/group/cell',(req,res,next)=>{
    if(req.method==='POST') {
      if(!state.project)return res.json({ok:false,error:'No active project'});
      if(typeof req.body?.name!=='string'||!req.body.name.length)return res.json({ok:false,error:'Animation group name must be a nonempty string'});
    }
    next();
  });

  // --- Cell groups (animation frame sets) ---
  r.post('/group/cell/create', (req, res) => {
    try {
      const { name, cells, fps, direction, loop } = req.body;
      if (direction != null && !DIRECTIONS.includes(direction)) return res.json({ ok: false, error: DIRECTION_ERROR });
      if (loop !== undefined && typeof loop !== 'boolean') throw new Error('Animation loop must be boolean');
      if (fps !== undefined) durationFromFps(fps);
      const canonicalCells = canonicalCellRefs(state, cells);
      state.db.setCellGroup(state.sessionId, name, canonicalCells);
      if (fps !== undefined) state.db.setCellGroupFps(state.sessionId, name, fps);
      if (direction != null) state.db.setCellGroupDirection(state.sessionId, name, direction);
      if (loop !== undefined) state.project.animationLoops = {...state.project.animationLoops,[name]:loop};
      syncCellGroups(state);
      res.json({ ok: true, data: `Created cell group "${name}"` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.post('/group/cell/fps', (req, res) => {
    try {
      const { name, fps } = req.body;
      const groups = state.db.getCellGroups(state.sessionId);
      if (!Object.hasOwn(groups, name)) return res.json({ ok: false, error: `Group "${name}" not found` });
      durationFromFps(fps);
      state.db.setCellGroupFps(state.sessionId, name, fps);
      syncCellGroups(state);
      res.json({ ok: true, data: `Group "${name}" fps set to ${fps}` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.post('/group/cell/loop', (req, res) => {
    try {
      const { name, loop } = req.body;
      if (!Object.hasOwn(state.db.getCellGroups(state.sessionId), name)) throw new Error(`Group "${name}" not found`);
      if (typeof loop !== 'boolean') throw new Error('Animation loop must be boolean');
      state.project.animationLoops = { ...state.project.animationLoops, [name]: loop };
      syncCellGroups(state);
      res.json({ ok: true, data: `Group "${name}" loop set to ${loop}` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  // Aseprite tag playback direction, emitted verbatim in meta.frameTags.
  r.post('/group/cell/direction', (req, res) => {
    try {
      const { name, direction } = req.body;
      const groups = state.db.getCellGroups(state.sessionId);
      if (!Object.hasOwn(groups, name)) return res.json({ ok: false, error: `Group "${name}" not found` });
      if (!DIRECTIONS.includes(direction)) return res.json({ ok: false, error: DIRECTION_ERROR });
      state.db.setCellGroupDirection(state.sessionId, name, direction);
      syncCellGroups(state);
      res.json({ ok: true, data: `Group "${name}" direction set to ${direction}` });
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
      const existing = Object.hasOwn(groups, name) ? groups[name] : [];
      const canonicalCells = canonicalCellRefs(state, newCells);
      const updated = [...existing], seen = new Set(existing);
      for (const cell of canonicalCells) {
        if (!seen.has(cell)) { updated.push(cell); seen.add(cell); }
      }
      state.db.setCellGroup(state.sessionId, name, updated);
      syncCellGroups(state);
      res.json({ ok: true, data: `Added to group "${name}"` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.post('/group/cell/remove', (req, res) => {
    try {
      const { name, cells: remove } = req.body;
      const groups = state.db.getCellGroups(state.sessionId);
      const canonicalRemove = new Set(canonicalCellRefs(state, remove));
      const updated = (Object.hasOwn(groups, name) ? groups[name] : []).filter(c => !canonicalRemove.has(c));
      state.db.setCellGroup(state.sessionId, name, updated);
      syncCellGroups(state);
      res.json({ ok: true, data: `Removed from group "${name}"` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.post('/group/cell/delete', (req, res) => {
    try {
      state.db.deleteCellGroup(state.sessionId, req.body.name);
      if (state.project.animationLoops) delete state.project.animationLoops[req.body.name];
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
        state.broadcast?.({ type: 'group_created', groupKind: 'shape', cells: matched });
        return res.json({ ok: true, data: `Created shape group "${name}" in ${matched.length} cells` });
      }
      state.db.setShapeGroup(state.sessionId, cell, name, shapes);
      state.broadcast?.({ type: 'group_created', groupKind: 'shape', cell });
      res.json({ ok: true, data: `Created shape group "${name}" in ${cell}` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.get('/group/shape/list', (req, res) => {
    try {
      res.json({ ok: true, data: getCellShapeGroups(state, state.project.cells.resolveRef(req.query.cell)) });
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
      const existing = Object.hasOwn(groups, name) ? groups[name] : [];
      state.db.setShapeGroup(state.sessionId, cell, name, [...new Set([...existing, ...newShapes])]);
      state.broadcast?.({ type: 'group_created', groupKind: 'shape', cell });
      res.json({ ok: true, data: `Added shapes to group "${name}"` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.post('/group/shape/remove', (req, res) => {
    try {
      const { cell, name, shapes: remove } = req.body;
      const groups = state.db.getShapeGroups(state.sessionId, cell);
      const updated = (Object.hasOwn(groups, name) ? groups[name] : []).filter(s => !remove.includes(s));
      state.db.setShapeGroup(state.sessionId, cell, name, updated);
      state.broadcast?.({ type: 'group_created', groupKind: 'shape', cell });
      res.json({ ok: true, data: `Removed shapes from group "${name}"` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.post('/group/shape/delete', (req, res) => {
    try {
      state.db.deleteShapeGroup(state.sessionId, req.body.cell, req.body.name);
      state.broadcast?.({ type: 'group_created', groupKind: 'shape', cell: req.body.cell });
      res.json({ ok: true, data: `Deleted shape group "${req.body.name}"` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.post('/group/shape/move', (req, res) => {
    try {
      const { name, cell, all_cells, dx, dy } = req.body;
      const cellsToUpdate = all_cells
        ? Object.keys(state.db.getAllShapeGroups(state.sessionId)).filter(c => {
            const groups = state.db.getShapeGroups(state.sessionId, c);
            return Object.hasOwn(groups, name);
          })
        : [requireGroupInCell(state, name, cell)];
      editCells(state, cellsToUpdate.map(c => state.project.cells.getCell(c)), scoped => {
        for (const c of cellsToUpdate) {
          const groups = state.db.getShapeGroups(state.sessionId, c);
          const shapes = groups[name] ?? [];
          const cellObj = state.project.cells.getCell(c);
          if (cellObj.shapes.listByZ().some(shape => Object.hasOwn(shape.params, 'layers'))) moveLayerSelection(cellObj, shapes, dx, dy);
          else for (const shapeName of shapes) cellObj.moveShape(shapeName, dx, dy);
          scoped.broadcast({ type: 'shape_moved', cell: c });
        }
      });
      saveDraft(state);
      res.json({ ok: true, data: `Moved group "${name}" by (${dx},${dy})` });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });

  r.post('/group/shape/recolor', (req, res) => {
    try {
      const { name, cell, all_cells, color, color2 } = req.body;
      const cellsToUpdate = all_cells
        ? Object.keys(state.db.getAllShapeGroups(state.sessionId)).filter(c => {
            return Object.hasOwn(state.db.getShapeGroups(state.sessionId, c), name);
          })
        : [requireGroupInCell(state, name, cell)];
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
