---
name: sprite-palette
description: Choose pixel-art palettes and ramp-aware base colors. Use for sprite color schemes, ramp headroom, palette tradeoffs, or shading a color missing from palette ramps; not general website theming.
---

# Sprite Palette

Before running sprite operations, use [sprite setup](../sprite-setup/SKILL.md) for
first-time installation and version sync after plugin updates. Always invoke this
plugin's absolute scripts/run-managed.js with Node; never use a PATH executable,
checkout CLI, or plugin-cache CLI. All sprite.js examples mean that launcher.

CLI examples use the invocation from [sprite editing](../sprite-editing/SKILL.md);
load that setup before running commands and stop on command failure.

Pick the palette and base colors before drawing. Wrong palette → `draw highlight` / `draw shadow` derive off-palette tones or produce mud.
For the color rules experts use to judge a sprite (neighbor identity, hue-shifted ramps, outline contrast), see [sprite craft](../sprite-craft/SKILL.md).

## Ramp-Aware vs Flat Palettes

The lighting tools (`draw highlight`, `draw shadow`) look up a lighter/darker neighbor in the palette's **ramp map**. Without a ramp entry they derive the step in HSL instead (lighter and warmer, or darker and cooler) and list it under `derived` in the result, so you can see which colors came from the palette and which were computed.

| Palette | Size | Ramps? | Use when |
|---|---|---|---|
| `pico8` | 16 | ✅ | General-purpose, punchy retro colors |
| `db-16` | 16 | ✅ | Richer earthy/muted 16-color set |
| `db-32` | 32 | ✅ | Larger color space, deeper ramps (best for 32px+ sprites) |
| `gameboy` | 4 | ✅ | 4-step green ramp (ends clamp); auto tools give one or two visible steps |
| `nes` | — | ❌ | Authentic NES feel — auto tools derive HSL steps; hand-shade for exact NES colors |

Use `pico8` / `gameboy` / `db-16` / `db-32` when you want automatic lighting to stay inside the palette. Custom
hex ramps with explicitly drawn shadow/highlight shapes also support shaded art;
they do not need engine changes. This is often the better fit for small RPG
characters: see [sprite character](../sprite-character/SKILL.md).

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
- Any color whose ramp step is itself (the ramp clamps; the tool paints no visible change).

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

If the result lists `derived` entries, the color has no ramp in that palette: the steps were computed, not chosen from the palette. That is fine for a one-off tone; for a limited-palette look, pick a ramp base or switch palettes.

## Using Hex Colors Outside the Palette

You can `draw` any shape with an arbitrary hex (`--color "#aa66dd"`), and `draw highlight` / `draw shadow` / `sphere-shade` shade it too, deriving each step in HSL (0.10 lightness and 8° hue per strength step). Derived tones are not palette colors, so they widen the sprite's color count.

For a custom ramp, define semantic hex roles in the source (skin base/shadow/light,
hair base/light, cloth base/shadow/light) and draw those colors explicitly. Change
`server/engine/palette.js` only when the task actually calls for reusable automatic
ramp lookup. Preserve distinct skin ramps across a cast; do not obtain every skin
tone by darkening the entire character or replacing all colors in one group.

## Common Mistakes

- **Starting with the wrong palette** — drew everything in `nes` or custom hex, then got HSL-derived shadows that sit outside the palette. Switch palettes **before** drawing, or hand-shade with chosen colors.
- **Using a ramp endpoint as base** — `black` as a ball color leaves nowhere to go darker. Pick a mid-ramp color.
- **Ignoring temperature shifts in ramps** — db-32 ramps aren't pure value shifts; blue → cornflower → viking drifts toward cyan. Usually this reads as cool light. For warm light, pick a ramp that drifts toward yellow/orange (e.g. `rope → tahiti-gold → twine`).

## Reference

Palette definitions: [palette.js](../../server/engine/palette.js). The ramp map shows every lighter/darker neighbor.
