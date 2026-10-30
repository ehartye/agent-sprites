# Scale and proportion: sizing a world so nothing is a mixel

Contents: scope and confidence · 1 fix the base unit · 2 mixels · 3 proportion table ·
4 tile size and grid · 5 detail density and redraws · 6 camera and zoom ·
7 pre-flight checklist · 8 measuring afterwards · 9 worked example · sources.

Read this before drawing a new place, building, prop or tile kit. [World rules](world-rules.md)
says "one pixel scale per frame"; this says how to choose the sizes so that rule holds the
first time. Confidence tags: **[exact]** is arithmetic or measurable from pixels; **[guide]**
is authored guidance to test in your scene; **[example]** is an illustrative contract rather
than a standard. This reference does not establish measured door or furniture ratios in shipped
games, so every ratio in section 3 is **[example]**.

## 1. Fix the base unit first **[exact]**

Three numbers, written down before any asset is drawn:

| Term | Meaning | Example contract |
| ---- | ------- | ----------------------- |
| Source pixel | One pixel of the authored sheet | the art pixel |
| Draw scale | Integer multiple the game draws a sheet at (`sprite(..., scale)`) | 2 for the primary cast |
| Camera zoom | Integer multiple applied to the whole frame | 3 or 4, selected for the intended viewport |

The **effective scale** of a layer is draw scale x camera zoom. Every layer in a frame must have the
same effective scale; the camera multiplies all layers alike, so the check reduces to *draw scales
must match*. A sheet cell size says nothing about scale: a prop can remain in a 96x96 cell
when its content is redrawn at a different source size. Read the draw scale from code (`propScale`, `CAST_SCALE`), not from the PNG.

**The anchor is the character.** The cast is the one asset the player stares at, the hardest to redraw
(many frames, many outfits) and the one whose proportions everything else is judged against. This
example uses **16x32 source pixels, drawn at 2x** (32x64 screen pixels before camera zoom).
Select one cast anchor for your project and make every world layer adopt its draw scale. Changing
that anchor affects the whole world; make the decision explicitly rather than per asset.

### State it as a contract in every brief

Adapt this example to the chosen anchor and put the contract at the top of the brief, before the first operation:

```text
Scale contract
  Anchor:        cast, 16x32 source px, draw scale 2, camera zoom 3-4 (effective 6-8)
  This asset:    <name>, source <w>x<h>, draw scale 2  -> screen footprint <w*2>x<h*2>
  Outline:       1 source px (= 2 screen px)  <- must equal the anchor's
  Exempt layers: <none | UI font at 3x on desktop: reason>
```

Derive the source size from the **screen footprint you want**, divided by the draw scale. A prop that
should read 42x74 screen pixels is authored at 21x37 and drawn at 2x. Decide the footprint from the
proportion table (section 3), not from how big the sheet cell happens to be.

If the brief gives no anchor, ask or read the game's code for the cast draw scale; do not assume 1x.

## 2. Mixels **[guide]**

A mixel is a pixel of a different apparent size from the rest of the picture, within one sprite
or across elements on a screen. Fractional zoom can also give source pixels uneven screen coverage.
Compare each layer's source grid and draw transform, then inspect the resulting screen pixels.

### The three ways they creep in **[exact]**

1. **Redrawn at a different source size.** An asset is made on a canvas twice or half the size of the
   anchor's, so one of its pixels covers a different area. Typical cause: a 96x96 cell filled with a
   42x74 prop at 1x beside 16x32 characters at 2x. Its pixels are half the size of the cast's.
2. **Drawn with a different draw scale.** Right source size, wrong `scale` argument, or the sheet is
   drawn at 1x because the helper defaults to 1. Cause: a new layer added to a scene without reading how the
   other layers are drawn. Check by grepping every `sprite(` / `drawImage` call that targets the frame.
3. **Scaled by a non-integer.** 1.5x, "fit to the tile", a CSS `width` set in percent, or a
   `devicePixelRatio` of 1.1 on a browser at 110% zoom. Source pixels land on 1 or 2 screen pixels
   unpredictably, so lines vary in thickness along their length.

Fourth, rarer: a generator or resize step that **resamples** (bilinear, bicubic) instead of
redrawing. It makes the art blurry as well as mis-sized (section 5).

### Why they read as wrong

