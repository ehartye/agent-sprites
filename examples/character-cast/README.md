# Reusable character recipes

Requires agent-sprites 0.19.0 (0.21.4 for paired anatomy, pelvic volume and calibrated profile walking). Copy `sprite-project.json` into your project and run
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
| `outfits` | Unique array: `casual` (default), `field`, `service`, `retro`, `wayfarer`, `phase-suit` |
| `directions` | Unique array: `down` (default), `right`, `up`, `left` |
| `fps` | Finite number 1–60; default 10 |

Each person has a required `id`, and optional `body`, `hair`, `skin`, `colors`,
`head`, `arms`, and `equipment`. Nonhuman options require 0.20.0.
Names and IDs begin with a lowercase letter, contain lowercase letters, digits,
hyphens or underscores, and are at most 48 characters. Unknown fields, nulls,
duplicate entries and unsupported values fail before publication.

- Bodies: `adult` (default), `adult-sturdy`, `adult-slim`, `child`, `older-child`, `rangy`.
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

Profile frames also expose `legs[].heel`, `legs[].ball` and `legs[].toe`: actual
boot-outline sole landmarks in source pixels, rather than a guessed foot center.
`legs[].foot` describes the authored `rest`, `heel`, `flat`, `toe`, or `swing` shape and
whether it contacts the floor. `support` identifies the loading/supporting leg;
the trailing foot may still contact the floor during the handoff. A toe-supported
foot has a raised heel and ankle, so contact checks must not require ankle y=52.
`alignment` records the upright preset, `neutral` (true only for idle), shoulder/hip
landmarks in `shoulders`, and heel/toe/hip landmarks in `feet`. Each record has the
anatomical `name` and signed world-coordinate `offsetX`: shoulder minus hip or heel
minus hip. Feet include `support`. Front/back frames omit these profile-only
measurements. The torso/pelvis axis is x=20. In profile rest, each primary arm and
leg chain is vertical, with its shoulder, hip and actual heel sharing an x coordinate.
The two sides retain one pixel of depth separation. The neutral `rest` boot places
its shaft above a grounded heel; it is distinct from the walking `flat` sole.
Walking shoulders may sit one pixel either side of the torso axis, and walking
heels follow the stride. Validation reads actual joints and sole geometry rather
than trusting cached measurements.

Named shapes retain separate eye whites, irises, pupils, catchlights, eyelids and
brows. Shape groups include face, helmet, and each arm/leg. Suits include helmet,
neck/wrist/ankle seals, gloves and a life-support pack; hair stays inside the hood.
Profile helmets use an opaque rear shell, one visible side hinge and a forward visor; the entire construction mirrors for left-facing art. These are visual designs, not pressure-suit engineering specifications.

## Anatomy and distance-driven walking (0.21.4)

Paired arms share upper/lower segment lengths and shoulder-relative angular poses.
Compare an anatomical side at frame `f` with its opposite at `(f + 4) % 8`, allowing
for projection and pixel rounding. Their simultaneous poses differ by design.
The `pelvis` report and `pelvis_outline`/`pelvis` shapes connect the waist and
upper thighs; the seat contour is separate from the hip joint and alignment axis.
`pelvis.rearFullness` adds one pixel behind the profile seat without extending its
front edge. Front torsos are one pixel wider and their shirt opening spans three
pixels; front arm anchors remain fixed. Primary upper-arm caps are beveled so the
shoulder silhouette descends toward the sleeve instead of ending in square corners.

Each report frame includes `locomotion`: `cycleDistance`, `frameDistance`,
`phaseDistance`, `frameCount` (8), configured `fps`, a cardinal `direction` vector,
`contactCalibration`, `rootCompensation`, and per-leg `contacts`. Distances are
source pixels. For a distance-driven walk:

```js
const frame = Math.floor(distance / gait.frameDistance) % gait.frameCount;
const remainder = distance % gait.frameDistance;
const speed = gait.frameDistance * gait.fps;
// Profile sprites are discrete poses. Hold the drawing between pose advances.
const offset = gait.rootCompensation === 'subtract-phase-remainder'
  ? gait.direction.map(component => -component * remainder)
  : [0, 0];
```

