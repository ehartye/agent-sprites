---
name: sprite-composition
description: Organize pixel-art sprites with draw order, named shapes, groups, and sheet layouts. Use for sprite layering bugs, missing highlights, naming, clone patterns, or batch edits within cells; not general page layout or document organization.
---

# Sprite Composition

Before running sprite operations, use [sprite setup](../sprite-setup/SKILL.md) for
first-time installation and version sync after plugin updates. Always invoke this
plugin's absolute scripts/run-managed.js with Node; never use a PATH executable,
checkout CLI, or plugin-cache CLI. All sprite.js examples mean that launcher.

CLI examples use the invocation from [sprite editing](../sprite-editing/SKILL.md);
load that setup before running commands and stop on command failure.

Discipline around draw order, naming, and grouping. Prevents the "my highlight disappeared behind the ball" and "I can't find the shape to edit" problems at scale.

## Z-Order Is Draw Order

The tool assigns z-index in the order shapes are created. Later shapes render **on top**. There is no late-stage z reordering by name — order-of-creation is load-bearing.

### Canonical bottom-up order

1. **Ground shadow** — furthest back (ellipse on ground, under the object)
2. **Background fills** — large base shapes
3. **Primary form** — the main shape (ball, body, etc.)
4. **Form-shadow tier** — dark-mid band on the unlit side
5. **Core shadow** — narrow darkest band
6. **Rim / reflected light** — edge highlights on shadow side
7. **Main highlight** — lit-side cluster
8. **Specular peak** — brightest hotspot
9. **Line details** — eyes, outlines, drawn last so nothing covers them

If you discover something drawn too low in z, you have two options:
- **Redo the cell** — `clear --cell` then rebuild. Cleanest for fresh work.
- **Delete + redraw the obscured shape** — re-add it after the covering shape so its new z puts it on top.

The CLI has no `set-z` command; use draw-order discipline.

## Naming Convention

Every shape that might be referenced later should have `--name`. Points that are just decoration can skip naming.

### Recommended structure

| Shape role | Name pattern |
|---|---|
| Ground shadow | `shadow` |
| Primary form | `ball`, `body`, `head` |
| Lighting tiers (auto-named by tool) | `<target>_hl_<i>`, `<target>_sh_<i>`, or `<custom>_<i>` via `--name` |
| Custom lighting (mid/rim/spec) | `mid`, `rim`, `spec` (passed via `--name`) |
| Eyes, mouth, etc. | `eye_l`, `eye_r`, `mouth` |

Names must be **unique within a cell**. Reusing a name across cells is fine — that's how `clone` and per-frame edits work.

**Don't** use generic names like `shape1`, `point3`. Future-you searching `shapes --cell` will hate past-you.

## Shape Groups — Batch Edits Within a Cell

Shape groups bundle named shapes so `move-group` / `recolor-group` operate on all at once:

```
sprite.js shape-group create face eye_l eye_r mouth --cell 0,0
sprite.js move-group face --cell 0,0 --dx 0 --dy -1
sprite.js recolor-group face --cell 0,0 --color "#ff004d"
```

Use `--all-cells true` to apply across every cell containing a shape group of that name — useful for moving a character's face across all animation frames in one command.

### When to create shape groups

- **Multi-part subjects** — face features that should animate together.
- **Tiered lighting** — group `ball`, `mid`, `rim`, `spec`, all `ball_hl_*`/`ball_sh_*` as `ball_all` for easy relocation.
- **Avoid** for single-shape "groups" — just use the name directly.

## Cell Groups — Animation Sequences

Cell groups establish playback order:

```
sprite.js group create bounce 0,0 0,1 0,2 0,3 0,4 0,5 0,6 0,7
sprite.js view-anim bounce --fps 10 --loops 3
```

Cells can belong to multiple groups (e.g., a 12-frame walk could have `walk` covering 0..11 and `walk_down_cycle` covering 0..3).

## Sheet Grid Layout

When creating a project, choose grid dimensions purposefully:

