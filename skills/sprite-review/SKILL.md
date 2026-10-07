---
name: sprite-review
description: Score pixel-art sprites, tiles or a set of related sprites against a written rubric and turn the scores into a prioritized remediation plan. Use when asked to review, audit, grade or critique art quality, to decide what to fix first, to check a set for consistency, or to write a design update proposal for existing art; not for technical sheet checks (sprite-verification) or for the rules themselves (sprite-craft).
---

# Sprite Review

A review is a measurement followed by a plan. [sprite craft](../sprite-craft/SKILL.md) holds
the rules experts use; this skill applies them as a scored rubric, keeps the evidence
behind every score, and ends with fixes ordered by payoff. [sprite verification](../sprite-verification/SKILL.md)
checks the sheet is correct; this checks the art is good and says what to do about it.

Review the art as the player meets it. A sprite judged only on its own sheet misses ground
contrast, scale, crowding and the other assets beside it.

## 1. Scope the review

State, in two lines, before looking: what the art is for (game, screen size, zoom, background)
and what the brief asked of it (style references, mood, constraints). A review without a
brief can only judge craft, and must say so. List what is **not** in scope (interiors,
animation, UI) so a clean report is not read as covering it.

## 2. Collect the evidence kit

Make these views for every asset, from the shipped pixels. Do not review from memory or
from a description.

| View | Catches |
| ---- | ------- |
| In context at the real zoom, and a phone-sized frame if the game ships there | Ground contrast, crowding, whether a whole asset even fits the frame |
| Nearest-neighbor crop at 6-8x | Single pixels, clusters, outline, AA |
| Grayscale | Value structure; any asset whose parts merge into one gray |
| Silhouette fill (one dark color) | Shape identity, near-duplicate silhouettes in a set |
| Palette table: colors per asset, edge colors, colors shared across the set | Palette discipline, outline policy, kit coherence |
| Set lineup, side by side at one scale | Consistency and distinctness |
| Scale contract: the anchor (character source size, draw scale), each layer's source size, draw scale and measured pixel step, and the exempt list | Mixels, wrong-size assets, undeclared exceptions |

Instrument what the eye cannot judge (counts, contrast ratios); do not instrument taste.
Record which view each finding came from.

## 3. Score against the rubric

Score each asset 0-4 on each dimension, and the set on the set dimensions. Anchors:
**0** fails and hurts readability; **2** acceptable, with a visible weakness; **4** an
expert would not change it. Use whole numbers and cite the evidence view.

| Dimension | Ask | Evidence |
| --------- | --- | -------- |
| Silhouette and identity | Filled flat, is it recognizable and different from its neighbors? | silhouette, lineup |
| Value structure | In grayscale do a few large light and dark masses survive? | grayscale |
| Light and form | One light direction; volume, not edge-darkening; flat faces flat | crop |
| Color and palette | Neighbors distinct at 1x; hue-shifted ramps; count fits the style | palette table |
| Outline and edges | One deliberate policy; contrast against object and background; no stray pixels or broken runs | crop, palette |
| Texture and detail | Detail survives 1x; no accidental noise or dither | context, crop |
| Fit to context | Reads against the real background; grounded by one contact shadow; one pixel scale across the frame; honors the brief | context |
| Set: consistency | Shared palette, outline, light, pixel scale | palette, lineup |
| Set: distinctness | Identifiable without labels or color alone | silhouette, grayscale |

For places, terrain and scenes, also apply [world rules](../sprite-craft/references/world-rules.md)
(one pixel scale, a value ladder, one contact shadow, a human kit over a biome ground, a ground
recipe, solid-looking is solid) and size things with [scale and proportion](../sprite-craft/references/scale-and-proportion.md).
For lettering (logos, titles, signage, UI text, app icons) use [branding and text](references/branding-and-text.md);
for ships, vehicles and establishing shots use [vehicles and reveals](references/vehicles-and-reveals.md).
For a character's alternate facings, apply
[directional consistency](../sprite-character/references/directional-consistency.md):
compare head volume, feature prominence and head opacity against the established
views. These belong to silhouette, detail and set consistency; atlas validity
does not establish a style match.
Add **Motion** (timing, stable clusters between frames) only for animated art, using
[small-sprite motion](../sprite-craft/references/small-sprite-motion.md). Tag each score
**measured**, **viewed** or **inferred**; keep inferred scores out of the overall figure.

**Gates.** A 0 or 1 on silhouette, value or fit-to-context fails the asset regardless of
average. **The scale contract is a hard gate:** state the anchor, then list each layer's effective
scale (draw scale from code, confirmed by the pixel-step measurement in
[scale and proportion](../sprite-craft/references/scale-and-proportion.md)). Any layer off the
anchor fails the review unless it is on the exempt list with a reason (UI, text, map, title art,
small effects). An unmeasured contract is reported as not reviewed, not as passed. **Bands** for the mean of measured and viewed scores: 3.3+ ship, 2.5-3.3 polish,
below 2.5 rework.

## 4. Separate what to fix from what to keep

Name the strengths worth preserving, and any quirk that looks like a defect but is a
deliberate style choice the brief supports. The plan must not undo them.

## 5. Write the remediation plan

One row per finding, ordered by visible gain at the real zoom. For each:

- **Finding and evidence**: the symptom, the view it came from, the number if measured.
- **Fix**: a concrete edit, not "improve contrast". Name the skill that carries it out
  ([shading](../sprite-shading/SKILL.md), [palette](../sprite-palette/SKILL.md),
  [editing](../sprite-editing/SKILL.md), [composition](../sprite-composition/SKILL.md),
  [motion](../sprite-motion/SKILL.md)).
- **Effort and blast radius**: small, medium or large; which other assets or saves change.
- **Expected lift**: which score moves and by how much.
- **Acceptance check**: how the re-review proves it, using the same view.

**Order.** Fix silhouette and value first, because they change what every later pass is
painting over. Group fixes to a shared kit once, not per asset. Put cheap fixes that touch
no shape before expensive ones.

**Real options get a comparison.** When a finding has two or more credible fixes, give each
its time, risk, complexity, distance from best practice and maintenance cost, then recommend
one. Do not list options as one-line labels.

## 6. Report

Lead with the verdict and bands, then the score table, strengths to preserve, the plan, and
the re-review criteria. State the limits plainly: what was not viewed, which scores are
inferred, and that a rubric finds defects but does not supply taste. For a human-gated
pipeline, the human approval stays the final judge. A proposal changes nothing in the
project; applying it is a separate request.
