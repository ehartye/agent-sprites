---
name: sprite-export
description: Export pixel-art PNG sprite sheets, paired normal maps and Aseprite JSON atlases (one-shot tags carry loop and repeat), or composite exported animations into a GIF proof. Use for game-ready sprite destinations, normal/color alignment or timing review; not 3D mesh baking.
---

Export the current sprite project. Usage: /sprite-export [dest folder]

Use the sprite-setup skill for first-time setup and version sync after updates. Always use the managed launcher below.

This plugin exports 2D sprites only and has no route to 3D meshes. For mesh building, use the separate agent-meshes plugin.

Before exporting, make sure the atlas metadata is set:

- `group fps <name> <fps>` on each animation cell group (becomes per-frame durations)
- `pivot --anchor bottom-center` for characters (ships as an atlas slice)

Then run:

```
node "<plugin-root>/scripts/run-managed.js" export [--dest <folder>]
```

This writes a gapless sheet PNG plus `<name>.atlas.json` (Aseprite JSON: frames, `meta.frameTags` from cell groups, durations, pivot slice) to the project's asset folder under the current directory, or exactly `--dest`. Add `--trim true` for a smaller, trimmed atlas: each cell is packed as its opaque bounding box with real `spriteSourceSize` offsets and `trimmed: true`, and empty cells share a 1×1 transparent pixel. Frame names, tags, durations and the cell-relative pivot slice are unchanged. It needs a transparent background. Draw trimmed frames at `spriteSourceSize.x/y` within the cell (the build `playback-runtime.mjs` does). UI font and skin builds do not trim. Phaser reads it directly; Unity and Godot need a small loader — see the `game-integration` skill for wiring exports into a game project.

### Atlas contract

Pinned by `tests/engine/atlas-frame-key-contract.test.js`:

- Every frame inside a tag range has a numeric `filename`, its decimal array index (`"0"`..`"n-1"` for grid cells, then group runs continue the numbering).
- Named alias frames come after the cell and group runs and sit outside every tag range, so aliases never disturb tag lookup.
- `direction` is one of `forward`, `reverse`, `pingpong`, `pingpong_reverse`, the same four strings Aseprite writes.
- `loop` (boolean) is present only when set; its absence means the tag loops.
- A one-shot tag (loop setting false) carries `loop: false` and `repeat: "1"`, a quoted string as Aseprite writes it. A looping tag, or a tag with no loop setting, gets no `repeat`. Aseprite itself writes a `repeat` count (such as `"2"`) and no `loop`; this exporter writes `repeat` only as `"1"`, so counted loops are not supported.
- A consumer treats a tag as a one-shot when `loop` is false, or when `loop` is absent and `repeat` is `"1"`; `loop` wins when both are present, and any other `repeat` value is ignored (the tag loops). The Godot and Unity example loaders follow this rule. `verify` does not validate `repeat`.

Then run the managed launcher with `verify <exported-name>.atlas.json --contact-sheet review.png --report review.json --json` and any required `--expect-tags idle,walk`. A zero exit confirms structure; follow [sprite verification](../sprite-verification/SKILL.md) to inspect every frame and animation before integration.

Visible authored normals automatically export a matching normal PNG and atlas.
Use `--normal true` to include a flat normal map or `--normal false` to omit it.
Normal packing copies color trim offsets, frame timing, tags and pivots exactly.
Read [surface lighting and paired exports](../sprite-shading/references/surface-lighting.md)
for encoding, explicit palette policy and editable authoring. Color lighting is
baked offline; normal directions remain independent of that bake.

For an exported base plus animated overlays, use the offline `atlas-proof` workflow.
Read [atlas composition proofs](references/atlas-proof.md) for the config, whole-pixel
anchors, timing/alpha limits and complete artifact review. It reads the exported
PNG/atlas files and does not change the live session. Use a new output directory.

Resolve <plugin-root> from this loaded skill's directory (two parents up), not from PATH or the current project. Follow [sprite setup](../sprite-setup/SKILL.md) and use the absolute managed launcher. For PowerShell invocation, read [CLI setup](../sprite-editing/references/cli-setup.md).
