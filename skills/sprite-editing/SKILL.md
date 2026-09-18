---
name: sprite-editing
description: Create, edit, animate, and export pixel-art sprites with agent-sprites. Use for sprite drawing, named frames, JSON operation batches, sprite sheets, and Aseprite atlases. Not for CSS/SVG animation or editing an existing vector logo.
---

# Sprite Sheet Editing

CLI tools for pixel art creation in a cell-based sprite sheet. First use or plugin
update: run [sprite setup](../sprite-setup/SKILL.md), including its version sync check.
Always invoke `node "<this-plugin-root>/scripts/run-managed.js"` using the root
resolved from this loaded skill. Never use a PATH executable, checkout CLI, or
plugin-cache CLI. The launcher requires the matching external managed install.

Read [CLI setup](references/cli-setup.md) for path resolution and checked shell
examples. Below, `sprite.js` means that managed launcher. Stop after a failed command.

With dependencies installed, the CLI starts the server when needed. The web UI
at `http://localhost:3377` shows updates; `SPRITE_PORT` changes the port. An
unrelated service is an identity error: choose an unused port, do not stop that
service. Ports do not isolate the shared session database.

## Project Setup

```
sprite.js new myproject --size 16 --rows 4 --cols 4 --palette pico8
```

- Default: 16x16 cells, 4x4 grid, pico8 palette
- Non-square cells: `--size 16x32` (width x height) — the usual shape for tall characters
- Built-in palettes: `pico8`, `gameboy`, `nes`, `cga`
- Name cells immediately: `sprite.js name --cell 0,0 --as idle_1`
- Check project state: `sprite.js status`
- `new --dest <parent>` stores the destination as `<parent>/<name>`;
  `export --dest <folder>` writes directly into that folder for one export.
