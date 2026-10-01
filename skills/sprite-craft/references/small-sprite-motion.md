# Small-sprite motion

Confidence: **[thin]**. The only text source captured is one vendor guide (Sprite-AI,
2026), rated low quality. Its numbers are rules of thumb, not measurements. Use them to
decide what to look at, and confirm with the frames.

Contents: timing · squash and stretch · anticipation · staging · consistency · gaps.

## Timing

Vary per-frame duration; do not play every frame equally. Hold the impact and apex
frames longer. Reference ranges from the guide: idle 2–4 frames at 300–500 ms; walk 4–6
frames at 100–150 ms; run 6–8 frames at 60–100 ms; attack impact held 120–200 ms.

## Squash and stretch

At 16×16 it is one or two pixels: a character about 14px tall squashes to 12–13 tall and
1 wider, and stretches to 15–16 tall and about 1 narrower. Apply it to things in motion,
not to static tiles or standing NPCs.

## Anticipation

One extra frame of opposite motion before the action is enough to turn a teleporting
action into a weighted one, and it telegraphs the action to the player.

## Staging

Squint at the animation: can you still tell what action it is? If not, push the poses
further. Readability beats realism, more so as the sprite shrinks.

## Consistency

- Use pose-to-pose for characters to prevent drift (the figure slowly migrating a pixel
  per frame); straight-ahead for fire and water.
- Keep body-part widths and cluster shapes stable between frames unless squash/stretch is
  intended; a torso that is 6px in one frame and 5px in the next reads as flicker.
- Follow-through (hair, cape, tail) needs room: plausible at 32×32, about one pixel at
  16×16, not at 8×8.

## Gaps

No credentialed source is captured for smears, for jitter and flicker, or for rotating
pixel sprites without breaking clusters. For this repository's measured 16×32 and 32×48
walk findings (planted feet, depth cues, rotation destroying thin limbs) use
[sprite motion](../../sprite-motion/SKILL.md), which is grounded in measurements.

## Sources

- Sprite-AI, The 12 animation principles adapted for pixel art sprites (vendor, low quality), https://www.sprite-ai.art/guides/animation-principles
