---
name: sprite-new
description: Create a new sprite project with a named sheet, grid, size and palette. Use when starting a new pixel-art sprite sheet; use sprite-open to resume existing work.
---

Create a new sprite sheet project. Usage: /sprite-new [name] [WxH or N cell size] [rows]x[cols] [palette]

Load the sprite-setup skill and complete its version sync check before first use or after a plugin update. Do not fall back to a PATH or checkout CLI.

Run:

```
node "<plugin-root>/scripts/run-managed.js" new <name> --size <N|WxH> --rows <R> --cols <C> --palette <palette>
```

Defaults: 16x16 cells, 4x4 grid, pico8 palette, name "untitled". Grids are capped at 10x10 cells; plan more layers or frames as bigger cells or a second sheet. The grid is capped at 10 rows by 10 columns; a build that needs more layers or frames than 100 cells must split into a second sheet. Tall characters usually want `--size 16x24` or `--size 16x32`. Ramp-aware palettes (`pico8`, `db-16`, `db-32`) unlock the highlight/shadow/sphere-shade lighting tools.

Afterward, tell the user the live web UI is at `http://localhost:3377` (or `$SPRITE_PORT` if set) and load the `sprite-editing` skill before drawing.

Resolve <plugin-root> from this loaded skill's directory (two parents up), not from PATH or the current project. Follow [sprite setup](../sprite-setup/SKILL.md) and use the absolute managed launcher. For PowerShell invocation, read [CLI setup](../sprite-editing/references/cli-setup.md).
