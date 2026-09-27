import { Router } from 'express';
import { handleShiftCell, handleMirrorCell, handleCopyCell,
         handleClearCell, handleNameCell, handleListCells,
         handleCloneFanout, handleRotateCell, handleSetReference } from '../../handlers/cell.js';
import { handleUndo, handleRedo } from '../../handlers/history.js';
import { handleViewCell, handleViewSheet, handleViewStack } from '../../handlers/view.js';
import { saveDraft } from '../http.js';

export function cellRoutes(state) {
  const r = Router();
  const wrap = (handler) => (req, res) => {
    try {
      const result = handler(state, req.body);
      saveDraft(state);
      res.json({ ok: true, data: result ?? 'ok' });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  };
  r.post('/cell/copy',   wrap(handleCopyCell));
  r.post('/cell/clone-fanout', wrap(handleCloneFanout));
  r.post('/cell/clear',  wrap(handleClearCell));
  r.post('/cell/name',   wrap(handleNameCell));
  r.post('/cell/shift',  wrap(handleShiftCell));
  r.post('/cell/mirror', wrap(handleMirrorCell));
  r.post('/cell/rotate', wrap(handleRotateCell));
  r.post('/cell/reference', wrap(handleSetReference));
  r.get('/cell/reference-image', (req, res) => {
    try {
      if (!state.project) return res.status(404).end();
      const cell = state.project.cells.getCell(String(req.query.cell));
      if (!cell.reference) return res.status(404).end();
      res.sendFile(cell.reference.path);
    } catch { res.status(404).end(); }
  });
  r.post('/cell/undo',   wrap(handleUndo));
  r.post('/cell/redo',   wrap(handleRedo));
  r.get('/cells',        (_req, res) => {
    try { res.json({ ok: true, data: handleListCells(state, {}) }); }
    catch (e) { res.json({ ok: false, error: e.message }); }
  });
  r.post('/cell/view',   (req, res) => {
    try {
      const result = handleViewCell(state, req.body, state.tmpDir);
      res.json({ ok: true, data: result });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });
  r.post('/view/stack',  (req, res) => {
    try {
      res.json({ ok: true, data: handleViewStack(state, req.body, state.tmpDir) });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });
  r.post('/view/sheet',  (req, res) => {
    try {
      const result = handleViewSheet(state, req.body, state.tmpDir);
      res.json({ ok: true, data: result });
    } catch (e) { res.json({ ok: false, error: e.message }); }
  });
  return r;
}
