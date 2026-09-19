# Sprite Editing CLI Reference

`sprite.js` below means Node plus
the absolute `scripts/run-managed.js` launcher resolved from the loaded skill. See
[CLI setup](cli-setup.md) for PowerShell failure checks and the Claude plugin option.

After dependency installation, the server starts on first invocation. Port defaults
to 3377 (`SPRITE_PORT` overrides it); a different port does not isolate SQLite data.

## Session Commands

| Command | Flags | Notes |
|---------|-------|-------|
| `new <name>` | `--size 16 --rows 4 --cols 4 --palette pico8 [--dest <folder>]` | Create project. `--size` takes `16` (square) or `16x32` (width x height — tall character cells). Exports land under the **CLI's** working directory (`assets/claude-sprites/<name>/`) or under `--dest <parent>` if given. Palettes: `pico8`, `gameboy`, `nes`, `cga` |
| `open <path>` | | Open saved project file |
| `open` | `--session <name\|id>` | Reopen an earlier project from its stored draft — no `save` needed. Cell groups come back with it |
| `sessions` | | List recent projects (id, name, last updated) — the way back after `new` switches projects |
| `cast start` | `--file <casting.json> [--out <verdict.json>]` | Open a collaborative frame-casting session in the web UI (`/casting.html?id=…`): slots + candidate frame paths + predicted assignments; the user confirms/overrides/marks gaps. See the `sprite-verification` skill |
| `cast status` | `--id <id>` | Poll a casting verdict: agreement score + per-slot prediction-vs-selection disagreements (detector-refinement signal) |
| `save` | | Write project JSON to the opened file, or `<session destination>/<name>.json` for a new project. SQLite drafts are automatic and need no `save`; omit it when assets must contain only PNG + atlas. |
| `export` | `[--dest <folder>]` | Export gapless sheet PNG + **Aseprite JSON atlas** (`<name>.atlas.json`) to the project's asset folder (or exactly `--dest` for this export only). The atlas carries `meta.frameTags` (one per cell group, as a contiguous appended frame run), per-frame `duration` from each group's fps, and the pivot as a slice — consumable directly by Unity/Godot/Phaser importers |
| `pivot` | `--x N --y N` \| `--anchor center\|top-center\|bottom-center\|bottom-left\|bottom-right` | Set the sprite origin exported in the atlas (characters usually want `bottom-center`). Unity/Godot importers read the exported pivot slice; **Phaser ignores slices** — set `sprite.setOrigin(...)` in game code |
| `status` | | Show current project info |

## Drawing

All draw commands: `draw <type> --cell <coord> --color <hex> [--name <shape_name>]`

| Type | Required Flags | Shape Anchor |
|------|---------------|-------------|
| `point` | `--x --y` | The pixel itself |
| `line` | `--x1 --y1 --x2 --y2` | Bresenham pixel-perfect; start point |
| `rect` | `--x --y --w --h [--filled true]` | Top-left corner |
| `circle` | `--cx --cy --r [--filled true]` | Center |
| `ellipse` | `--cx --cy --rx --ry [--filled true]` | Center |
| `fill` | `--x --y` | Flood-fills contiguous same-color region |
| `polygon` | `--points "x,y x,y x,y ..." [--filled true]` | Closed polygon: Bresenham outline + scanline fill. First point is the move anchor. Best for angular shapes (swords, arrows, ships, terrain) |
| `polyline` | `--points "x,y x,y ..."` | Open multi-segment stroke (no closing edge, never filled) |
| `highlight` | `--shape <target> [--direction <dir>] [--strength N] [--name <base>] [--count N --span-deg N --radius-factor F]` | Auto-places lighter pixels using palette ramp |
| `shadow` | `--shape <target> [--direction <dir>] [--strength N] [--name <base>] [--count N --span-deg N --radius-factor F]` | Auto-places darker pixels using palette ramp |
| `sphere-shade` | `--shape <target> [--direction <dir>] [--intensity low\|med\|high\|auto] [--name <base>]` | Compound 2–5 tier lighting on a circle/ellipse in one call |
| `arc` | `--cx --cy (--r \| --rx --ry) --from-deg <A> --to-deg <B> --color <c> [--clip-to <mask>] [--name <base>]` | Partial ellipse outline (CW, y-down: 0=east, 90=south) |
| `ring` | `--shape <target> --color <c> [--clip-to <mask>] [--name <base>]` | Single-target 4-neighbor halo (sugar over `border`) |

