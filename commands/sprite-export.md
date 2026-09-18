---
description: Export sprite sheet PNG + Aseprite JSON atlas
argument-hint: "[dest folder]"
---

Export the current sprite project. Usage: /sprite-export [dest folder]

Use the sprite-setup skill for first-time setup and version sync after updates. Always use the managed launcher below.

Before exporting, make sure the atlas metadata is set:

- `group fps <name> <fps>` on each animation cell group (becomes per-frame durations)
- `pivot --anchor bottom-center` for characters (ships as an atlas slice)

Then run:

```
node "$CLAUDE_PLUGIN_ROOT/scripts/run-managed.js" export [--dest <folder>]
```

This writes a gapless sheet PNG plus `<name>.atlas.json` (Aseprite JSON: frames, `meta.frameTags` from cell groups, durations, pivot slice) to the project's asset folder under the current directory, or exactly `--dest`. Unity, Godot, and Phaser importers consume it directly — see the `game-integration` skill for wiring exports into a game project.
