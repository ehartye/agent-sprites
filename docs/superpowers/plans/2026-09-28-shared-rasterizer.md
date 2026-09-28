# Shared rasterizer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use h-superpowers:subagent-driven-development, h-superpowers:team-driven-development, or h-superpowers:executing-plans to implement this plan (ask user which approach). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One DOM-free shape rasterizer shared by the export and the editor, animation preview and cell thumbnails, with export pixels byte-identical.

**Architecture:** `server/web/public/js/shared/raster.js` holds `snapParams`, `rasterShape(type, p, pen)` and `floodFill(imageData, x, y, rgba)`; each renderer supplies a pen (`px`, `rect`). A browser helper `cell-raster.js` renders a cell natively offscreen for the preview and thumbnails. Spec: `docs/superpowers/specs/2026-09-28-shared-rasterizer-design.md`.

**Tech Stack:** Node ESM, node-canvas, vitest (+ jsdom for `tests/web-ui`).

---

### Task 0: Baseline

- [ ] Run the scratch hash script (`raster-baseline.mjs <out>`) on main: corpus through `renderCellRaw` + every example build's PNGs. Keep the JSON outside the repo.

### Task 1: Parity test (failing)

**Files:** Create `tests/web-ui/raster-parity.test.js`, `tests/fixtures/raster-corpus.js`.

- [ ] Corpus fixture: named shape lists covering circles r 0–8 filled/outline, ellipses (incl. 1-wide), rects filled/outline/1×1, lines (steep, shallow, reversed, single point, fractional), polygons/polylines (convex, self-intersecting star, fractional), all four patterns on rect/circle/ellipse/polygon plus a patterned outline, fill inside a ring and from the background, erase, points, a mixed cell; opaque and `rgba(…,0.5)` colours.
- [ ] For each entry: `renderCellRaw` (palette `resolve: c => c`, 20×20) versus
  - `CellNavigator` thumbnail (20×20 → scale 3): sample the centre of each 3×3 block;
  - `AnimationPreview` frame at its canvas scale: sample block centres;
  - `CanvasEditor` at zoom 1, opaque entries only, `fill` entries excepted: read the grid region.
  Checker colours are set to transparent through CSS variables so empty pixels read `[0,0,0,0]`.
- [ ] Run: `npx vitest run tests/web-ui/raster-parity.test.js` — expect FAIL on thumbnails (circles, ellipses, patterns, fills) and the preview (outlines, fills).

### Task 2: Shared module

**Files:** Create `server/web/public/js/shared/raster.js`, move `server/engine/patterns.js` → `server/web/public/js/shared/patterns.js` (old path re-exports), Create `tests/engine/raster.test.js`.

- [ ] Unit tests with a recording pen: filled rect → one `rect`; patterned filled rect → per-pixel `px` with `second` per the table; outline rect → four `rect`s; outline circle r=1 → 8 `px` per step including duplicates; `fill` → no calls; unknown pattern ignored; `snapParams` rounds numbers and points; `floodFill` fills a 4-connected region and stops at a border, no-op when colours match.
- [ ] Implement by moving `CanvasRenderer`'s algorithms verbatim onto the pen.

### Task 3: Export on the module

**Files:** Modify `server/engine/canvas-renderer.js`.

- [ ] `_drawShape`: `p = snapParams(shape.params)`; validate pattern with `patternTest`; `fill` → parse colour (1×1 canvas), `floodFill` on `getImageData`, `putImageData`; else `rasterShape(type, p, pen)` with the `fillRect` pen. Delete the moved methods.
- [ ] Rerun the baseline script with `--compare`: expect IDENTICAL. Run engine + handler + build tests.

### Task 4: Browser views on the module

**Files:** Create `server/web/public/js/cell-raster.js`; Modify `animation.js`, `cell-nav.js`, `canvas-editor.js`.

- [ ] `cell-raster.js`: `renderCellNative(shapes, w, h, resolveColor)` → offscreen canvas via `paintShapes` + `rasterShape`/`floodFill`.
- [ ] Preview and thumbnails draw that canvas scaled (thumbnails smooth only when reducing).
- [ ] Editor: one `penAt(ctx, ox, oy, z, color2)` used by main shapes, onion skin (no `second`) and drag preview (moved params); fill marker kept. Delete hand copies and the pattern table.
- [ ] Run parity test: PASS. Run `tests/web-ui`.

### Task 5: Docs, backlog, release

- [ ] Comments in `patterns.js`/`raster.js` state the no-DOM/no-Node rule.
- [ ] Bump 0.52.0 (package.json, lock, plugin.json, marketplace.json), `node scripts/setup.js`, `--check --json` ok.
- [ ] Full suite `npx vitest run --maxWorkers=4 --testTimeout=60000 --hookTimeout=60000`.
- [ ] Owner eye check, PR, squash-merge; wiki: rasterizer shipped, new backlog items for the `draw.js` helper mismatches, per-edit redraw cost, and `hitTestShapes`.