| Layout | `--rows × --cols` | Use for |
|---|---|---|
| Single row | `1 × N` | Simple cycles (bounce, idle) — scrubbable |
| Square | `4 × 4`, `8 × 8` | Character with multiple animations (idle row, walk row, attack row) |
| Wide grid | `2 × 8`, `3 × 8` | Character sheet — row per animation type |
| Tall | `8 × 1` | Vertical scroll / spritesheet tools that want column layout |

**Don't** put unrelated sprites in the same project — each conceptual asset gets its own sprite sheet (own `sprite.js new`). Cross-asset pollution makes export paths and palettes messy.

## Clipping Shapes to Other Shapes

When you need a shape — a curve, a pattern, a decoration — to appear **only within** the silhouette of another shape, use `--clip-to <mask_shape>` on the draw command. Pixels outside the mask are dropped.

Typical uses:
- Surface detail on a curved form (seams, stitching, stripes on a body).
- Decorations (spots, decals, logos) that should follow a character's silhouette.
- Construction curves where only the visible-on-surface portion should persist — often the drawn shape is drafted much larger than the mask, with only the intersection surviving.

Pattern:
1. Draw the base shape with a name (`--name body`).
2. Draw the decoration *over* it with `--clip-to body`. The decoration may extend well beyond the body's bounds — clipping discards the overflow.

```
sprite.js draw circle  --cell 0,0 --cx 32 --cy 32 --r 20 --color "#df7126" --name body
sprite.js draw ellipse --cell 0,0 --cx 10 --cy 32 --rx 24 --ry 24 \
                       --color "#000000" --filled false \
                       --name stripe --clip-to body
```

The ellipse's outline would normally extend from x=−14 to x=34, but only the pixels falling inside `body` become permanent points. Result: a curved stripe that hugs the body's surface and disappears at its edges.

Limitations: the clip source must be an unfilled outline (`--filled false` on ellipse or circle). Masks can be circle, ellipse, or rect.

## Copy / Clone Patterns

- **`copy --from --to`** — deep-copies *all shapes* in a cell. Use when building animation frames from a base frame.
- **`clone-cell --from R,C --to R1,C1 R2,C2 ...`** — atomic fan-out: copy one source cell into many destinations in a single call. Replaces the bash loop pattern for initializing a full animation strip from a base frame. Either all destinations succeed or nothing changes.
- **`clone <name> --from --to [--as]`** — copies a *single named shape* across cells. Use when only one element moves across frames (e.g., eye blink — clone `eye_l` from "open" frame to "closed" frame, adjust).

Rule of thumb: `clone-cell` first (seed every frame from the base), then `move-to` / `resize` per-frame. Only `clone` for single-shape changes on an otherwise-unchanged scene.

## Pattern-Matched Shape Groups Across Cells

Creating a shape group across every cell that contains matching shapes:

```
sprite.js shape-group create seams --all-cells --pattern '^seam_'
```

This scans every cell, finds shapes whose names match the regex, and creates (or overwrites) a `seams` shape group per cell. Replaces the `shapes --cell | grep -oE 'seam_*' | sort -u` bash pattern used for refresh/delete workflows.

## Batch Mode for Per-Frame Work

For per-frame parameterized work (8 animation frames with different ball positions), use `batch` with `--vars-file`:

```
sprite.js batch frame-ops.json --vars-file frames.json
```

`frame-ops.json` contains placeholders like `"cx": "{{cx}}"`, and `frames.json` is an array of dicts — one per frame — that get substituted in. Fail-fast by default; `--continue-on-error` attempts remaining operations but still exits 1 on any failure. See [tool reference](../sprite-editing/references/tool-reference.md) for DSL details.

## Common Mistakes

- **Highlights drawn before the ball** — they render underneath and disappear. Always draw lighting *after* the target shape.
- **Ground shadow drawn last** — ends up on top of the ball. Draw it first.
- **Un-named shapes you need to edit** — inspect with `shapes --cell`, rename via `rename`, but far easier to name up front.
- **Per-frame rebuilding instead of copy+adjust** — drawing all 8 frames from scratch is 8× the work and produces inconsistencies.
- **Line details (eyes, outlines) drawn before lighting** — lighting then covers them. Details always last.

## Reference

- `sprite-editing` — commands and flags.
- `sprite-shading` — per-tier draw-order for lighting.
- `sprite-motion` — animation cycle structures that inform grid layout.
