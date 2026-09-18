---
name: sprite-palette
description: Choose pixel-art palettes and ramp-aware base colors. Use for sprite color schemes, ramp headroom, palette tradeoffs, or shading errors such as a color missing from palette ramps; not general website theming.
---

# Sprite Palette

CLI examples use the invocation from [sprite editing](../sprite-editing/SKILL.md);
load that setup before running commands and stop on command failure.

Pick the palette and base colors before drawing. Wrong palette → `draw highlight` / `draw shadow` errors or produces mud.

## Ramp-Aware vs Flat Palettes

The lighting tools (`draw highlight`, `draw shadow`) look up a lighter/darker neighbor in the palette's **ramp map**. Without a ramp, the tools error with `Color "X" not in palette ramps`.

| Palette | Size | Ramps? | Use when |
|---|---|---|---|
| `pico8` | 16 | ✅ | General-purpose, punchy retro colors |
| `db-16` | 16 | ✅ | Richer earthy/muted 16-color set |
| `db-32` | 32 | ✅ | Larger color space, deeper ramps (best for 32px+ sprites) |
| `gameboy` | 4 | ❌ | Flat 4-shade green/monochrome — hand-shade only |
| `nes` | — | ❌ | Authentic NES feel — hand-shade only |
| `cga` | — | ❌ | Retro DOS — hand-shade only |

**Rule:** for anything that should have lighting, use `pico8` / `db-16` / `db-32`. For period-accurate flat-shaded retro art, the others are fine but you're hand-placing every highlight pixel.

## Choosing a Base Color (Headroom)

The tool steps `N` positions along the ramp per `--strength N`. For a **multi-tier sphere** you need:
- At least **2 lighter steps** (for highlight + spec peak).
- At least **2 darker steps** (for form shadow + core shadow).

Pick base colors that sit in the **middle of a ramp chain**, not at an end.

### Quick reference — db-32 base candidates with full headroom

| Base | 2 lighter | 2 darker | Feel |
|---|---|---|---|
| `mandy` #d95763 | plum, white | red, loulou | Bouncy red |
| `cornflower` #639bff | viking, light-steel-blue | royal-blue, deep-koamaru | Classic sky-blue sphere |
| `tahiti-gold` #df7126 | twine, pancho | rope, oiled-cedar | Warm orange |
| `christi` #6abe30 | atlantis, golden-fizz | dell, opal | Saturated green |
| `royal-blue` #5b6ee1 | cornflower, viking | deep-koamaru, valhalla | Deeper blue |

### Anti-candidates (ramp dead-ends)

- `black`, `white`, `valhalla` — lighter/darker step stays at itself; can't highlight/shadow meaningfully.
- Any color flagged as a single-step in the ramp map (rare; `draw` will error if so).

## Picking a Palette by Task

- **Small sprites (16px, 2-tier lighting):** `pico8` — punchy, ramps short but visible at small scale.
- **Medium (32px, 3–4-tier):** `db-16` or `db-32` — more mid-tones available.
- **Large (64px+, 5–6-tier):** `db-32` only — other palettes don't have enough headroom.
- **UI / flat icons:** any; ramps irrelevant when you only need solid colors.

## Verifying Ramp Availability

Before a big shading pass on a new color, smoke-test:

```
sprite.js draw circle    --cell 0,0 --cx 8 --cy 8 --r 5 --color "<base>" --name test
sprite.js draw highlight --cell 0,0 --shape test --direction top-left --strength 2
sprite.js draw shadow    --cell 0,0 --shape test --direction bottom-right --strength 2
```

If either errors with "not in palette ramps", the color isn't usable with the lighting tools in that palette — pick a different base or switch palettes.

## Using Hex Colors Outside the Palette

You can `draw` any shape with an arbitrary hex (`--color "#aa66dd"`), but `draw highlight` / `draw shadow` **require** a ramp-registered color. Off-palette fills work; off-palette lighting doesn't.

If you need a custom color shaded, add it to the palette file (`server/engine/palette.js`) with a ramp entry. This is a code change, not a CLI workflow — only do it when the color will be reused across a project.

## Common Mistakes

- **Starting with the wrong palette** — drew everything in `gameboy` then asked why `draw shadow` errors. Switch palettes **before** drawing, or prepare to hand-shade.
- **Using a ramp endpoint as base** — `black` as a ball color leaves nowhere to go darker. Pick a mid-ramp color.
- **Ignoring temperature shifts in ramps** — db-32 ramps aren't pure value shifts; blue → cornflower → viking drifts toward cyan. Usually this reads as cool light. For warm light, pick a ramp that drifts toward yellow/orange (e.g. `rope → tahiti-gold → twine`).

## Reference

Palette definitions: [palette.js](../../server/engine/palette.js). The ramp map shows every lighter/darker neighbor.
