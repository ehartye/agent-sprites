---
name: sprite-shading
description: Shade pixel-art sprites with highlights, shadows, and tone ramps. Use when a sprite looks flat, needs volume or rim/specular light, or sphere-shade/highlight/shadow placement needs adjustment; not general CSS shadows or 3D rendering.
---

# Sprite Shading

CLI examples use the invocation from [sprite editing](../sprite-editing/SKILL.md);
load that setup before running commands and stop on command failure.

Give flat shapes visible form. Works with the `draw highlight` and `draw shadow` commands from `sprite-editing`.

## Prefer `draw sphere-shade` for circles/ellipses

For spheres (circle/ellipse targets), `draw sphere-shade` composes all the tiers below in one call. It's the default path — reach for explicit per-tier `draw highlight` / `draw shadow` only when you need non-standard spans, per-tier clipping, or surfaces that aren't spheres (rects, composite shapes).

```
sprite.js draw sphere-shade --cell 0,0 --shape ball --direction top-left
# --intensity auto picks low/med/high by size. Override with --intensity high for extra tiers.
```

The tier table below documents what `sphere-shade` emits and why — read it before overriding defaults.

## The Rule

Before placing any lighting pixel, answer:
1. **Where is the light coming from?** Pick a direction and stick to it across every shape in the sprite.
2. **What surface am I on — flat or curved?** Flat sides get straight edge runs; curves get arc-following clusters.
3. **What tone tiers does this sprite deserve?** Small sprites (≤16px) get 2 tiers (highlight + core-shadow). Larger sprites (32px+) deserve 4–6 tiers for real volume.

## The Five-Tier Ramp

Canonical pixel-art sphere shading uses a value ramp of five steps. Draw in this z-order (bottom → top) so detail sits on top of broad fills:

| Tier | Color source | Placement | Purpose |
|---|---|---|---|
| 1. **Base** | chosen fill | whole shape | the midtone |
| 2. **Form shadow (dark-mid)** | `shadow --strength 1` | **wide** span (~100–120°), radius 0.75–0.80, shadow side | wraps the unlit half — this is what makes it *round* |
| 3. **Core shadow** | `shadow --strength 2` | **narrow** span (~30–40°), radius 0.70, shadow side | darkest band at the terminator |
| 4. **Rim / reflected light** | `highlight --strength 1` | narrow span (~25–30°), radius ~0.92, shadow side | environmental bounce on the dark-side silhouette |
| 5. **Main highlight** | `highlight --strength 1` | compact (~30°), radius 0.55, lit side | the lit surface |
| 6. **Specular peak** *(optional)* | `highlight --strength 3` | tight (~20°), radius 0.45, lit side, `--count 2` | glossy hotspot (skip for matte surfaces) |

Defaults in the tool already match tiers 3 and 5 — omit `--span-deg` / `--radius-factor` when the defaults are what you want.

## Scale Budgeting

| Sprite size | Recommended tiers |
|---|---|
| ≤16px | Tier 5 + Tier 3 only |
| 32px | +Tier 2 (form shadow) |
| 48–64px | +Tier 4 (rim) and/or Tier 6 (spec) |
| >64px | All six + consider multiple highlight steps |

Pixel count auto-scales with shape radius. Let it — only override `--count` when you need something deliberately sparse.

## Worked Example (64px ball, blue)

```
sprite.js draw circle --cell 0,0 --cx 32 --cy 32 --r 16 --color "#639bff" --name ball

# form shadow — wide wrap
sprite.js draw shadow    --cell 0,0 --shape ball --direction bottom-right --strength 1 \
                         --name mid  --span-deg 110 --radius-factor 0.78

# core shadow — narrow & darkest
sprite.js draw shadow    --cell 0,0 --shape ball --direction bottom-right --strength 2 \
                         --span-deg 35  --radius-factor 0.72

# rim light — reflected bounce on the dark-side silhouette
sprite.js draw highlight --cell 0,0 --shape ball --direction bottom-right --strength 1 \
                         --name rim  --span-deg 30  --radius-factor 0.92

# main highlight — lit-side cluster
sprite.js draw highlight --cell 0,0 --shape ball --direction top-left     --strength 1

# spec peak — glossy hotspot
sprite.js draw highlight --cell 0,0 --shape ball --direction top-left     --strength 3 \
                         --name spec --span-deg 20  --radius-factor 0.45 --count 2
```

## Anti-Patterns

- **Pillow shading** — tracing the outline with a dark color. Makes shapes look flat and blurry. If your shadow is at `radius-factor > 0.9` on multiple directions, you've pillow-shaded.
- **Symmetric shadow = highlight spread** — if both span 80°+ the dark side bleeds visually into the light side. Keep core-shadow narrow; let form-shadow carry the width.
- **Outline-only darkening of the lit side** — the lit-side silhouette should stay at *base* tone or even pick up a mid-light tone; never darken it.
- **Harsh single-step jumps on big sprites** — at 64px+ skipping the form-shadow tier creates a visible seam between highlight and core-shadow. Use the mid tier.

## Flat vs Curved Surfaces

The tool branches internally:
- **Rects** get pixels along the bbox edge (straight runs — correct for flat sides).
- **Circles / ellipses** get pixels along an arc **inside** the shape, following the curve.

Don't use `--direction top-left` on a big ellipse — corner directions on curves trace the bbox corner, which is outside the filled area. Use `top` or `top-left` only when the tool's arc logic can handle it (circles/ellipses do; mixed-geometry targets may not).

## Palette Requirements

Ramp-aware palettes: `pico8`, `db-16`, `db-32`. The tool errors if the target's color isn't in a ramp. When building a new sprite, pick a base color with **headroom in both directions** — at minimum 2 darker steps and 2 lighter steps available for a 32px+ sprite.

See [sprite palette](../sprite-palette/SKILL.md) for ramp selection.

## Reference

Full flag listing in [tool reference](../sprite-editing/references/tool-reference.md). Key flags: `--direction`, `--strength`, `--count`, `--span-deg`, `--radius-factor`, `--name`.
