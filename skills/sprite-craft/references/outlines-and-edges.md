# Outlines and edges

Contents: outline styles · the contrast rule · selective outlining and its two meanings ·
internal lines · jaggies and clusters · anti-aliasing · sources.

## Outline styles

| Style | Reads as | Cost |
| ----- | -------- | ---- |
| Hard black | Cartoony, maximum separation | Harsh segmentation; needs transition colors with heavy shading |
| Tinted dark (darkest tone of the local color) | Natural, still separated | Needs a ramp with a dark enough end |
| Selective (lit side lightened or removed) | Soft, volumetric | Fails on backgrounds it was not drawn for |
| None | Light, airy | Separates poorly; only works if color carries the shape (Mario at 32×32) |

Black suits lots of linework with little shading; heavy shading with little linework
should avoid it, or tone it to a dark color. **[agreed]**

## The contrast rule

"An outline should always increase contrast, and never decrease it": darker than the
object and the background behind it. Test at 1×: you should see the difference between
any two touching colors. If a lightened outline segment fades into the background, that
segment is wrong. **[one clear source, consistent with the others]**

## Selective outlining: two meanings **[contested]**

- **Lit-side sel-out** (Yu, the Lospec article, Pixnote): lighten or drop the outline
  where light hits, keep it dark where the sprite is in shadow or meets the background,
  and use shadow colors instead of black for inner segmentation.
- **Background-AA sel-out** (Pixel Joint thread): anti-alias the outline toward the
  background so the sprite reads on any background. The thread calls this "really a
  type of bad AA," not shading an outline by a light source, and says it works when the
  background is consistently dark.

Shared warning: a lightened outline is tied to the background. If the final background
is unknown (sprites composited onto arbitrary scenes), do not anti-alias or lighten the
outer edge; use a tinted dark outline and apply selective outlining to internal lines
only. State which meaning you are using when you recommend it.

## Internal lines

No background to worry about, so go as light as the form allows. One shade darker than
the section for a subtle line, darker for a heavier one; break a line up to imply a
thinner one; fade it where parts join; between two parts use the nearer part's color
(the darker object's when it is in shadow underneath). Outlines wider than one pixel
can accent the underside of a curve on mid-sized sprites (~100px tall); this is a
large-sprite technique. **[agreed for large sprites; no evidence for 16×32]**

## Jaggies and clusters

- Think in **clusters** of touching same-color pixels, not single pixels.
- A **jaggy** is a single pixel or short segment that breaks a line's consistency.
  Minimize, do not chase to zero.
- On a curve, segment lengths should grow or shrink steadily.
- Avoid anything one pixel thick (limbs, branches); it cannot be shaded and looks flimsy.
- **Banding** (two near-identical bands sitting side by side) pulls the eye to the seam.
  AA can itself band when its segments line up with the line they soften.

## Anti-aliasing

Put in-between colors at the corners of line segments; longer segments take longer AA
runs. Judge at 1×. Do not anti-alias the outside of a sprite whose background is
unknown. **[agreed]**

**[thin]** One low-quality guide adds: 1px mid-tone (2px maximum), long diagonals and
curves only, applied last, and not on sprites of 16px or less. The 16px threshold has no
second source; treat it as a hypothesis and look at the sprite.

## Sources

- Derek Yu, Pixel Art Tutorial: Basics, https://www.derekyu.com/makegames/pixelart.html (read via Wayback; the live site blocks scripted fetches)
- Derek Yu, Pixel Art: Common Mistakes, https://www.derekyu.com/makegames/pixelart2.html
- Lospec, Pixel Art Outlines Part 2: Using Color, https://lospec.com/articles/pixel-art-outlines-part-2-using-color/
- 2D Will Never Die, Line weight thickness in sprites, https://2dwillneverdie.com/tutorial/line-weight-thickness-in-sprites/
- Pixel Joint, The Pixel Art Tutorial (forum thread), https://pixeljoint.com/forum/forum_posts.asp?TID=11299
- Pixnote, Sel-Out Guide (low quality), https://pixnote.net/en/learn/outlines/
