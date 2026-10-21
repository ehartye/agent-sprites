# Compose independently timed sprite projects

Use an inline `animation` build source to combine existing portable `.project.json`
files into a single timed sprite sheet. Each selected child frame expands into
ordinary named primitives within its own editable canvas layer. Source flood fills,
erasers, transparency and clipping stay inside that child's canvas; one child cannot
erase its neighbours or fill the whole scene. Child palette names resolve against
that child's palette, so two projects may use the same color name differently.

## Build the copied example

Resolve `<plugin-root>` from the loaded skill. Copy only the source files from
`<plugin-root>/examples/animated-composition` into the user's asset source directory;
exclude existing `dist` and `dist-once` directories. Never build inside the plugin
cache. Complete sprite-setup's version check, then run the absolute managed launcher:

```text
node "<plugin-root>/scripts/run-managed.js" build "<asset-source>/animated-composition/sprite-project.json" --json
```

Stop on failure. Open `dist/contact.png` at native scale and enlarged, then play
`dist/preview.html` through several loops. Inspect `dist/animation-report.json` for
source hashes, expanded instance names, selected source cells, frame starts and exact
durations. The companion `sprite-project-once.json` demonstrates a delayed one-shot
and writes to a separate `dist-once` directory. Its first pose is visible during the
delay; delay does not hide an instance.

## Source and placement contract

Choose exactly one build source (`animation`, `ops`, `generator`, or another recipe).
The animation block accepts `name`, `size`, optional preset `palette`, optional
`seed`, optional `durationMs`, optional output `loop`, `parts` and `placements`.
Use square sizes such as `32` or rectangular strings such as `"48x32"`.

```json
{
  "version": 1,
  "output": "dist",
  "animation": {
    "name": "garden",
    "size": "48x32",
    "parts": {
      "lamp": { "project": "lamp.project.json", "group": "glow" },
      "fly": { "project": "fly.project.json", "frames": ["dim", "bright", "dim"] }
    },
    "placements": [
      { "kind": "stamp", "name": "lamp", "part": "lamp", "x": 8, "y": 13 },
      { "kind": "stamp", "name": "fly", "part": "fly", "x": 20, "y": 7, "phaseMs": 40 }
    ]
  },
  "expectedTags": ["garden"]
}
```

- Animated parts require a portable relative `project` path using forward slashes
  and exactly one `group` or `frames` selection. Group playback honors its stored
  forward/reverse/ping-pong direction. An explicit `frames` list uses exact cell
  coordinates or unique cell names in the written order, including repeated holds.
  It does not infer group direction or group FPS. Frame durations resolve from each
  cell's explicit duration, then the selected group's FPS, then 8 FPS.
- Static parts use `{ "shapes": [...] }`, the same literal primitive descriptors as
  [part composition](../../sprite-editing/references/composition.md). Their color
  names use the scene palette. Animated children use their own palettes.
- Placements use `stamp`, `tile` or `scatter` with `name`, `part`, integer `x` and
  `y`. Tile adds `cols`, `rows`, `stepX`, `stepY`; scatter adds `w`, `h`, `count`
  and its own explicit `seed`. Scatter positions are deterministic within the
  half-open origin region `[x,x+w) × [y,y+h)`. Keep room for each child's extent.
  Declaration order sets instance paint order. Geometry is clipped to each canvas
  and then the output cell. There is no scaling or rotation placement control.
- Animated placements additionally accept `phaseMs`, `delayMs`, `randomPhase` and
  `loop`. Static placements reject these timing controls. A scene `seed` is required
  for `randomPhase: true`; it is separate from each scatter placement's position seed.

## Timing without resampling

Durations and offsets are integer milliseconds. At scene time `t`, a child uses
local time `t + phaseMs + randomPhaseMs - delayMs`. Random phase is a deterministic
offset in `[0, childPeriod)` derived separately for each expanded instance from the
scene seed and instance name. It adds to any explicit phase. Changing the instance
name or seed can change that offset.

Repeating children wrap local time modulo their complete sequence duration.
Consequently, `delayMs` on a repeating child shifts its phase, including at scene
time zero; it is not an initial pause. For a delayed start that holds the first pose,
set the placement's `loop: false`. A one-shot holds its first pose for negative local
time and its last pose after completion. A positive phase can skip an initial
portion of a one-shot.

Loop precedence is placement override, then part override, then the source group's
stored loop flag, then `true`. An explicit frame list has no source group settings.
Scene `loop` controls the exported scene tag; it does not change child looping. By
default the scene loops only when every animated child instance loops. A single-pose
one-shot still contributes its duration and delay to scene completion.

The build inserts an output frame at every child frame boundary, retaining uneven
durations and repeated poses. It uses the least common multiple of repeating child
periods, extended by whole joint periods to finish any one-shots. Without repeating
children it ends when the last one-shot completes. Optional `durationMs` must finish
every one-shot and end on a complete joint loop boundary. It cannot truncate a loop
or freeze an unfinished child; incompatible or excessive periods fail clearly.

Bounds: 1–2048 pixels per cell dimension, 4096 expanded instances, 1024 animated
instances, 4096 timeline steps, 60,000 ms total duration, 200,000 expanded shapes and
4096 characters per qualified shape name, plus 64,000,000 units of estimated raster
work. Previously composed projects can be children while their added layer depth,
qualified names and other resources remain within these same explicit bounds.
These are rejection limits, not targets.
Reduce instance counts, geometry or cycle periods when a build exceeds them.

## Inspect and revise editable output

The example creates tag `lantern-garden`, frame aliases `lantern-garden_0000` onward,
shape names such as `lantern-garden:lanterns/r0c0:glass`, and canvas layer IDs such as
`lantern-garden:lanterns/r0c0:canvas`. The original local shape name follows the final
colon and is URI-encoded when needed. The layer metadata is stored in
`shape.params.layers`; nested child layers remain nested with qualified IDs.

For a manual variation, copy `dist/lantern-garden.project.json` outside `dist`, open
the copy, inspect a cell's layers, then move or reorder the whole selected child:

```text
sprite.js open "<asset-source>/garden-manual.project.json"
sprite.js layer list --cell lantern-garden_0000
sprite.js layer edit lantern-garden:lanterns/r0c0:canvas --cell lantern-garden_0000 --dx 1 --dy 0 --z 5
sprite.js shapes --cell lantern-garden_0000
sprite.js save
```

Here `sprite.js` means the absolute managed launcher established in sprite-editing.
Use the reported layer ID and desired z value from `layer list`. A layer edit affects
that cell; apply the intended change to other frames explicitly. Ordinary named-shape
commands edit individual primitives. Inspect playback after either kind of edit.

For repeatable changes, edit the copied config or child source projects and rebuild.
Build automatically hashes every declared child project as an input, emits selected
source identity in `animation-report.json`, and publishes an editable project, PNG,
atlas, captured operations, contact sheet and preview. Build output is generated:
rebuild replaces local edits there. Source metadata describes the build inputs;
it does not reconstruct a source's earlier editing history or retroactively create
construction replay evidence.
