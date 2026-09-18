---
name: sprite-export
description: Export the active sprite project as a PNG sheet and Aseprite JSON atlas. Use when sprite artwork is ready for game integration or an explicit export destination is requested.
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

This writes a gapless sheet PNG plus `<name>.atlas.json` (Aseprite JSON: frames, `meta.frameTags` from cell groups, durations, pivot slice) to the project's asset folder under the current directory, or exactly `--dest`. Unity, Godot, and Phaser importers consume it directly — see the `game-integration` skill for wiring exports into a game project.

Then run the managed launcher with `verify <exported-name>.atlas.json --contact-sheet review.png --report review.json --json` and any required `--expect-tags idle,walk`. A zero exit confirms structure; follow [sprite verification](../sprite-verification/SKILL.md) to inspect every frame and animation before integration.

Resolve <plugin-root> from this loaded skill's directory (two parents up), not from PATH or the current project. Follow [sprite setup](../sprite-setup/SKILL.md) and use the absolute managed launcher. For PowerShell invocation, read [CLI setup](../sprite-editing/references/cli-setup.md).