### Clipping (masking pixels to another shape)

Any unfilled outline draw (`ellipse`, `circle` with `--filled false`) accepts `--clip-to <shape_name>`. Pixels of the outline that fall **outside** the named mask shape are dropped; the ones inside are persisted as individual named points (`<base>_<i>`).

Use it when you want a stamp, decoration, or construction line that only shows within another shape's silhouette — for example drawing a curved line across the surface of a ball, or a pattern contained within a body.

```
# only the portion of the big ellipse's outline that falls inside `ball` persists
sprite.js draw ellipse --cell 0,0 --cx 8 --cy 32 --rx 20 --ry 16 \
                       --filled false --color "#000000" \
                       --name arc --clip-to ball
```

Supported mask shape types: `circle`, `ellipse`, `rect`. Currently applies only to unfilled ellipse/circle outlines; other source shapes don't yet clip.

Colors: hex string like `"#ff0000"` or palette color name.

Coordinates and sizes are rounded to the pixel grid when a shape is drawn (`4.5` becomes `5`), so generators may compute positions with fractions. A missing or non-numeric coordinate is an error that names the flag.

### Pattern fills (two-color dither in one op)

Filled `rect`, `circle`, `ellipse` and `polygon` accept `--pattern <name> --color2 <hex|name>`. The pattern decides, pixel by pixel, whether `--color2` paints instead of `--color`; outlines are never patterned. The shape stays one named shape, so `move`, `resize`, `clone` and `recolor` all still work, and `recolor <name> --color2 <hex>` (or `recolor-group ... --color2`) swaps the second color later.

| Pattern | Coverage | Use it for |
|---|---|---|
| `checker` | 50%, `(x+y)` even | classic dither between two ramp steps, gradients by band |
| `stripes` | every other row | scanlines, water, fabric |
| `sparse` | 25%, even columns of even rows | sparkle, texture on large flats |
| `scatter` | ~14%, deterministic non-grid | pointillism, grass, noise that reads as organic |

```
sprite.js draw rect --cell 0,0 --x 0 --y 20 --w 96 --h 44 --color "#6abe30" --pattern scatter --color2 "#99e550" --name lawn
sprite.js recolor lawn --cell 0,0 --color "#4b692f" --color2 "#37946e"   # same lawn, in shadow
```

Batch ops take the same keys: `"pattern": "checker", "color2": "#..."`. A pattern on an unfilled shape or a non-fill type is an error; `color2` without `pattern` is an error too.

### Highlight / Shadow details

Prefer these over hand-placed points for lighting. They:
- Look up the named target shape (rect/circle/ellipse — not point/line).
- Resolve a lighter (`highlight`) or darker (`shadow`) color from the palette's color ramp. Ramp-aware palettes: `pico8`, `db-16`, `db-32`. Target color must exist in a ramp.
- For **circles/ellipses**, sample pixels along a curved arc centered on the direction, placed *inside* the shape — this follows the form like proper sphere shading and avoids "pillow shading" (tracing the outline).
- For **rects**, place pixels along the bbox edge (straight runs are correct for flat-sided shapes).

Directions: `top-left` (default highlight), `top-right`, `bottom-left`, `bottom-right` (default shadow), `top`, `bottom`, `left`, `right`.

Flags:
- `--strength N` — steps N positions along the palette ramp (default 1). Higher values = more contrast.
- `--count N` — override pixel count. Default scales with shape size (`round(r × 0.4)`, min 2).
- `--span-deg N` — arc span in degrees. Default: 30 (highlight), 40 (shadow).
- `--radius-factor F` — fraction of radius from center (0–1). Default: 0.55 (highlight), 0.70 (shadow). Lower = deeper into shape. Higher = closer to silhouette.
- `--name <base>` — override the auto-generated `<target>_hl_<i>` / `<target>_sh_<i>` naming.
- `--dither true` — adds a checkerboard transition band adjacent to the solid band (toward the mid-zone on circles/ellipses, one step inward on rects), named `<base>_d_<i>`. Classic pixel-art softening between the lit/shaded zone and the base color.

