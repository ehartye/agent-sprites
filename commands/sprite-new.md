---
description: Create a new sprite sheet project
argument-hint: "[name] [N|WxH] [rows]x[cols] [palette]"
---

Create a new sprite sheet project. Usage: /sprite-new [name] [WxH or N cell size] [rows]x[cols] [palette]

Load the sprite-setup skill and complete its version sync check before first use or after a plugin update. Do not fall back to a PATH or checkout CLI.

Run:

```
node "$CLAUDE_PLUGIN_ROOT/scripts/run-managed.js" new <name> --size <N|WxH> --rows <R> --cols <C> --palette <palette>
```

Defaults: 16x16 cells, 4x4 grid, pico8 palette, name "untitled". Tall characters usually want `--size 16x24` or `--size 16x32`. Ramp-aware palettes (`pico8`, `db-16`, `db-32`) unlock the highlight/shadow/sphere-shade lighting tools.

Afterward, tell the user the live web UI is at `http://localhost:3377` (or `$SPRITE_PORT` if set) and load the `sprite-editing` skill before drawing.