- Changes are drafted automatically in SQLite. `save` explicitly writes project
  JSON (by default into the session's asset folder); omit it when assets should
  contain only the PNG and atlas. Inspect supplied ops for `save` and destinations.

## Replaying an ops file

For a repeatable asset build, use `sprite.js build sprite-project.json --json`.
Copy `<plugin-root>/examples/blink` into the user's project as a starting point;
never generate build outputs in the plugin cache. The config selects an `ops` file
or Node `generator`, an explicit `output`, and `expectedTags`. Build isolates state
from live editing, verifies before publishing, and emits PNG, atlas, editable
project, contact sheet and self-contained preview. Inspect both contact sheet and
animation before integration. See the [build config](../../README.md#build-a-repeatable-asset-project).

The config/ops/generator is canonical. Rebuild replaces its generated directory;
copy the editable project elsewhere before making a separate manual variant.
For operations on the existing live session, use `batch` below.

Use `sprite.js batch ops.json --json` for a machine-readable summary, or `--quiet`
for a concise summary and artifact paths. Both stop on the first failed op by
default. `--continue-on-error` attempts the remaining ops but still exits 1 if
anything failed. Never publish partial exports from a failed batch. See
[batch flags and summary fields](references/tool-reference.md#batch-mode).

## Core Drawing Workflow

**Name every shape as you draw** — use the `--name` flag. Names enable later lookup by `move`, `recolor`, etc.

Draw order: background/large shapes first (lower z), details on top. Shapes outside the cell boundary render dimmed in the UI and are masked at export.

```
sprite.js draw rect    --cell 0,0 --x 0 --y 0 --w 5 --h 5 --color "#ff0000" --name bg
sprite.js draw circle  --cell 0,0 --cx 8 --cy 8 --r 5 --color "#00ff00" --name body
sprite.js draw ellipse --cell 0,0 --cx 8 --cy 8 --rx 6 --ry 3 --color "#0000ff" --name shadow
sprite.js draw line    --cell 0,0 --x1 0 --y1 0 --x2 15 --y2 15 --color "#ff0000" --name limb
sprite.js draw point   --cell 0,0 --x 5 --y 3 --color "#ffffff" --name highlight
sprite.js draw fill    --cell 0,0 --x 0 --y 0 --color "#0000ff" --name flood
sprite.js draw polygon --cell 0,0 --points "2,2 12,4 8,12" --filled true --color "#ff0000" --name blade
sprite.js draw polyline --cell 0,0 --points "0,8 4,4 8,8 12,4" --color "#ffffff" --name zigzag
```

Polygons/polylines move, flip, rotate, and group like any other named shape — prefer one named polygon over a pile of line/point shapes for angular forms.

Use `sprite.js view --cell 0,0` or check the web UI frequently to verify your work.

## Animation Workflow

The efficient pattern for multi-frame animation:

1. **Draw one frame completely** — get the composition right
2. **Copy to remaining frames** — `sprite.js clone-cell --from 0,0 --to "0,1 0,2 0,3"`
3. **Group for playback** — `sprite.js group create walk 0,0 0,1 0,2 0,3 --fps 8`
4. **Tween the motion** — `sprite.js tween ball --group walk --to 12,8 --ease out` interpolates position (and/or params via `--to-updates '{"ry":2}'`) across all frames in one call; fall back to per-frame `move-to` only for non-interpolatable adjustments

For position-only changes across frames, `sprite.js clone` copies a single shape from one cell to another — useful when only one element moves.

Prefer `move-to` over relative offsets when you know the target coordinate — it's idempotent and easier to reason about.

## Shape Editing

```
sprite.js shapes   --cell 0,0                          # inspect shapes (z-ordered)
sprite.js move-to  ball --cell 0,0 --x 8 --y 4         # absolute position
sprite.js move     ball --cell 0,0 --dx 2 --dy -1       # relative offset
sprite.js resize   ball --cell 0,0 --updates '{"r":5}'  # change dimensions
sprite.js recolor  ball --cell 0,0 --color "#00ff00"    # swap color
sprite.js clone    ball --from 0,0 --to 0,1 --as ball2  # copy across cells
sprite.js delete   ball --cell 0,0                      # remove shape
sprite.js flip     limb --cell 0,0 --axis horizontal    # mirror in place (--about cell to mirror position too)
sprite.js rotate   bar  --cell 0,0 --deg 90             # 90° CW steps (--about cell to orbit cell center)
sprite.js undo     --cell 0,0                           # step back
sprite.js redo     --cell 0,0                           # step forward
```

## Cell Operations

```
sprite.js copy     --from 0,0 --to 0,1         # deep copy all shapes
sprite.js ref set art.png --cell 0,0            # tracing underlay in view/UI (never exported)
sprite.js mirror   --cell 0,0 --axis horizontal # flip whole cell (walk-left from walk-right)
sprite.js rotate-cell --cell 0,0 --deg 90       # rotate whole cell (spin frames from one pose)
sprite.js clear    --cell 0,0                   # remove all shapes
sprite.js name     --cell 0,0 --as idle_1       # name a cell
sprite.js view     --cell 0,0                   # render cell preview
```

## Groups

Cell groups organize frames into animation sequences. Shape groups let you move/recolor multiple shapes at once.

```
sprite.js group create walk 0,0 0,1 0,2 0,3    # create cell group
sprite.js group list                            # list all cell groups
sprite.js group add walk 0,4 0,5                # add cells to group
sprite.js group remove walk 0,4                 # remove cells from group
sprite.js group delete walk                     # delete cell group

sprite.js shape-group create --cell 0,0 face eye_l eye_r mouth   # create shape group
sprite.js shape-group list --cell 0,0                             # list shape groups
sprite.js move-group face --cell 0,0 --dx 2 --dy 0               # move all shapes in group
sprite.js recolor-group face --cell 0,0 --color "#ff0000"         # recolor all shapes
```

## Pixel technique notes

Hard-won recipes from real builds:

- **Outline a filled circle with a same-radius unfilled circle drawn after it**
  — not a bigger backing disc. The renderer trims the 1px N/S/E/W tips of
  filled circles/ellipses; a backing disc one radius larger leaves nub
  artifacts at the cardinals where the trims disagree.
- **Thick arcs are polygons, not stacked arcs.** Concentric 1px arcs leave
  diagonal raster gaps. For a solid crescent (sword slash, moon, rainbow),
  compute a filled polygon: outer arc swept one way, inner arc traced back.
  A build-script helper makes this a one-liner (see the generator-script
  pattern in the tool reference).
- **Repeat cells in a group for 4-beat walk cycles.** Groups accept the same
  cell more than once and export emits one frame per occurrence — so
  `group create walkd 0,1 0,0 0,2 0,0` plays `step-L, pass, step-R, pass`
  from three drawn frames. No duplicate art, no ping-pong tag needed.

## Detail tiers — when to use what

Match effort to on-screen size before drawing anything:

- **Game sprites (16×16–16×32, many frames):** simple forms, 5–20 shapes/cell;
  the auto lighting tools (`highlight`/`shadow`/`sphere-shade`) shine here;
  clone + tween across frames.
- **Showcase characters (32×48+):** 50–100 shapes; silhouette first; replace
  auto lighting with hand-placed 1px seam lights (auto blobs read as noise at
  this density); selective outlines in a darker step of the local color.
- **Environment cells (96×96+):** 300–1000+ ops; generator script mandatory;
  paint in depth bands back-to-front; single-phase dither rows for gradients;
  lead the batch with `clear` so rebuilds are idempotent.

Full recipes and the reasoning: [high-detail guide](references/high-detail.md) — read it before
attempting either of the higher tiers.

## Export

```
sprite.js pivot --anchor bottom-center   # set sprite origin (do this before export for characters)
sprite.js group fps walk 10              # animation speed -> atlas frame durations
sprite.js export                         # gapless sheet PNG + Aseprite JSON atlas (<name>.atlas.json)
```

For explicit paths, use `sprite.js export --dest public/art` and
`sprite.js view --sheet --scale 4 --out review/contact-sheet.png`; then inspect
the PNG. Run previews separately from the batch. The atlas is Aseprite-format
JSON: cell groups become `meta.frameTags`, group fps becomes per-frame `duration`,
and the pivot ships as a slice. Phaser needs an explicit origin in game code;
see [game integration](../game-integration/SKILL.md).

## Additional Resources

- [Tool reference](references/tool-reference.md) — complete flags, anchor points per shape type, group details
- [Sprite shading](../sprite-shading/SKILL.md) — multi-tier lighting technique, pillow-shading anti-pattern
- [Sprite motion](../sprite-motion/SKILL.md) — squash/stretch, shadow-as-elevation, timing, key poses
- [Sprite palette](../sprite-palette/SKILL.md) — palette selection, ramp-aware base colors, headroom, tradeoffs
- [Sprite composition](../sprite-composition/SKILL.md) — draw order, naming conventions, groups, sheet layout
- [Game integration](../game-integration/SKILL.md) — Phaser/Unity/Godot, full-game asset builds, app icons
- [Generated sprites](references/generated-sprites.md) — working with image-generation models:
  height calibration across runs, chroma instead of transparency, prompt
  construction, and the canonical walk/run pose vocabulary
- [Sprite verification](../sprite-verification/SKILL.md) — per-frame inspection, baseline alignment, in-engine loader checks before game integration