### Sphere shading (compound)

`draw sphere-shade` is the preferred way to light a circle/ellipse. It composes 2–5 highlight/shadow tiers in a single call.

- `--intensity auto` (default) picks tiers by target size: `r<=6` → low (2 tiers), `7–12` → med (3 tiers), `>12` → high (5 tiers). Ellipse uses `max(rx, ry)`.
- `--direction` rotates all tiers consistently (highlight/spec toward, shadow/rim opposite).
- Target must be circle or ellipse; target color must resolve in a palette ramp.
- Emits shapes named `<base>_<tier>_<i>` (default base `<target>_shade`).

### Arc primitive

`draw arc` rasterizes just the outline portion of an ellipse between two angles. Replaces the "draw oversized ellipse + clip-to" workaround for surface curves.

- Angles use CW, y-down convention: 0°=east, 90°=south, 180°=west, 270°=north.
- `--r N` is shorthand for `--rx N --ry N` (circular arc).
- `--clip-to <mask>` still applies as a secondary filter.
- Emits one named point per pixel (`<name>_<i>`).

### Ring

`draw ring` is single-target sugar over `draw border` — a 4-neighbor halo around one target shape.

### Shading technique

For the craft of multi-tier lighting (form shadow, core shadow, rim light, specular peak) and the anti-patterns to avoid, see the `sprite-shading` skill. This reference documents flags only.

### Deformation across frames

There's no dedicated squash/stretch command — use `resize` on a named shape:

```
sprite.js resize ball --cell 0,3 --updates '{"rx":5,"ry":3}'   # squash on impact
sprite.js resize ball --cell 0,1 --updates '{"rx":4,"ry":5}'   # stretch mid-air
```

`resize` also accepts individual flags (`--rx 5 --ry 3`) as a shorthand that's merged into the updates object.

## Shape Management

| Command | Positional | Flags | Notes |
|---------|-----------|-------|-------|
| `shapes` | | `--cell` | List shapes z-ordered (id, name, type, color) |
| `move <name>` | shape name | `--cell --dx --dy` | Relative pixel offset |
| `move-to <name>` | shape name | `--cell --x --y` | Absolute position (anchor-dependent) |
| `resize <name>` | shape name | `--cell --updates '{"w":10}'` | Merge param updates |
| `recolor <name>` | shape name | `--cell --color` | Change color |
| `clone <name>` | shape name | `--from --to [--as new_name]` | Copy shape across cells |
| `duplicate <name>` | shape name | `--cell [--as new_name] [--mirror horizontal\|vertical]` | Copy a shape **within** its cell, optionally mirrored across it — the one-op way to make `wing_r` from `wing_l` |
| `delete <name>` | shape name | `--cell` | Permanently remove shape |
| `flip <name>` | shape name | `--cell --axis horizontal\|vertical [--about self\|cell]` | Mirror one shape. `self` (default) flips in place about its own center; `cell` mirrors its position across the cell |
| `rotate <name>` | shape name | `--cell --deg 90\|180\|270 [--about self\|cell]` | Rotate one shape CW (y-down). `self` (default) spins in place; `cell` orbits the cell center. 90° steps only — exact for pixel art |

## Cell Operations

