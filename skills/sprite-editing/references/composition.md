# Reusable parts, stamps, tiles and scatter

Use the matching managed launcher from the parent skill. Copy
`<plugin-root>/examples/composition` into the asset project for a complete
create/revise example and verified isolated build. Do not build into the plugin.

```text
sprite.js compose --file composition.json --session <current-session-id>
sprite.js compose --file composition.json --plan --session <current-session-id>
sprite.js undo --cell 0,0
sprite.js redo --cell 0,0
```

Set `SPRITE_PORT` to the existing browser server's port and inspect `status` before
editing its session. `--session` rejects a concurrent session switch. A declaration
must include `cell`, `prefix`, `parts` and `placements`; `--cell` can override the
file's target. Expanded batch form is the same declaration plus `"command":"compose"`.
`--plan` compiles without editing the draft, paint order or history. Its batch
command is `compose-plan`; the browser exposes **Plan reusable parts** separately
from **Compose reusable parts**. Large browser reports show explicit preview limits
and offer the complete JSON for download.

```json
{
  "cell": "0,0",
  "prefix": "garden",
  "parts": {
    "tuft": {"shapes": [
      {"name":"stem","type":"line","params":{"x1":0,"y1":0,"x2":0,"y2":3},"color":"green"}
    ]},
    "copied": {"source":{"cell":"0,1","shapes":["leaf","highlight"]}}
  },
  "placements": [
    {"kind":"stamp","part":"copied","name":"hero","x":4,"y":2},
    {"kind":"tile","part":"tuft","name":"bed","x":0,"y":10,"rows":2,"cols":4,"stepX":4,"stepY":3},
    {"kind":"scatter","part":"tuft","name":"wild","x":0,"y":0,"w":16,"h":8,"count":5,"seed":"meadow"}
  ]
}
```

Use either literal `shapes` or a `source` selector for each part. Source selectors
refer to exact shape **names**, including spaces or Unicode; create/name those
shapes first. Selection preserves the source's z-order. Literal shape arrays paint
in declaration order. The supported primitives are point, line, rect, circle,
ellipse, polygon, polyline and flood fill. Capture the primitive output of richer
drawing tools as a source part. Colors are explicit hex values or defined palette
names; `visible:false` retains hidden shapes in editable output. Shape geometry
uses the canonical rounded pixel rules. Literal rect/circle/ellipse/polygon shapes
default to filled; source copies preserve the original fill behavior.

`stamp` adds its offset to the part's local coordinates. `tile` creates row-major
instances using positive `rows`/`cols` and integer step offsets; zero/negative steps
are allowed. `scatter` samples integer origins in its positive `w`×`h` rectangle,
using an explicit nonempty string or safe-integer seed. A numeric seed and its text
spelling are distinct. Equal seeds and declarations produce equal placements;
overlapping samples are allowed. Parts retain their full geometry and the normal
cell export clips anything outside the canvas.

Prefix, part and placement identifiers use 1–80 letters, digits, underscores or
hyphens. Local shape names are nonempty, bounded text without control characters;
qualified output percent-encodes local names. Examples:

```text
garden:hero:leaf
garden:bed/r0c2:stem
garden:wild/3:stem
garden:hero:left%20eye
```

These names are ordinary editable shapes for `move`, `recolor`, `resize`, groups
and selection. Each shape records its part, instance, original local name and
optional source cell/name in `params.composition`. Source selectors take a copied
snapshot during application: changing the source geometry, color reference or
visibility does not update existing copies. Explicitly reapply to capture changes.
Palette names still refer to the shared project palette; use hex for fixed colors.

Reapplying is a **complete declaration for that prefix**. Matching owned names keep
their IDs, absent owned shapes are removed, and the revised output paints above
existing artwork. Other prefixes and unrelated shapes are preserved. A collision
with an unrelated shape fails before mutation. Manual edits to generated output
are replaced on the next reapply. Save such a variant under separate ownership if
it must remain independent. An empty `placements` array removes only that prefix's
owned output. One undo/redo reverses/reapplies the whole composition, including its
obsolete-shape cleanup; history does not survive project reloads.

The server returns expanded canonical `operations`, editable `shapes`, and an
`instances` inventory. Expanded primitive draw operations preserve composition
ownership, visibility and explicit `z` order through ordinary batch/API replay.
Primitive draws also accept CLI `--z <integer>` and `--visible true|false`; these
state fields require a single primitive, without brush expansion or clipping.
Use the compact
composition command for revisions; expanded draws create output rather than
reconciling existing names. The browser's shared server form edits `parts` and
`placements` as JSON and displays the same inventory and errors.

Bounds are explicit: at most 4096 definitions, placements and expanded shapes,
256 polygon/polyline vertices, coordinates within ±1,048,576, and a conservative
16,777,216-pixel raster work budget. The server rejects overflow, unknown fields,
unsupported parameters and malformed declarations before editing. Split large
compositions into independently owned prefixes rather than relying on truncation.
For a complete large seeded scatter, plan all origins once using a one-point part
and the intended seed, bounds and count (up to 4096). Save the returned origins,
then generate explicit stamp declarations for the real motif across exclusive
prefixes, preserving every origin and a stable global instance name. Do not
restart native scatter with the same seed in each chunk: that repeats its initial
positions. Preflight every complete chunk with `--plan` before applying any; save
the exact prefix list and source snapshots as canonical inputs. Each prefix is a
separate transaction, so stop and roll back successful calls if later application
fails. Remove the complete result by applying empty placements for each recorded
prefix. Never label a partial result complete or bypass the work/shape limits.
Patterns use canonical filled rect/circle/ellipse/polygon rules; flood fill cannot
erase. Transform source shapes with existing flip/rotate tools before copying them.
