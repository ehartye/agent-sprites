---
name: sprite-craft
description: Judge and improve how good a pixel-art sprite looks, using expert craft rules for silhouette, value, light, color, outlines, clusters, dithering and small-sprite motion. Use when asked to make a sprite look better, more polished or more beautiful, to critique or review sprite art, to pick an outline or dither style, or when a sprite reads flat, muddy, noisy or amateur; not for tool setup, export or technical QA.
---

# Sprite Craft

Tool-neutral craft rules for the question "is this sprite *good*, and what would
make it better." Other skills say how to make marks (`sprite-editing`), shade
(`sprite-shading`), pick colors (`sprite-palette`) and animate (`sprite-motion`);
this one says what to aim for and how to judge it. `sprite-verification` checks the
sheet is correct; this checks it is *good*.

The rules come from named practitioners (Derek Yu, Pedro Medeiros, Slynyrd and
community tutorials). Each is tagged **[agreed]** (independent sources concur),
**[contested]** (sources disagree) or **[thin]** (one source, or a low-quality one).
Treat **[thin]** as a prompt to look, not a rule. Sourcing and links are in
[the references](references/).

These rules judge one asset. For a whole place (terrain, paths, shadows, scale across
a scene) read [world rules](references/world-rules.md).
For choosing sizes before you draw (pixel size, proportions in character heights, tile
size, camera zoom, measuring a finished frame) read [scale and proportion](references/scale-and-proportion.md).

## Declare your scale before drawing

Every brief for a new place, building, prop or tile kit opens with a scale contract, before
the first operation:

- **Source pixel size** of the asset (its canvas in art pixels) and the **draw scale** the game uses for it.
- **The anchor** it matches: normally the character, with its source size and draw scale
  (this project's native primary is 16x32 drawn at 2x).
- **Exempt layers**, each with its reason: UI, text, maps, title art, small effects. Any layer
  that is off the anchor and not listed is a defect, not a style choice.

Derive the source size from the screen footprint you want divided by the draw scale. If the
brief gives no anchor, read the draw scale from the game's code; never assume 1x. Details,
proportion tables and the measurement recipe are in the reference above.

## Critique in this order

Fix an earlier step before polishing a later one. Judge the sprite at **1×**, since
that is how players see it, but you cannot read single pixels there: also make a
nearest-neighbor copy at 6–8× and read the pixels from that. State which view each
finding comes from, and do not make exact-pixel claims you could not resolve.

1. **Silhouette.** Fill it with one color: does it still say what it is and which way
   it faces? Distinct limbs, a recognizable head and one or two exaggerated features
   beat accurate proportions. At 32×32 and below, color and a few key pixels carry
   identity more than line work does. **[agreed]**
2. **Value structure.** Squint, or set saturation to zero: "a few large clusters of
   light and dark should still emerge." Flip the sprite horizontally to expose
   proportion and shading flaws. If the grayscale is muddy, no hue will save it. **[agreed]**
3. **One light, real form.** One light direction. Flat faces take one color; only
   curved surfaces get ramps. Shading follows volume, not the outline. The
   "pillow shading" mistake (darkening inward from the edge) is named by Yu, Medeiros
   and the Pixel Joint thread. Think in simple volumes before details. **[agreed]**
4. **Color identity.** Neighboring colors must be distinguishable at 1×; when they are
   too close "pixels begin to blend together and get lost." Use hue-shifted ramps
   (warmer toward the light), not straight ones, and avoid high saturation with high
   brightness. Prefer an existing curated palette over inventing one. **[agreed]**
5. **Outline policy.** Decide it once per asset: hard dark, tinted dark, selective, or
   none. An outline must add contrast against both object and background. Pure black
   reads cartoonish and harsh; a darkened version of the local color is the common
   upgrade. **Before recommending a lightened or open lit-side outline, ask what
   background the sprite will sit on:** it fails on backgrounds it was not drawn for,
   so for unknown backgrounds keep the outer edge a tinted dark and lighten only
   internal lines. See [outlines and edges](references/outlines-and-edges.md).
   **[agreed; sel-out meaning contested]**
6. **Clusters and edges.** Remove stray single pixels and broken lines (jaggies); give
   curves consistently growing or shrinking segment lengths; avoid one-pixel-thick
   limbs. Anti-alias sparingly and only where the background is known. **[agreed]**
7. **Dithering.** Default to none on character sprites; use hard-edged ramps instead.
   See [dithering](references/dithering.md). **[agreed that it is rarely needed; the
   "never on animated characters" line is one author's advice]**
8. **Motion.** Vary frame timing, hold the impact pose, keep cluster shapes stable
   between frames, and exaggerate poses as sprites shrink. See
   [small-sprite motion](references/small-sprite-motion.md). **[thin]**

## Small-sprite trade-offs

Every pixel carries more responsibility as the sprite shrinks, and spending a pixel on
one thing costs another. An outline can cost the room to shade; defined limbs shrink
the head. Decide what the sprite must communicate (face, weapon, stance) and spend
pixels there. Detail that does not survive 1× is noise; remove it.

## Reporting a critique

Rank findings by how much fixing them improves the sprite at 1×, not by order of the
list above. For each: the symptom you see, the rule it breaks, and one concrete
edit. Say when a finding is **[contested]** or **[thin]**. Do not call a sprite
beautiful on the strength of passing these checks; they find defects, they do not
create taste. The human gate in the casting UI stays the final judge.

## Where to act

| Finding | Skill |
| ------- | ----- |
| Flat, no volume, pillow shading | [sprite shading](../sprite-shading/SKILL.md) |
| Muddy or clashing colors, missing ramp steps | [sprite palette](../sprite-palette/SKILL.md) |
| Outline policy, halo, clip to silhouette | [sprite editing](../sprite-editing/SKILL.md) (`border`, `ring`, `--clip-to`) |
| Stray pixels, edits within a cell | [sprite composition](../sprite-composition/SKILL.md) |
| Character construction and silhouette | [sprite character](../sprite-character/SKILL.md) |
| Timing, key poses, frame consistency | [sprite motion](../sprite-motion/SKILL.md) |
| Confirming the sheet is correct after edits | [sprite verification](../sprite-verification/SKILL.md) |