Pixel art's contract is that every pixel is a deliberate choice of equal size. Two sizes in one frame
break two things at once: the eye reads the finer layer as a different medium (a photo, a vector, a
sticker) pasted on the coarser one, and the amount of detail per screen area jumps at the seam, so
the finer layer looks crowded and the coarser looks unfinished. Outline thickness shows it at a glance
(section 5). Note that the eye does not need to count pixels: a 4x6 pixel window at 1x beside a 2x
character reads "too sharp" at once.

### Narrow legitimate exceptions **[guide]**

| Exempt layer | Why it can differ | Mark it by |
| ------------ | ----------------- | ---------- |
| UI chrome and bitmap text | Read as an overlay, not as part of the world; the font has its own grid | `exempt: UI` in the contract; keep it on its own canvas, draw it at integer 2x or 3x |
| Maps and minimaps | Symbolic, not depicted | `exempt: map`; give it a frame so it reads as a diagram |
| Title and logo art | A poster, seen on a screen of its own | `exempt: title`; never composited into the play field |
| Small effects (hearts, dust, sparks, sweat marks) | Drawn smaller and scaled up so they separate from the characters (an intentional visual separation) | `exempt: fx`; use a clean 2x of a half-size sprite, never a fraction |

Each exemption lists its **reason** and its **scale** in the brief and in the review. Anything not on
the list fails. "It looks better bigger" is not a reason: it is a request to change the anchor.
Exempt art still follows integer scale and a single pixel size within itself.

## 3. Proportions in character heights **[example]**

Let **H** be the anchor's standing height, the full sprite from soles to top of the head.
For the example 16x32 anchor, **H = 32 source px = 64 screen px at 2x**. The table gives
screen sizes in H, with the source size for the 16x32 anchor in the last column. Real-world ratios
use a 1.75 m person; the "game" value is the cheated, chunkier size that reads better beside a
big-headed sprite. Cheat toward the **game** column; stay in the range.

| Thing | Real ratio | Game range (H) | At H=32 source px | Why it cheats |
| ----- | ---------- | -------------- | ----------------- | ------------- |
| Tile (floor grid unit) | n/a | 0.5 H | 16 px | Character is two tiles tall, one wide |
| Door opening, height | 1.15 H | 1.25 to 1.5 H | 40 to 48 high | Head and any hat clear the lintel with a visible gap |
| Door opening, width | 0.5 H | 0.6 to 0.9 H | 20 to 28 wide | A 16 px wide body walking through needs a 2 px margin per side at least |
| Window sill height | 0.5 H | 0.45 to 0.6 H | 14 to 19 | Keeps the sill above the character's waist |
| Ceiling / interior wall face | 1.4 H | 1.6 to 2.0 H | 52 to 64 | A 3/4 view hides the character's head behind the near wall otherwise |
| Bed length x width | 1.15 H x 0.55 H | 1.2 to 1.5 H x 0.7 to 0.9 H | 38 to 48 x 22 to 29 | Pillow, blanket and a sleeper all need visible pixels |
| Bench or chair seat height | 0.26 H | 0.3 to 0.4 H | 10 to 13 | Chunky legs read; seat at the character's knee |
| Bench length | 0.9 to 1.4 H | 1.2 to 2.0 H | 38 to 64 | Two characters fit on the long ones |
| Table height | 0.43 H | 0.4 to 0.5 H | 13 to 16 | Same |
| Counter / workbench height | 0.5 H | 0.5 to 0.6 H | 16 to 19 | Waist height; the character's torso shows above it |
| Crate / barrel / locker | 0.3 to 1.1 H | 0.4 to 1.0 H | 13 to 32 | Climbable-looking things are lower than the chest |
| Small vehicle (rover, cart) | 2.5 to 3 H long | 2.5 to 3.5 H long, 1.0 to 1.4 H high | 80 to 112 long | Driver's torso visible; wheels at least 8 px |
| Landing craft / shuttle | 5 to 15 H | 3 to 6 H wide | 96 to 192 | Must fit in the room; stylised small is expected |
| Tree, deciduous | 4 to 7 H | 2.5 to 4 H tall, canopy 1.5 to 3 H wide | 80 to 128 tall | Anything over 4 H leaves the frame at zoom 4 |
| Tree, fruit / shrub / sapling | 1 to 3 H | 0.8 to 2.0 H | 26 to 64 | Tends crops in reach |
| Small building (cabin, workshop) | 3 to 6 H wide, 2.5 H eaves | 3 to 5 H wide, 2.5 to 3.5 H wall | 96 to 160 wide | Door reads at 1.25 H, so the wall is at least 1.6 H higher |
| Landmark / hall | 8+ H | 5 to 8 H wide | 160 to 256 | Beyond 8 H it becomes backdrop, not an enterable thing |

