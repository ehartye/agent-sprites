# Reusable character recipes

Requires agent-sprites 0.19.0. Copy `sprite-project.json` into your project and run
`node "<checked-plugin-root>/scripts/run-managed.js" build <config> --json` after
the setup check. The `character` object replaces `ops`/`generator`; never combine
sources. This example builds an adult and child in everyday clothing and three
fictional pressure suits without a drawing script.

## Recipe fields

| Field | Accepted values / default |
| --- | --- |
| `name` | Sheet identifier, default `characters` |
| `people` | Nonempty array of distinct people |
| `mode` | `idle` (default), `walk`, `expressions` |
| `outfits` | Unique array: `casual` (default), `field`, `service`, `retro` |
| `directions` | Unique array: `down` (default), `right`, `up`, `left` |
| `fps` | Finite number 1–60; default 10 |

Each person has a required `id`, and optional `body`, `hair`, `skin`, `colors`.
Names and IDs begin with a lowercase letter, contain lowercase letters, digits,
hyphens or underscores, and are at most 48 characters. Unknown fields, nulls,
duplicate entries and unsupported values fail before publication.

- Bodies: `adult` (default), `adult-sturdy`, `adult-slim`, `child`, `older-child`.
- Hair: `short` (default), `bun`, `bob`, `waves`, `puffs`, `tousled`.
- Skin: `peach` (default), `tan`, `umber`.
- Colors: `#RRGGBB` overrides for `outline`, `skin`, `skinLight`, `skinShade`,
  `hair`, `hairLight`, `iris`, `jacket`, `jacketLight`, `jacketShade`, `pants`,
  `pantsLight`, `pantsShade`, `suit`, `suitLight`, `suitShade`, `boots`, `accent`,
  `metal`, `signal`, `visor`, `glass`. Retro fabric uses jacket colors.

Body proportions are independent of gender. Children use shorter limbs and
different head/body ratios, rather than resized adult pixels. All cells are
40×56 with ground at y=54 and a bottom-center pivot. Each recipe supports at most
100 authored cells; split large casts or motion sets into separate sheets.

## Frames and editable parts

`idle` emits one frame per person/outfit/direction. `walk` emits eight frames and
an animation tag. `expressions` requires only `down` and emits `neutral`, `happy`,
`curious`, `worried`, `surprised`, `tired`, `half_blink`, `closed`.

Aliases are `<id>_<outfit>_<direction>_idle`, `..._walk_0` through `..._walk_7`,
or `..._<expression>`. Walk tags end in `_walk`; expression tags end in
`_expressions`. Use `expectedFrames` and `expectedTags` in the enclosing build
config for the exact names consumed by your game.

The normal PNG/atlas, contact sheet, HTML preview, replayable operations and
editable project are accompanied by `character-report.json`. Each report frame
has its alias, body/outfit/direction, head envelope, anatomical hip/knee/ankle
and arm joints, support contact, bounds and checks. Left-facing geometry mirrors
the right-facing rig and swaps anatomical labels. The report is part of the same
atomic build publication: invalid recipes preserve previous output.

Named shapes retain separate eye whites, irises, pupils, catchlights, eyelids and
brows. Shape groups include face, helmet, and each arm/leg. Suits include helmet,
neck/wrist/ankle seals, gloves and a life-support pack; hair stays inside the hood.
These are visual designs, not pressure-suit engineering specifications.

## Review and iterate

Inspect faces and suit seals at native size and 4×. Play and scrub front, profile
and back walks. Check planted support, outward boot silhouettes, forward profile
knee bends and restrained head bob. Compare joint guides from the report against
the rendered pixels. Geometry validation catches clipping and joint regressions;
it cannot judge appeal, perceived age or convincing motion.

Keep recurring corrections in `server/authoring/` with focused regressions.
Keep character identities, palettes and outfit choices in the consuming game's
JSON. Rebuild all affected study sheets after a tool correction. Generated project
edits are overwritten on rebuild; copy intentional hand-edited variants separately.
