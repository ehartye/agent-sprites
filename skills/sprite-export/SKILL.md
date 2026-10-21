---
name: sprite-export
description: Export pixel-art PNG sprite sheets, paired normal maps and Aseprite JSON atlases, or composite exported animations into a GIF proof. Use for game-ready sprite destinations, normal/color alignment or timing review; not 3D mesh baking.
---

Export the current sprite project. Usage: /sprite-export [dest folder]

Use the sprite-setup skill for first-time setup and version sync after updates. Always use the managed launcher below.

Before exporting, make sure the atlas metadata is set:

- `group fps <name> <fps>` on each animation cell group (becomes per-frame durations)
- `pivot --anchor bottom-center` for characters (ships as an atlas slice)

Then run:

```
node "<plugin-root>/scripts/run-managed.js" export [--dest <folder>]
```

This writes a gapless sheet PNG plus `<name>.atlas.json` (Aseprite JSON: frames, `meta.frameTags` from cell groups, durations, pivot slice) to the project's asset folder under the current directory, or exactly `--dest`. Add `--trim true` for a smaller, trimmed atlas: each cell is packed as its opaque bounding box with real `spriteSourceSize` offsets and `trimmed: true`, and empty cells share a 1×1 transparent pixel. Frame names, tags, durations and the cell-relative pivot slice are unchanged. It needs a transparent background. Draw trimmed frames at `spriteSourceSize.x/y` within the cell (the build `playback-runtime.mjs` does). UI font and skin builds do not trim. Unity, Godot, and Phaser importers consume it directly — see the `game-integration` skill for wiring exports into a game project.

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