**Stylization rules.** The anchor is chunky: head about 0.3 H (10 px of 32), body about 0.5 H,
hands 2 to 3 px, feet 3 to 4 px wide. These are example proportions; match the world to the
chosen character's chunkiness:

- Handled objects are **oversize**: a tool, cup or lamp is 1.2 to 1.5 times its true size relative to the
  hand, because a hand is 2 to 3 px and the object must stay readable beside it.
- Thickness is exaggerated: legs of tables, door frames, hull plates are at least 2 source px wide.
  A 1 px post beside a 4 px leg reads as a different art style.
- Detail that must survive 1x has a floor: windows at least 3x3 source px, a handle 1 px, a vent at
  least 4 px wide, a seam line 1 px but never closer than 4 px to another.

**Where to cheat for readability.**
1. Make the **door taller than real** (1.25 to 1.5 H). Players judge entrances by clearance.
2. Make **furniture the character interacts with** (bed, bench, console) a bit larger than the table
   says, and **decoration** (rugs, shelves) a bit smaller, so the interactive ones stand out.
3. Compress the **long dimensions** (hull length, tree height) before the short ones; a short thing
   cannot be squeezed without losing detail, a long thing can be cropped by the frame.
4. Keep **tops of tall things** inside the frame at the minimum zoom; if a tree leaves the frame it reads as a wall.

**Other character sizes.** Everything scales linearly with H, then re-check the floors above:

| Anchor | H | Tile | Notes |
| ------ | - | ---- | ----- |
| 16x16 | 16 | 8 or 16 | Floors dominate: doors of 24 px only, no window mullions, one outline family, no room for accessories on props |
| 16x32 (example) | 32 | 16 | Table above |
| 24x48 | 48 | 24 or 16 | Use 24 only if every tile in the kit is 24; else keep 16 and 3 tiles tall |
| 32x64 | 64 | 32 | Detail doubles; props gain mullions and wear marks; the same ratios hold |

Do not mix: a kit built for a 32 px character, used beside a 16x32, is a mixel in the section 2 sense.

## 4. Tile size and grid **[guide]**

Tile size affects art workload, visible content density and animation cost. Draw a representative
tile beside the chosen cast anchor, test it in a scene, and settle the grid before producing a kit.

**16 or 32.** The tile is half the anchor: a 16x32 character is one tile wide and two tall, so 16.
Choose 32 only if the anchor is 32x64. A tile larger than 0.5 H makes the character a fraction of one cell
and breaks door and furniture ratios; a tile smaller than 0.25 H makes the kit expensive for no gain.
At 16 on a 1280x720 viewport at native scale you see 80x45 tiles; at 2x draw and 3x zoom you see about 13x7.5,
so check the minimum frame at the smallest zoom (section 6).

**Align collision to the grid.**
- Obstacles are whole tiles, or half tiles (8 px) when the thing is thin (a rail, a pipe).
- The character's **foot box** is 12 to 16 px wide by 6 to 8 px tall, bottom-centred on the sprite's
  ground line; it is not the sprite rectangle. Use it to test collision and to depth-sort (sort by the
  foot line).
- A door opening has a collision gap of at least foot box + 4 px (20 px for 16 px feet), which fits
  the 20 to 28 px width in section 3.
- Draw a prop so its **base line sits on a tile boundary** and its footprint is a whole number of tiles
  wide; the sheet cell can be larger.

**Characters spanning tiles.** The sprite occupies 1 x 2 tiles: lower tile = feet, upper tile = head.
Walls and tall props that can hide the head carry a separate **front layer** (the top tile) so the
character walks behind them, as a roof edge or a lintel. Set the character's depth by the foot line,
not the sprite top.

**Avoid changing tile size mid-project:** each exception adds another asset and camera rule to
maintain. If a place needs finer detail, add detail inside the chosen grid before changing its size.

## 5. Detail density, line weight and redraws **[exact]**

