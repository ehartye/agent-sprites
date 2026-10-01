# Rubric: ships, vehicles and establishing shots

Contents: scope and confidence · dimensions · numbers worth testing · pull-back reveal ·
instruments · gates.

Use this with [sprite review](../SKILL.md) for craft that moves people or cargo: a ship
exterior, a lander, a rover, a hull seen from outside and its rooms seen from inside, and
the shots that introduce them. Tags: **[exact]** read from code or counted from pixels,
**[review]** the judgment of an independent reviewer on a real game, **[thin]** one source or
an inference.

## Dimensions

| Dimension | Ask | Evidence |
| --------- | --- | -------- |
| Silhouette and heading | Filled flat, is each vehicle class recognizable, and can you tell nose from tail? | silhouette lineup |
| Scale against people | Do doors, ladders and hatches match the native characters, and do parts imply a believable size? | crop beside a character |
| Function | Can you say what it is for (engines, cargo, sensors, glass) from one glance? | 1x view |
| View consistency | Do the exterior, the cutaway and the interior agree on where decks, windows and doors are? | exterior and room side by side |
| Value and light | One light from the top left on the hull; engines and windows may glow as lit exceptions | grayscale |
| Family | Do vehicles share outline, trim and palette, with a different silhouette each? | lineup, palette table |
| State | Can damaged, repaired, docked, landed and thrusting be told apart, and does the change read? | state strip |
| Space readability | Does it separate from the starfield and a planet with a rim or value step? | frame on each backdrop |

## Numbers worth testing

- Two hulls from the same fleet should differ in silhouette by more than about 15%
  (overlap under about 85%); a review found crew and bridge hulls 94% identical, and a fix
  reached 84% **[review]**.
- Doors and hatches that characters use should be sized to the native cast; the farm modules
  keep a 48 px open recess for 16x32 characters **[exact]**.
- The hull's palette and outline are one family with the rooms inside it. The ship uses
  `#283044`, the farm deck `#344751`; say which family a vehicle belongs to **[exact]**.
- A glowing part (engine, window, console) is lit regardless of the global light; keep the
  glow to few pixels so it stays an exception **[thin]**.
- A three-state progression (broken, lined, running) is a strength worth keeping when a
  vehicle part repairs during the story **[review]**.
- Show the hull against both space and a planet limb; a dark hull on dark space needs a rim
  or a value step **[thin]**.

## The pull-back reveal

An opening that pans out to show a ship in space is judged as an establishing shot:

1. **Scale first.** Start close on something the player knows (a window, a hatch, a figure),
   so the pull-back has something to grow from.
2. **Identity.** At the end, the whole silhouette fits the frame with clear space and reads
   as the ship without a label.
3. **Function.** The farm glass, engines and docking points are visible, not hidden by glow.
4. **Context.** At least three parallax layers (far stars, near stars or dust, a planet or
   station) move at different speeds, in one consistent direction.
5. **Integer pixels.** Camera steps on whole screen pixels at one scale; no sub-pixel
   shimmer, and layers use whole-pixel offsets.
6. **Timing.** One idea per beat; hold the final frame at least a second before the title;
   any key or tap skips; a reduced-motion version shows the final frame.
7. **Complete at rest.** The final frame, paused, is a finished composition.

## Instruments

1. A lineup of every vehicle's silhouette fill, with pairwise overlap.
2. A crop of each hatch and door beside the native character.
3. The exterior, cutaway and interior at the same deck level, side by side.
4. Frames of the reveal at start, middle and end; per-layer pixel offset between frames.
5. A grayscale pass of each backdrop.

## Gates

Fractional scale, a door too small for the native cast, a hull that cannot be told from
another class in a silhouette fill, or an opening that cannot be skipped, fails the asset
regardless of average.
