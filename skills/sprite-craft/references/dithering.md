# Dithering

Contents: when to use it · when not to · rules of thumb · sources.

Dithering uses a pattern of two colors to imply a third value. **Fill dithering** gives a
whole form an extra color (1-bit and very low color counts). **Transitional dithering**
smooths a boundary or softens an edge (higher resolution, used sparingly).

## Default: don't, on characters

- "Rarely, if ever, necessary in modern contexts": limits are now self-imposed, and
  modern displays do not blur the pattern the way CRTs did.
- "I would not recommend dithering for most character sprites, especially those that will
  need to be animated." (One author's recommendation, not a measurement.)
- Costs: softer edges, disrupted forms, noise, and the illusion of texture nobody
  asked for. "Add texture" is called a cliché; it was not what dithering was for.

For shading a small sprite, use hard-edged ramp steps with sharp terminators
(see [sprite shading](../../sprite-shading/SKILL.md)).

## Where it earns its place

- Bridging two shades without adding a palette color; softening banding on a large area.
- Large single-color fields (a sky) or deliberately rough surfaces (dirt, grime).
- 1-bit art, which needs more resolution because patterns need adjacent pixels.

## Rules of thumb

- The more contrast between the blended colors, the more steps (and resolution) needed.
- A few patterns with intermediate colors beat many patterns with two colors.
- A dither that looks smooth at native size shows its pattern when scaled; decide for the
  display context.
- Keep two-color pattern fills inside one or two ramp steps so they read as shading,
  not as a texture map.

## Sources

- Pixel Parmesan, Dithering for Pixel Artists, https://pixelparmesan.com/blog/dithering-for-pixel-artists
- Derek Yu, Pixel Art Tutorial: Basics (dithering and banding), https://www.derekyu.com/makegames/pixelart.html
- Pixel Joint, The Pixel Art Tutorial (forum thread), https://pixeljoint.com/forum/forum_posts.asp?TID=11299
