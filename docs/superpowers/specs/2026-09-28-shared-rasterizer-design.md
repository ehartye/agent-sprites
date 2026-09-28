# One shape rasterizer for the export and every browser view — design

Date: 2026-09-28. Status: approved in conversation (scope: views only; approach A,
a shared pen module).

## Problem

The export (`server/engine/canvas-renderer.js`) and three browser renderers
(`canvas-editor.js`, `animation.js`, `cell-nav.js` in `server/web/public/js`) each
carry a hand copy of the shape rules. The copies have drifted:

- thumbnails use the old `r²` circle rule (nubbed circles), draw no ellipses, no
  outline circles, no patterns and no fills, and never round line endpoints;
- the animation preview draws no outline circles or ellipses and no fills;
- the editor's drag preview draws patterned rects solid, and its onion skin skips
  outline circles and paints `color2` pixels in their real colour.

No test compares a browser view with the export.

## Scope

The export and the three browser views share one module. **Export pixels stay
byte-identical.** Mismatches inside the export's own helpers in
`server/handlers/draw.js` (the `border`/`ring` circle silhouette and second line
routine, the `clip_to` circle mask), the whole-strip redraw per edit, and
`hitTestShapes` are out of scope and recorded as backlog items.

## Design

### Shared module: `server/web/public/js/shared/raster.js`

Pure functions: no DOM, no `canvas` package, no Node APIs. It lives in the served
folder so the browser loads it through the existing static route and the jsdom
tests import it by relative path; the export imports
`../web/public/js/shared/raster.js`. `patterns.js` moves beside it;
`server/engine/patterns.js` becomes a re-export.

- `snapParams(params)` — the export's rounding: numbers `Math.round`ed, polygon
  points rounded, everything else unchanged.
- `rasterShape(type, p, pen)` — `point`, `line`, `rect`, `circle`, `ellipse`,
  `polygon`, `polyline`, moved unchanged from `CanvasRenderer`. `fill` and unknown
  types draw nothing. The pen has `px(x, y, second)` and `rect(x, y, w, h)`;
  `second` is true only on fill pixels a two-colour pattern paints with `color2`
  (pattern set, `filled !== false`, `color2 != null`, known pattern name). The
  calls are exactly today's `fillRect` calls in order and shape (filled rect: one
  `rect`; patterned filled rect: per-pixel `px`; outline rect: four edge `rect`s;
  polygon: fill then outline), so overlapping semi-transparent pixels blend as now.
- `floodFill(imageData, x, y, rgba)` — the export's 4-connected fill, exact RGBA
  match, moved unchanged. Colour parsing stays with each caller.

The export still rejects an unknown pattern name (`patternTest` throws) before
rasterizing; the module ignores one so a browser view never throws mid-render.

### Pens

| Renderer | Pen | `fill` |
|---|---|---|
| Export | `fillRect`; `second` swaps `fillStyle` to `color2` and back, as `_px` did | `floodFill` on the cell canvas |
| Editor | `fillRect` at `ox + x·z`, size `z` | seed marker at 50% alpha (unchanged) |
| Editor onion skin | same pen, tint only, `second` ignored | skipped |
| Editor drag preview | same pen on the moved params | skipped |
| Animation preview, thumbnails | `renderCellNative` (below) | real `floodFill` |

`server/web/public/js/cell-raster.js` (browser-only) adds
`renderCellNative(shapes, w, h, resolveColor)`: draws the shapes at native size on
a transparent offscreen canvas through `paintShapes` (so erase still works),
flood-fills on that canvas, and returns it. The preview draws it scaled with
smoothing off; thumbnails scale with smoothing off at integer scale and on when
reducing a large cell, so single pixels are not dropped.

Removed: `CanvasRenderer._drawLine/_drawCircle/_drawEllipse/_drawPolygon/_px/
_floodFill`, and every hand copy and pattern table in the three browser files.

## Testing

1. Before the change, hash a primitive corpus (every primitive filled and outline,
   every pattern, erase, fill, fractional params, opaque and semi-transparent
   colours) through `renderCellRaw`, plus every example build's PNGs. After the
   change every hash must match.
2. `tests/web-ui/raster-parity.test.js` (jsdom): each browser view renders the
   corpus and must equal `renderCellRaw` pixel for pixel (editor at zoom 1, fills
   excepted as seed markers; preview at scale 1; thumbnails at integer scale,
   sampled per cell pixel). Written first; fails today.
3. `tests/engine/raster.test.js`: pen call sequences, `floodFill`, `snapParams`.
4. Existing pixel, pattern, erase, stroke-width, determinism and browser tests pass;
   any browser assertion of the old wrong pixels is updated and listed in the PR.
5. Owner eye check of the editor, strip and preview beside the export before merge.

Release: 0.52.0 (minor; the browser views visibly change).