**The same detail per screen area.** One source pixel at 2x covers 2x2 screen pixels. An asset drawn at
1x puts four times as many pixels in the same screen area as one drawn at 2x. Detail the 2x anchor cannot
afford (one-pixel windows, two-pixel rivets, dither) makes a 1x neighbor look busy and tiny. Rule of thumb:
within one frame, aim for about **one distinct detail per 6 to 8 screen pixels square on the scale of the anchor**;
the character's face has about one per 20 square pixels, which is the busiest anything in the scene should be.

**Outline thickness is the scale fingerprint.** Count the outline in screen pixels:
anchor outline = 1 source px x draw scale = **2 screen px** at 2x. Any asset whose outline is 1 or 3 screen
px is on a different scale, even when the sheet cell and the palette match. It is the fastest visual
check, and it is what the measurement in section 8 reads.

### Downscale a 1x asset to a 2x-compatible redraw

Redraw at **half the source size**; do not resample. Resampling (bilinear, bicubic, nearest by 0.5)
invents intermediate colors or drops rows at random, so lines break and the outline thickens in places.
For props that must retain their on-screen footprint:

1. Fix the target **screen footprint** (same as the old drawn size, so ground rows and anchors do not move).
2. Halve it for the new source size (a 42x74 prop becomes about 21x37).
3. Keep the **silhouette, palette and light direction**; rebuild shape by shape, not by shrinking the old bitmap.
4. Keep the outline at 1 source px. Merge shading ramps (4 steps become 2 or 3); drop details smaller than 2x2 source px.
5. Keep identity pixels (the beacon's lamp, the console's screen) and cut the rest.
6. Re-anchor: base line, contact shadow footprint, hit box in screen pixels unchanged.
7. Draw with `scale: 2` and re-measure.

### Upgrade rather than downgrade

Going to a **finer** grid is cheaper than it sounds and gives better results than going coarser:
nearest-neighbour doubling is an exact 2x copy of the old art (same silhouette, no new colors), which
is a legal intermediate state; then add detail at the finer grid. Downgrading (halving) always costs
detail and needs the redraw above. So when two layers disagree and the anchor is not yet fixed, prefer
raising the coarse layer to the finer grid and adding detail, rather than shrinking the fine layer.
When the cast anchor is already fixed, that choice is made for you; the only direction is
to bring the layer to the anchor, by redraw if finer and by upscale-then-detail if coarser.

Never mix the two states in one asset: a 2x nearest copy with new 1x-pixel details on top is a mixel.

## 6. Camera and zoom **[guide]**

- **Integer zoom only**, applied to the whole frame (the canvas, input hit-testing, labels, UI that is
  part of the frame). Fractional zoom can give source pixels uneven screen coverage.
  Use the inverse of the same transform for pointer input.
- **Choose the base resolution so common screens divide it.** 640x360 reaches 720p at 2x, 1080p at 3x,
  1440p at 4x, 4K at 6x; 320x180 gives 6x, 8x and 12x at 1080p, 1440p and 4K respectively.
- **Set a minimum visible world area**, in tiles, and derive the lowest zoom from it. For example:
  at least 13x7 tiles visible means the lowest zoom of a 16 px tile at 2x draw is 3.
- **Odd viewport sizes.** Compute in **device** pixels: `zoom = floor(min(deviceW / baseW, deviceH / baseH))`,
  then center the frame and fill the margin with the background; never stretch to fill. If
  `devicePixelRatio` is not an integer (browser at 110%), either lock the canvas size to integer
  device pixels and accept margins, or accept that those windows show uneven pixels; do not hide it by
  smoothing. On a phone, show a smaller part of the world and **follow the player**.
- **Zoom changes the field of view, never the art.** The art does not re-draw at different zooms. If
  something is unreadable at the lowest zoom, it is too small for the contract, not a camera problem.
- The camera follows on **integer positions** (round the camera, not the sprites) or the layers jitter against each other.

## 7. Pre-flight checklist

Answer before drawing; each has a measurement. Any "no" is fixed before the first operation.

1. **Is the anchor named, with its source size, draw scale and zoom range?** Measure: read `CAST_SCALE`
   (or equivalent) from code; write it in the brief.
2. **Is this asset's draw scale equal to the anchor's?** Measure: grep the `sprite(` call that draws it; value must match.
3. **Is the source size = target screen footprint / draw scale, and is it a whole number?** Measure: divide;
   a remainder means a non-integer scale.
