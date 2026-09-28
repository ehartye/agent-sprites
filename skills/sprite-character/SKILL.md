---
name: sprite-character
description: Build editable anime and 16-bit RPG pixel characters with agent-sprites. Use for character builders, JRPG heroes, adult/child NPC casts, hair and outfit variants, or Final Fantasy, Secret of Mana and Stardew-inspired sprites; not portraits, 3D models or general sprite effects.
---

# RPG character builder

Build an original character whose silhouette, face and costume remain recognizable
across views and variants. Start with a small standing study before multiplying
the design into a cast or animation sheet. “16-bit” is an art direction, not a
16×16 canvas requirement, and the named games are references rather than one
interchangeable style.

## Establish the visual contract

Inspect the supplied reference. Separate observations from choices: head/body
ratio, eye placement, outline color, material clusters, camera, ground contact
and signature silhouette. For an exact replication baseline, first use the
[image trace workflow](../sprite-editing/SKILL.md#trace-a-supplied-reference),
preserving supplied pixels; distinguish that measured match from original art.
For constructing new characters, do not interpret a zoomed WebP's dimensions as
its native pixel grid, or turn its compressed edge colors into a huge palette.
State the chosen cell size, visible character height, ground row, directions,
and two identity cues such as a side fringe and short cape. Use the user's
constraints; otherwise begin with 32×48 cells and a front/right idle study.
For smaller targets, redraw to that pixel budget instead of shrinking the result.

Read [construction](references/construction.md) before drawing a bespoke character.
It supplies a starting proportion map, face/profile construction, modular parts
and specific visual checks. Treat its numbers as adjustable design coordinates,
not anatomical facts or measurements of the user's reference.

## Choose a supported source

Load [sprite editing](../sprite-editing/SKILL.md) and run its managed setup/version
check before operations. Resolve the launcher from the installed plugin; never
install dependencies in its cache. Use an isolated `build` for studies.

Two character systems are maintained. **The Stardew-style 16×32 mannequins are the
primary one:** start there for new characters and land new character features there
first. Use the 40×56 recipe when its specific capabilities are needed.

| Need | Source and consequence |
|---|---|
| Stardew-style 16×32 characters (adult, child, large build) with swappable wardrobe, wigs and cast costumes — **primary** | The `examples/native-character` generators: see its [README](../../examples/native-character/README.md) and review page. Hand-authored native poses with diagonal outline corners. Builds publish `character-report.json` (ground row 29, per-frame body `sides` from an authored joint table) and `playback-runtime.mjs`, so `groundAnchor`, `drawAtGround`, `hitBounds` and `attachmentFor` work. Held gear: a trowel in either hand (`gear=trowel:<side>`, or a cast `gear` field), placed by anatomical side. `createWalker` drives native walks: right/left plant the support foot (measured per-frame steps, `contactsCalibrated` in `authored-contact` mode); front/back use a uniform uncalibrated stride. |
| 40×56 characters with joint data, held gear or report-driven walking | Built-in `character` source: shared anatomy fixes and a report. Read the [recipe contract](../../examples/character-cast/README.md). It has fixed cell size and finite presets; recoloring does not change its proportions. It holds a trowel in either hand (`gear: [{item:'trowel', side}]`) and reports each frame's body `sides` (near/far/front/back, shoulder, wrist, hip) for attaching one-sided gear by anatomical side, never by image side. |
| Reference-specific face, silhouette, fantasy costume or smaller grid | Named-shape `ops` or Node `generator`: more drawing/visual review, full control; keep reusable coordinates and palette roles in source to limit maintenance. |

Choose exactly one build source. Do not invent `style: anime`, arbitrary body
sliders, outfit layers or a postprocess hook on the built-in recipe. A bespoke
generator can expose those choices as its own documented parameters. Copy a
build example's source, excluding generated output, into the user's project.
Build owns lifecycle and export; operations start with `new` and omit
`save`, `export` and `ref`. Make frame aliases and expected tags explicit.

For a small bespoke starting point, copy the source from the
[adult/child study](../../examples/anime-character-study/README.md), excluding
`dist`. It provides front/right idle geometry and palette/accessory parameters;
it is not a complete wardrobe or walking system.

## Author and refine

1. Block head, torso/pelvis, arms and feet in silhouette; compare front and profile
   on the same ground. Resolve head size, stance and shoulder attachment here.
2. Construct the face and hair as named clusters. Put detail where it establishes
   identity; inspect at 1× as well as nearest-neighbor enlargement. Use a few
   semantic colors per material, not the full sphere-shading stack on every part.
   Inspect the eyes again after placing the fringe; correct accidental occlusion
   without moving face details above hair that should cover them.
3. Fit clothing and accessories to those landmarks. Keep front hair/rear hair and
   near/far limbs separable. Reuse anatomy and color roles across cast variants;
   let different silhouettes require different geometry, not just palette swaps.
4. Rebuild and inspect the exported pixels. Fix the largest visible mismatch
   before making more variants. Preserve changes in ops/generator/recipe source;
   edits inside generated output disappear on rebuild.

For motion, load [sprite motion](../sprite-motion/SKILL.md) after the neutral
design reads well. A frozen walk contact is not idle. Author direction-specific
occlusion and step poses; moving the whole character up/down alone is not a walk.
Mirror only symmetric designs, then repair handed equipment and world-light
placement. Keep anatomical left/right distinct from screen left/right.

## Review and deliver

Use [sprite verification](../sprite-verification/SKILL.md) for exports and motion.
Also compare native-size front/profile: same head volume, eye line, costume hem
and ground; readable face, attached limbs, clear feet and stable identity. Check
the final outer contour for gaps caused by overlaid fills when the reference
uses a continuous outline. Inspect hair, ears, chin, hands, clothes and soles.
With agent-sprites 0.22.0+, set build `outlineColors` to the intended contour
hex colors, or use `verify --outline-colors "#39283f"`; see
[sprite verification](../sprite-verification/SKILL.md). Keep this list in sync
with palette overrides. Use it only when a continuous opaque outline is intended.
Review against the supplied reference's traits rather than declaring a style match
because the atlas validates. A shape count is not an art-quality target.

Deliver editable source, PNG/atlas and contact sheet/preview with the build
command. State which poses/variants were actually inspected and any remaining
style mismatch. A two-view study does not establish a finished four-direction
walk or a general-purpose character customization UI.