| Command | Flags | Notes |
|---------|-------|-------|
| `copy` | `--from --to` | Deep copy all shapes between cells |
| `clone-cell` | `--from R,C --to "R1,C1 R2,C2 ..."` | Atomic fan-out copy of one cell into many destinations (space-separated list, quoted) |
| `clear` | `--cell` | Remove all shapes from cell |
| `mirror` | `--cell --axis horizontal\|vertical` | Flip every shape across the cell — the standard way to derive walk-left frames from walk-right |
| `rotate-cell` | `--cell --deg 90\|180\|270` | Rotate every shape about the cell center (CW, y-down) — e.g. spin frames from one drawn frame |
| `name` | `--cell --as <name>` | Give cell a readable name |
| `ref set <image.png>` | `--cell [--opacity 0.35]` | Attach a tracing reference image: rendered dimmed **under** shapes in `view` output and the web UI editor, scaled to the cell, never included in exports. Use it to copy a pose or style from an existing image |
| `ref clear` | `--cell` | Remove the reference |
| `view` | `--cell [--png true] [--scale N] [--out <file.png>]` | Render cell preview (includes the reference underlay if set). `--scale N` (1–32) nearest-neighbor upscales the PNG — use `--scale 8` to actually judge 16px art. `--out` writes the PNG exactly there (parents created; implies `--png`) |
| `view --sheet` | `[--scale N] [--out <file.png>]` | Render the whole sheet to a PNG — a temp path by default, or exactly `--out` |
| `undo` | `--cell` | Undo last operation in cell |
| `redo` | `--cell` | Redo undone operation in cell |

## Tween

`tween <shape> --group <cellgroup>` interpolates a shape across every frame of a cell group in one call — the standard multi-frame motion workflow is: draw frame 1, `clone-cell` fan-out, `group create`, then tween. Runs server-side, so it also works as a batch op (`{"command":"tween","shape":"ball","group":"drop","to":"8,14","ease":"in"}`).

| Flag | Meaning |
|------|---------|
| `--to X,Y` | End position (anchor coords). Start defaults to the shape's position in the group's first frame |
| `--from X,Y` | Override the start position |
| `--to-updates '{"r":1}'` | End values for numeric shape params (r, rx/ry, w/h). Start values read from the first frame |
| `--from-updates '{"r":4}'` | Override start param values |
| `--ease linear\|in\|out\|in-out` | Easing curve (default linear). `out` decelerates (landing), `in` accelerates (falling) |

Position and param tweens combine in one call — e.g. a ball that moves down while squashing: `tween ball --group drop --to 8,14 --to-updates '{"ry":2}' --ease in`.

## Cell Groups

Cell groups organize frames into animation sequences (stored in SQLite).

| Command | Positional | Notes |
|---------|-----------|-------|
| `group create <name> <cells...>` | group name + cell coords | Create group with cells. `--fps N` sets playback speed (exported as atlas frame durations; default 8) |
| `group fps <name> <N>` | group name + fps | Set/change a group's fps |
| `group list` | | List all cell groups |
| `group add <name> <cells...>` | group name + cell coords | Add cells to existing group |
| `group remove <name> <cells...>` | group name + cell coords | Remove cells from group |
| `group delete <name>` | group name | Delete group (cells stay intact) |

## Shape Groups

Shape groups let you move or recolor multiple shapes within a cell at once (stored in SQLite).

| Command | Positional | Flags | Notes |
|---------|-----------|-------|-------|
| `shape-group create <name> <shapes...>` | group name + shape names | `--cell` \| `--all-cells --pattern <regex>` | Create shape group (across all cells via regex match) |
| `shape-group list` | | `--cell` | List shape groups in cell |
| `shape-group add <name> <shapes...>` | group name + shape names | `--cell` | Add shapes to group |
| `shape-group remove <name> <shapes...>` | group name + shape names | `--cell` | Remove shapes from group |
| `shape-group delete <name>` | group name | `--cell` | Delete shape group |
| `move-group <name>` | group name | `--cell --dx --dy [--all-cells true]` | Move all shapes in group |
| `recolor-group <name>` | group name | `--cell --color [--all-cells true]` | Recolor all shapes in group |

Use `--all-cells true` to apply the operation across every cell that contains the named shape group.

**Palette-swap recipe (recolored variants of one character):** shape groups do **not** travel with `clone-cell`/`copy` — they are per-cell records. Draw the character once, `clone-cell` fan-out to the variant cells, then create the group in every cell at once with the pattern form and recolor per variant cell:

