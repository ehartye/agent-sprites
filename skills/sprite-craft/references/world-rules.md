# World rules: whole places, terrain and scenes

Contents: scope and confidence · one pixel scale · value ladder · one contact shadow ·
human kit over biome ground · ground recipe · solid-looking is solid · how to check.

The sprite rules in [SKILL.md](../SKILL.md) judge one asset. These judge a place:
the ground, the things standing on it and the characters walking through it. They come
from a review of one game (a ship, a greenhouse deck and two alien planets, 33 asset
groups, four independent reviewers). Treat the numbers as house starting points to test
against your own scene, not laws. Confidence: **[exact]** is read from code or counted
from pixels; **[review]** is the reviewers' judgment.

## 1. One pixel scale **[exact]**

Every sprite in a frame is shown at the same pixel size, and that size is an integer
multiple of its source art. Mixed scales (a 3x deck, 2x characters and 1x props, or a
1.5x building) read as pasted-together art, and a fractional scale cannot be an integer
anywhere else. Pick the characters' scale as the anchor and draw or scale everything to
it. Read the draw scales from code before judging by eye.

For generated environments (terrain, habitats, furniture) set `pixelScale: 2` in the recipe: it is redrawn on a half-size grid, so the atlas is drawn at the characters' 2x without changing any reported layout number.

## 2. A value ladder **[review]**

Separate the layers by contrast, in this order, so the eye reads them without outlines:

| Layer | Contrast against what is under it |
| ----- | --------------------------------- |
| Ground and its own flecks | about 1.2 to 1.5:1 |
| Paths and worn ground | at least 1.5:1 off the ground, never the same value |
| Props, plants, rocks | about 2 to 2.5:1 |
| Built structures | about 4:1 |

A path at 1.09:1 vanishes in grayscale; one at 1.34:1 reads as a canal. A ground that is
95% one color has no identity. Measure with the WCAG luminance ratio on exported colors.

## 3. One contact shadow **[exact]**

Everything that stands on the ground gets the same soft shadow, from one shared asset,
falling away from the light. Do not bake opaque shadow ellipses into sprites, and do not
mix hard navy ellipses with soft tinted ones in one scene. Nothing standing on the ground
should cast none.

## 4. A human kit over a biome ground **[review]**

Two layers. The human kit stays the same on every place: one outline family, the accent
colors, door and foundation conventions, and the hull trim (riveted seam, hazard
chevrons, vent or port). It applies to anything built: ships, stations, landers, camp
buildings, crates. Each biome has its own ground ramp, path ramp and flora. Trim never
goes on terrain or plants, and a shared kit never replaces a biome's ground. Outlines are
soft for nature and hard for human objects.

## 5. A ground recipe per biome **[review]**

A tile kit, not a bitmap: at least six variants chosen by a hash of the tile position
(never a diagonal formula, which bands), edges that match across variants, and an
autotiled path and transition set. Flecks and clusters carry identity; the fill alone
should not be more than about 80% of a tile. A baked one-off bitmap is fine for a single
hero scene, but a new place should not start there.

## 6. Solid-looking is solid **[exact]**

Anything that reads as a mass (a boulder, a cleft, a hull, a table) has collision, or is
drawn so clearly passable that nobody tries to stand on it. Keep props off path cells,
and keep labels off the spots the player walks to. Check with an overlay of obstacle
rectangles on a screenshot.

## How to check a place

1. List the draw scale of every layer from code. More than one value, or any fraction,
   is a finding.
2. Take a grayscale screenshot. Ground, path, prop and structure should be four
   separable steps.
3. Tabulate the shadow colors and outline darks in the palette table. One of each per
   family.
4. Tile each ground material 10x10 and look for diagonals and seams.
5. Overlay collision on the screenshot.

For a scored review of a place, use [sprite review](../../sprite-review/SKILL.md).
