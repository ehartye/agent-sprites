import { Router } from 'express';
import { constructionReplayMetadata, renderConstructionReplay } from '../../engine/construction-replay.js';

/** Construction evidence is read-only and independent of the live undo stack. */
export function constructionReplayRoutes(state) {
  const router = Router();
  const route = fn => (req, res) => {
    try {
      if (!state.project) throw new Error('No active project');
      fn(req, res);
    } catch (error) { res.json({ ok: false, error: error.message }); }
  };
  router.get('/workbench/replay', route((_req, res) => {
    res.json({ ok: true, data: constructionReplayMetadata(state.project) });
  }));
  router.post('/workbench/replay', route((req, res) => {
    const { images, ...data } = renderConstructionReplay(state.project, req.body);
    res.json({ ok: true, data, images: Object.fromEntries(Object.entries(images).map(([name, png]) => [name, `data:image/png;base64,${png.toString('base64')}`])) });
  }));
  return router;
}
