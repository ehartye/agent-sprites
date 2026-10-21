# Construction replay

Use this to diagnose which source operation introduced a detail, or explain how
a generated sprite was built. It records actual build operations, independently
of the live edit/undo stack. Existing final shapes cannot recover missing history.

Add this to the ordinary isolated build config:

```json
"replay": { "cells": ["0,0"], "maxSteps": 512 }
```

Run the matching managed launcher resolved from the loaded skill:

```text
node "<plugin-root>/scripts/run-managed.js" build sprite-project.json --json
node "<plugin-root>/scripts/run-managed.js" replay dist/hero.project.json --list --json
node "<plugin-root>/scripts/run-managed.js" replay dist/hero.project.json --cell 0,0 --step 3 --out step-review-01 --scale 4 --json
```

Use a new output directory in an existing parent. `--list` returns metadata;
`--step` selects a zero-based recorded step, which can differ from the original
operation index because operations that leave selected state unchanged are not
recorded. Read the list before selecting a step. Stop after a failed command.
Both replay commands work offline and leave the saved project unchanged.

The build emits `construction-replay.json` as an integrity-tracked artifact and
embeds the same bounded evidence in the editable project. Open that project and
choose Workbench → Replay for cell/step selection and Before, After, Contribution
and Changed-pixel mask views. Scrubbing never changes artwork or consumes undo.
The live-state indicator compares the current cell with final construction,
independently of which historic step is selected. Live edits and undo never
append or rewrite construction records.

The initial canvas and each changed selected state contain deep cell snapshots,
palette and export background. Each record identifies its source file and SHA256,
operation index, command, label and stable operation digest. Ops JSON uses an
exact array JSON pointer such as `/12`; generator output uses an expanded
operation index and generator source hash; recipes identify the config declaration.
These are actual identities, not guessed source line numbers.

For more useful labels, annotate an operation:

```json
{
  "command": "draw", "type": "point", "cell": "0,0", "name": "left-eye",
  "x": 6, "y": 6, "color": "#222034",
  "replay": { "label": "Left eye detail" }
}
```

An annotation may also include `source: { "path": "parts.json", "line": 12,
"column": 3 }`. The path must be a declared hashed build input, and line/column
must fall within its actual contents. Include imported generator data under the
build config's `inputs`. Annotations are removed before ordinary command mapping.
The evidence retains the original declaration identity when it points to another
input. Portable replay does not read source files from the recipient's machine.

Contribution is the actual RGBA change from the preceding recorded state, using
canonical rendering. Changed opaque/semitransparent pixels show their after
color. Deletions are transparent in the contribution PNG; use the changed-mask
PNG and `clearedPixels` count to see them. An operation that changes shape state
without changing pixels has zero contribution. Inspect the before/after pair,
changed-pixel count/bounds, source identity and final live-state comparison.

Limits: 1–16 selected cells; default 512, at most 2048 recorded steps; 32 MiB of
serialized evidence; 64 million cumulative snapshot pixels and a separate 64 million
pixel rendering budget. Query zoom is integer 1–8. A traced build exceeding its
budget fails before publication instead of silently truncating. Narrow the cell
selection or explicitly raise `maxSteps` within the hard bound. Normal builds
without `replay` do not record construction.

Copy `<plugin-root>/examples/construction-replay` for a complete example and a
source-based misplaced-eye correction exercise. Rendering a step verifies what
changed; decide whether that change is artistically right from the actual images.
