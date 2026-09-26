---
name: sprite-motion
description: Plan and refine pixel-art sprite animation including bounce, idle, walk cycles, squash/stretch, timing, and key poses. Use when sprite frames need convincing motion; not for CSS/SVG animation, video editing, or general UI transitions.
---

# Sprite Motion

Before running sprite operations, use [sprite setup](../sprite-setup/SKILL.md) for
first-time installation and version sync after plugin updates. Always invoke this
plugin's absolute scripts/run-managed.js with Node; never use a PATH executable,
checkout CLI, or plugin-cache CLI. All sprite.js examples mean that launcher.

CLI examples use the invocation from [sprite editing](../sprite-editing/SKILL.md);
load that setup before running commands and stop on command failure.

Principles for multi-frame pixel-art animation on top of the cell-based sprite sheet.

## Repeatable humanoid characters

For adult/child casts, multipart faces or pressure-suit variants, start with the
built-in `character` build source before writing a game-local drawing generator.
Read the [recipe contract](../../examples/character-cast/README.md), copy its JSON
config, and run the managed `build` command. Body profiles, paired boots, forward
knee hinges and shared eye layers live in the tool; a correction should improve
the shared recipe instead of being copied between games. Inspect the exported
contact sheet at 1× and 4×, scrub contact/passing poses, and compare
`character-report.json` joint guides. Passing geometry checks does not establish
that motion looks natural. Use ordinary named-shape operations for bespoke art;
preserve intentional overrides in source, because rebuilding replaces exports.

## Frame Planning

Lay frames linearly across a row. Name cells or use a cell group so playback order is explicit:

```
sprite.js group create bounce 0,0 0,1 0,2 0,3 0,4 0,5 0,6 0,7
```

Build **one frame completely** first (composition, lighting, details), then `copy` to the remaining cells and adjust. Adjusting per-frame is cheaper than composing eight times.

## Key Poses, Breakdowns, In-Betweens

A solid cycle has three layers:
1. **Key poses** — extremes of the motion. For a bounce: *impact squash* and *apex*.
2. **Breakdowns** — the "favoring" frame between keys that establishes the arc. For a bounce: *mid-air* (round, neutral).
3. **In-betweens** — drawn last, fill the gaps between keys and breakdowns.

Draw key poses first, then breakdowns, then in-betweens. This prevents compounding small errors into a broken arc.

## Squash & Stretch

Deform shapes on motion extremes to sell weight and speed. **Base volume must stay constant** — if the ball squashes wider, it must also flatten shorter.

| Moment | Shape |
|---|---|
| Impact (ground contact) | Wide + flat (`rx↑ ry↓`) |
| Rising / falling at speed | Tall + narrow, stretched along motion vector (`ry↑ rx↓`) |
| Apex (top of arc) | Near-neutral or slightly stretched vertically (gravity slowest here) |
| Mid-air coasting | Full neutral shape |

Use `resize <name> --updates '{"rx":5,"ry":3}'` — not `delete` + redraw — so the shape keeps its name and accumulated lighting references.

## Shadow as Elevation

The ground shadow is the audience's elevation cue. Scale it inversely to height:

| Height | Shadow rx | Shadow ry |
|---|---|---|
| On ground (impact) | largest (~0.75 × ball width) | largest |
| Mid-air | medium | thin |
| Apex | smallest (~0.25 × ball width) | thinnest |

Always pin the shadow's `cy` to the ground line — it doesn't move vertically, only scales.

## Timing & Easing

Even frame spacing produces *linear* motion, which reads as mechanical. Real motion eases.

- **Slow in / slow out** — cluster frames near the extremes (apex, impact). For a bounce, spend more frames near the apex (gravity is slowest there) than mid-fall.
- **Snap on impact** — impact squash lasts 1 frame. Faster → more weight.
- **Hold the apex** — 1–2 frames at apex reads as gravity turnaround.
- **Asymmetric frame counts** — 8-frame bounce might split: 1 impact, 2 rising, 1 mid-rise, 2 apex, 1 mid-fall, 1 pre-impact. Avoid perfect symmetry unless the motion is literally symmetric.

## Playback

Inspect a group in the terminal with `view-anim`:

```
sprite.js view-anim bounce --fps 8 --loops 3
```

Lower fps (6–10) for weighty/deliberate motion, higher (12–16) for zippy motion. The web UI at `localhost:3377` (or the selected `SPRITE_PORT`) also previews the sprite sheet.

## Common Cycles

### Bounce (8 frames)
```
0: impact squash       (shadow wide,   ball flat-wide)
1: rising stretch      (shadow medium, ball tall)
2: mid-rise neutral    (shadow small,  ball round)
3: apex stretch up     (shadow tiny,   ball slightly tall)
4: apex peak           (shadow tiny,   ball neutral)
5: falling stretch     (mirror of 3)
6: mid-fall neutral    (mirror of 2)
7: pre-impact stretch  (mirror of 1)
```

### Idle (4–6 frames)
Subtle bob — ball moves up 1–2px mid-cycle, shadow shrinks 1px, easing slow-in/slow-out. Avoid large motion; it should be hypnotic.

### Walk (8 frames)
Contact / down / passing / high-point for each leg (×2 legs = 8 frames). Same squash/stretch principles apply to the body — it should rise/fall 1–2px with each step.

### Small side-view walk (four keyed poses)

Use the bundled `<plugin-root>/examples/character-walk` as a starting point for a
small humanoid. Resolve the root two parents above this loaded skill and copy the
example's source files (`generate.mjs`, `character.json`, `sprite-project.json`)
into the user's asset source directory. Exclude any existing `dist` directory:
its build ownership belongs to the original config path. Keep generated output
out of the plugin cache. Read its [parameters and anatomy](../../examples/character-walk/README.md).

1. Adjust `character.json`: stride 2–5 pixels, bob 0–1, fps 4–12, and color ramps.
2. Run the absolute managed launcher: `build <copied-folder>/sprite-project.json --json`.
3. Inspect the emitted contact sheet and play `preview.html` through a full loop.
   Confirm consistent facing, alternating contact/pass poses, a planted foot at
   y=29 in every frame, and arm swing opposing the same-side leg.
4. Keep `right_*` (near) and `left_*` (far) anatomical names across the cycle.
   Accessories follow a fixed named hand; screen-left/right changes during swing.

The generator emits ordinary named rectangles/polygons and shape groups. It is
24×32 source art, not a rig or arbitrary-size template. For different proportions,
author new keyed poses; use nearest-neighbor scaling for display. Do not rotate
thin limbs to synthesize a walk. Edit the generator/parameters for repeatable builds;
copy the generated editable project outside `dist` before manual-only refinements.

## Naming Conventions for Animation

Use `name` to label each frame semantically:

```
sprite.js name --cell 0,0 --as impact
sprite.js name --cell 0,4 --as apex
```

Names survive edits and make `shapes --cell impact` legible later.

## Anti-Patterns

- **Copying without adjusting** — 8 identical frames is not animation.
- **Volume-violating squash** — ball grows wider on impact but stays the same height. Reads as inflation, not compression.
- **Shadow stays the same size** — kills the depth cue; sprite reads as sliding, not bouncing.
- **Linear timing** — even frame spacing makes motion feel robotic. Plan slow-ins.
- **Matching highlight across every frame unchanged** — for a bouncing ball the light direction is constant so this is actually *correct*; but for rotating objects, highlights must orbit. Know which case you're in.

## Reference

Use `sprite-shading` for per-frame lighting. Use `sprite-editing` for the raw commands.