Apply the offset only while walking, to the draw position, not collision state.
Reset the phase when turning; derive facing and travel from actual displacement
after collision. Match source-to-world scale when interpreting distances. A
different speed changes cadence; do not retain a former hard-coded frame distance.

Profile contact is calibrated: the same physical heel during landing/flat support,
and toe during flat support/push-off, remain planted across their contact windows.
Front/back views are marked `contactCalibration: "projected"` with compensation
`"none"`: their depth/lift shorthand is not an exact world-space foot-lock model.
Do not advertise profile contact measurements as certification of those views.

## Review and iterate

1. Build a true `mode: "idle"` sheet first, including both profile directions.
   A paused walk frame is not a neutral standing pose. Inspect the shoulder
   attachment, pelvis, and heel stack at native size and 4×; distinguish heels
   from projecting toes and visible arm edges from actual shoulder joints.
2. Inspect each walking phase and then play the full cycle, including the final
   frame's transition back to the first. Contact, lowering, passing and raised
   phases have different support relationships. Preserve separated feet and
   forward knee bends; do not force moving heels onto the neutral plumb line.
3. Inspect both color and a flat silhouette in front, profile and back. Check
   head/neck and torso/pelvis continuity, arm ownership, planted support, boot
   projection, faces and suit seals. Repeat for the smallest body and extra arms.
4. Collect independent blind observations from raw art before supplying joint
   guides, implementation history or a suspected fix. Keep those observations
   separate from the later guided measurement pass. Compare exported shoulder,
   hip, heel and toe landmarks against the rendered pixels after that first pass.
5. Check the same physical sole landmark over a fixed floor grid during actual
   movement. A contact sheet cannot reveal sliding or certify cadence. Test both
   facings, release to idle, and collision sliding. Compare phase-matched anatomy
   before blaming deliberate shading or occlusion for a mismatched limb.

Geometry validation catches clipping and defined joint regressions; it cannot
certify appealing silhouettes, weight transfer or convincing playback. A numeric
pass with the same unwanted lean is not acceptance. Record what was actually
visible and which hidden joints remained uncertain before choosing a correction.

Keep recurring corrections in `server/authoring/` with focused regressions.
Keep character identities, palettes and outfit choices in the consuming game's
JSON. Rebuild all affected study sheets after a tool correction. Generated project
edits are overwritten on rebuild; copy intentional hand-edited variants separately.

## Nonhuman humanoids (0.20.0)

Head kind, body proportions and arm count are independent recipe choices:
`head: "human" | "insectoid"`, `arms: 2 | 4`, and
`equipment: "none" | "survey-rig"`. Defaults preserve existing human recipes.
Insectoid heads have compound eyes, articulated expressions, antennae that fold
inside helmets, and mandibles. Omit `hair` for insectoid heads; a supplied human
hairstyle is rejected rather than ignored. Colors use the existing palette roles.

`rangy` gives the biped longer legs. `wayfarer` supplies an unsealed split mantle;
`phase-suit` supplies a sealed suit fitted to every arm. Equipment and clothing
have direction-specific visible surfaces. Four-arm rigs include separate shoulder,
elbow and wrist positions for each arm in `report.frames[].arms`, with anatomical
names `left`, `right`, `left_lower`, `right_lower`. Reports also expose `headKind`,
`armCount`, `equipment`, and accurate `sealed` state. Extra arms keep separate
editable groups; directional mirroring swaps anatomical name tokens.

Copy [the nonhuman example](../nonhuman-wayfinder/sprite-project.json), build it
through the managed launcher, inspect every view, then try walk/expressions modes.
The Room2Grow stress test exercises 8 turnarounds, 64 walking and 16 expression
cells using only JSON inputs. Check arm overlap and clothing occlusion at native
size; more limbs do not automatically remain readable on a small cell. This is a
set of composable authored presets, not an arbitrary creature skeleton system.