4. **Is every proportion inside the section 3 range for H?** Measure: ratio of each dimension to H;
   list any outside the range with the reason.
5. **Is the outline 1 source px (= the anchor's screen thickness)?** Measure: count outline pixels on a straight edge.
6. **Does every feature meet the floor (window 3x3, handle 1 px, post 2 px)?** Measure: smallest feature in pixels on a 6x crop.
7. **Do footprint, base line and collision land on the grid (tile, half tile)?** Measure: footprint width mod 16 = 0 (or 8).
8. **Is every exempt layer listed with a reason and its own integer scale?** Measure: the contract's
   exempt list vs. the draw calls in the scene; nothing unlisted differs.

## 8. Measuring afterwards

Take a screenshot at the shipped zoom (a real frame, not the sheet), crop each layer on a flat area with
an edge, and ask for the **on-screen pixel step**: the largest integer k such that almost all colour runs
are multiples of k. Every layer should return the same k (anchor draw scale x camera zoom, e.g. 6 at 2x
and zoom 3). A different k, or a k of 1 with a scatter of runs (2, 3, 4, 5...), means a mixel or a fractional scale.
Outline thickness is the most common run length at the edges of dark pixels, so compare that number too.

```sh
node "<plugin-root>/scripts/run-managed.js" pixel-step shot.png --crop 4,4,20,20
# Pixel step: 2
# Coverage: 0.9
# Runs (length x count): 2 x 48, 12 x 24, 16 x 8
```

`pixel-step <png> [--crop x0,y0,x1,y1] [--coverage 0.9] [--json]` counts same-colour runs along rows
and columns (transparent pixels break a run; crop x1 and y1 are exclusive) and returns the largest
step k, searched down from 12, for which at least the coverage share of runs are multiples of k.

Calibrate on a sheet crop: a source sheet reports 1 (no common factor above 1 is expected); the same
crop nearest-doubled reports 2; scaled 1.5x it reports 1 with runs of 2, 3 and 1 mixed, which is the
fingerprint of a fractional scale. Run it on screenshots with the UI hidden, and use crops that contain
no alpha-blended shadow or glow, since soft edges add runs of 1. Report the numbers beside the section 7 list.

## 9. Worked example: matching props to a cast anchor

This illustrative example uses a 16x32 cast drawn at 2x. Props initially drawn at 1x have
smaller apparent pixels even when their screen footprints fit the scene. Redraw their contents
at about half the source size, then draw them at 2x to match the cast.

| Prop | Before: source / drawn | After: source / drawn | Screen size after redraw |
| ---- | ---------------------- | --------------------- | ------------------------ |
| Beacon | 42 x 74 at 1x | 21 x 37 at 2x | 42 x 74, unchanged |
| Console | 48 x 53 at 1x | 24 x 27 at 2x | 48 x 54, one pixel taller to retain whole source pixels |
| Small shuttle | 82 x 78 at 1x | 41 x 39 at 2x | 82 x 78, unchanged |

Apply the contract consistently:

- Keep one central prop-scale table with a value of 2 for this example. All prop draw calls
  read that value so later additions inherit the same rule.
- Retain screen-space base lines, anchors, contact-shadow footprints and collision boxes
  wherever the integer redraw permits it. Record any rounding adjustment, such as the console's height.
- Rebuild shapes with the same silhouette, palette and light direction. Check content bounding
  boxes, ground contact, isolated pixels and distinguishing silhouette features across prop variants.
  Use the integrating project's real fixtures and thresholds for those checks.
- A sheet cell can stay 96x96 throughout. Inspect the content bounding box and draw call;
  section 8's screenshot measurement checks the resulting apparent pixel size.

Write the desired footprint in screen pixels before deriving source dimensions. Outline thickness
can expose a mismatch that palette and cell size hide. Apply the same contract to every new world layer.

## Further reading

These public articles offer background on pixel scale, render resolution and tile-size choices:

- [Yari, About Mixels](https://yari-pixels.github.io/Articles/mixels.html)
- [notkey.studio, render resolution](https://notkey.studio/en/tutorials/choosing-the-right-render-resolution-for-a-pixel-art-game/)
- [FreeGameSprites, tile size](https://freegamesprites.com/en/news/tile-size-2d-game-pixel-art-guide)

The example contract and proportion table above are authored starting points. Validate them against
your actual cast, scene and viewport; they are not a measured survey of shipped games.