```
sprite.js clone-cell --from 0,0 --to "1,0 2,0 3,0"
sprite.js shape-group create suit --all-cells true --pattern "^(head|body|skirt)$"
sprite.js recolor-group suit --cell 1,0 --color "#ff77a8"   # pinky
sprite.js recolor-group suit --cell 2,0 --color "#29adff"   # inky
sprite.js recolor-group suit --cell 3,0 --color "#ffa300"   # clyde
```

One recolor op per variant instead of one per shape per variant.

## Move Anchor Reference

When using `move-to <name> --x --y`:

| Shape Type | Anchor Point |
|-----------|-------------|
| `point` | The pixel itself |
| `rect` | Top-left corner (`x, y`) |
| `circle` | Center (`cx, cy`) |
| `ellipse` | Center (`cx, cy`) |
| `line` | Start point (`x1, y1`) |

## Resize Updates Reference

The `--updates` flag takes a JSON object with keys matching the shape's parameters:

| Shape Type | Resizable Params |
|-----------|-----------------|
| `rect` | `w`, `h` |
| `circle` | `r` |
| `ellipse` | `rx`, `ry` |
| `line` | `x1`, `y1`, `x2`, `y2` |

## Batch Mode

Run a JSON array of operations in one CLI call. Collapses per-frame bash loops into a single deterministic call.

```
sprite.js batch ops.json [--vars-file frames.json | --vars k=v,k=v] [--continue-on-error] [--quiet | --json]
```

- `ops.json` — array of objects with top-level command parameters, e.g.
  `{"command":"draw","type":"rect","cell":"0,0","x":3,"y":3,"w":10,"h":10,"color":"#c2c3c7","name":"body"}`.
  Do not nest parameters under `args`. String values may contain `{{var}}` placeholders.
- **A complete asset build fits in one file**: `new` (incl. `"WxH"` size and `dest`), `clear`, all `draw` types, shape edits, `clone-cell`, `copy`, `mirror`/`rotate-cell`/`flip`/`rotate`, `tween` (`to` as `"X,Y"` or `{x,y}`), `group` (incl. `create` with `fps` and the `fps` sub-command), `shape-group` create/add/remove/delete, `move-group`/`recolor-group`, `pivot`, `ref` set/clear, `save`, `export` (with optional `dest`). Not batchable: `view`/`view-anim` (interactive output).
- **Lead scene builds with `{"command": "clear", "cell": ...}`** — the ops file becomes idempotent: iterate by editing the generator and re-running the same batch.
- `--vars-file frames.json` — JSON array of per-iteration variable dicts. The whole op list replays once per dict.
- `--vars k=v,k=v` — single-iteration inline shortcut.
- **Type preservation:** a string exactly equal to `"{{foo}}"` becomes the raw value (number stays number). Embedded placeholders (`"0,{{i}}"`) stay strings.
- **Fail-fast by default:** stops on the first error and exits 1. `--continue-on-error`
  attempts remaining operations but still exits 1 if any fail. Do not publish
  partial outputs from a failed batch.
- `--quiet` suppresses successful-op chatter, keeping the final summary and artifact paths.
- `--json` emits one summary object: `ok`, `total`, `attempted`, `succeeded`, `failed`,
  `errors` (`index`, `command`, `error`), `session`, `artifacts` (`type`, `path`), and
  `exports` (export metadata). `total` counts planned ops; `attempted` may be smaller
  after fail-fast. Check the process exit status before using artifacts.
- No arithmetic, no conditionals, no nested interpolation. Pre-compute numeric values in the vars file.
- **Large builds (150+ ops): generate the batch file from a small JS script** instead of hand-writing JSON — helper functions (`draw()`, a per-archetype recipe that clones rows and recolor-groups variants) keep it maintainable, and the emitted `build.json` stays the reviewable, replayable artifact. Proven shape: horde-peril's `asset-src/gen-build.mjs` (9 sheets / 12 enemy variants / 234 ops from ~200 lines of generator).

## Server Control

| Command | Notes |
|---------|-------|
| `restart` | Clean server restart via `POST /api/control/shutdown`. Flushes pending writes, closes DB, respawns. Prefer over `Stop-Process -Force`. |

Only control a server whose identity the CLI has verified. If another application
owns the port, choose an unused `SPRITE_PORT`; do not shut the other app down.
