---
name: sprite-verification
description: Verify pixel-art sprite sheets and atlases after export or conversion and before game integration. Use for sprite QA, bleed, wrong frames, misalignment, facing errors, or broken animation. Not for CSS/SVG animation or unrelated verification.
---

# Sprite Sheet Verification

A sheet is not verified until every frame has been *seen*. Frame counts,
"animations registered", and clean console output prove the loader parsed
something — not that the pixels are right. Run this before wiring any sheet
into a game, and again after any pipeline change (export settings, converter
edits, regeneration).

Scope checks to the asset: every sheet needs structural and visual inspection;
game integration adds loader checks; directional characters add facing checks;
humanoid walks add feet/hand gait measurements. A blinking robot, icon, or effect
does not need skin-tone detection or a walking gait. For CLI invocation use
[sprite editing](../sprite-editing/SKILL.md).

## Verification ladder

Run in order; each level catches what the previous one can't.

**1. Structural.** For a regular gapless grid, PNG dimensions must divide by
the declared cell size (`width % frameWidth === 0`, same for height), and source
cell count must equal `rows × cols`. Check metadata against the actual PNG.
For rectangle-based atlases, validate each `frame: {x,y,w,h}` against PNG bounds
instead of assuming an evenly divided grid. agent-sprites has one base atlas
entry per source cell, followed by contiguous group runs and named aliases;
repeated rectangles are intentional. Its atlas entry count can exceed source
cell count. Verify tag ranges, durations, and aliases separately.

**2. Per-frame contact sheet.** Render EVERY frame individually at 2–4×
nearest-neighbor zoom and inspect each one for:

- empty or near-empty cells
- neighbor bleed (pixels from the adjacent frame along a cell edge)
- wrong facing for the row it lives in
- partial figures (amputated heads/feet from bad slicing)
- character consistency (same costume, same proportions, every cell)

For agent-sprites projects, `sprite.js view --sheet --scale 4 --out qa.png` is
the contact sheet. For external or converted sheets, build one in-engine (below).

**3. Baseline alignment (grounded characters).** For walk cycles, verify contact
poses share the intended ground line; allow deliberate lift/bob between them.
Accidental baseline changes read as vertical bounce during walks — visible
in motion, invisible in single-frame checks unless you look for it. Bottom-
anchored slicing prevents this; verify it survived.

**4. In-engine contact sheet (when integrating).** Loading the PNG in an image viewer verifies
the file; only the engine verifies the *loader config*. Spawn one static
sprite per frame index from the actual loaded texture, one grid row per
animation row, and screenshot it (Phaser shown; same idea in any engine —
`FRAMES`, `COLS`, `cellW/cellH`, and `'sheetkey'` are yours to fill in):

```js
// debug-mode contact sheet: light band over dark band, one row per anim row
const g = scene.add.graphics().setDepth(8900);
g.fillStyle(0x847e87).fillRect(x0, y0, w, h / 2);       // light band
g.fillStyle(0x595652).fillRect(x0, y0 + h / 2, w, h / 2); // dark band
for (let f = 0; f < FRAMES; f++)
  scene.add.sprite(x0 + (f % COLS) * cellW + cellW / 2,
                   y0 + (Math.floor(f / COLS) + 1) * cellH, 'sheetkey', f)
    .setOrigin(0.5, 1).setDepth(9000).setScale(2);
```

**Always inspect on a neutral mid-tone backdrop.** Dark sprites on dark game
ground produce false alarms — two overlapping dark figures read as one broken
split sprite. Diagnose frames on grey, never on the map.

**5. Facing semantics (directional characters).** A frame being *clean* says nothing about which way it
*faces*. Classify **every frame individually** — never a row at a glance, and
**never from generation-prompt row labels; image models mirror rows routinely,
including single frames inside an otherwise-consistent row**. One mirrored
frame inside a walk cycle makes the character visibly oscillate left-right
mid-stride, and it survives batch inspection because the row "mostly" faces
one way. When eyeballing is ambiguous (impressionistic pixels, hats over
faces), **measure instead of squinting**: for humanoids with visible skin, compute
the horizontal centroid of skin-tone pixels in the head region relative to sprite center — a profile
face pushes it hard to one side, and the sign is the facing. Build each walk
from same-sign frames only; a 2-frame cycle of verified frames beats a 4-beat
cycle with one traitor. Then verify movement mapping by driving the character
with real input in each direction and sampling the live texture-frame + flip
state over a full second: every sample must come from the verified set with a
constant flip.

For robots, helmets, and effects, use relevant visible features rather than
assuming skin pixels exist. Skip facing checks for nondirectional animations.

**6. Animation coherence.** Confirm the frame list uses verified frames and
depicts the requested motion. For humanoid walks, check consistent facing and
a readable gait (step, pass, step, pass — repeated cells/frames are the normal
4-beat trick). "Reads as a gait" is measurable, and should be when a walk
looks stilted or arms look frozen: per frame, cluster the opaque pixels in the
bottom rows (feet: baseline y, cluster count, spread) and the skin pixels in
the torso band (hands: position). A real stride pair alternates feet-apart /
feet-together; hand positions should shift between stride frames. Two frames
with near-identical hand coordinates across a cycle mean the sheet contains no
arm swing — no frame selection fixes that; either regenerate the row or fake
body motion with a 1px display-origin bob on alternate frames. Pick walk
frames by these numbers, not by which row the generator put them in — the best
gait pair may span rows.
Play each animation and watch at least one full loop — `sprite.js view-anim
<group> --fps N --loops 3` for agent-sprites projects, in-engine otherwise.
When testing in a live game, reset game state first — a timer-spawned
encounter can freeze your test subject mid-verification and hand you stale
animation state that looks like a bug.

**Verify the running code is the code you shipped.** Browsers cache game
scripts: a session opened before a deploy silently verifies the previous
build even when the CDN already serves the new one. Before trusting any
live-site check, introspect the running code for a marker unique to the new
version (a function's `toString()`, a version constant) — if it's absent,
you're testing the wrong build.

## Collaborative casting (frame selection with the user)

For generated sheets, frame selection is a judgment call that detection should
*propose* and a human should *decide*. The server ships a casting UI for this:

1. Build a casting spec: pose **slots** (e.g. "side step — lead leg forward,
   opposite arm forward"), **candidates** (isolated, standardized,
   palette-corrected frame PNGs — every generation's frames are candidates),
   and **predictions** — the deterministic detectors' proposed assignment as
   the starting point.
2. `sprite.js cast start --file casting.json --out verdict.json` → tell the
   user the review URL. The UI shows every candidate per slot with the
   prediction starred; the user clicks to confirm, override, select a candidate **mirrored** (recorded as `id:flip` — "right pose, wrong side"), or mark **gap**.
3. Pass `generation` in the spec — `{ prompt, model, size, refs, cells }` —
   and the UI shows the prompt that produced the candidates, collapsed,
   above them. Reviewing frames without the prompt beside them makes
   "the model ignored the brief" and "the brief was wrong" look identical.
4. `sprite.js cast status --id <id>` polls the verdict. The verdict records
   predictions AND selections with an agreement score and per-slot
   disagreements — **use the variance to refine the detectors**: every
   override is labeled ground truth for what the measurement missed.
5. Slots marked gap become the generation list (reference-image generation of
   only the missing poses) — spend scales with what is actually missing.

## The usage map

End verification with an explicit frame-usage map: which frames each animation
consumes and which frames are **deliberately unused**. Unused-on-purpose is a
valid verdict (generated sheets often have one ambiguous row) — but it must be
recorded, or the next session will "fix" the animations by wiring the bad
frames in.

## Generated / converted sheets (extra checks)

- **Convert into standard cell dimensions**, bottom-center anchored with the
  scale fit-clamped — emergent bbox-sized cells change on every regeneration
  and silently invalidate the game's loader constants and body offsets. With
  padded standard cells, measure analysis bands relative to CONTENT bounds,
  never the cell.
- **Verify slicing used whitespace gutters, not even division.** Generated
  grids drift; confirm the slicer detected transparent gutter bands and that
  the band count matches the expected rows × cols.
- **Verify alpha is real** before trusting it: sample the corner pixels. A
  "transparent background" request can come back as a solid painted panel,
  which silently breaks alpha-mask slicing. **A model accepting a
  `background: transparent` parameter is not a guarantee it honours it** —
  the same request has returned true alpha from one model and a panelled
  opaque sheet from another. Detect alpha at conversion time and keep the
  chroma-key path configurable (key colour, distance threshold, and a force
  flag to ignore alpha entirely) rather than hardcoding one assumption.
- **Probe model limits from the API, not from memory.** Sending a deliberately
  invalid enum (`size`, `background`, `output_format`) returns a 400 listing
  the supported values and generates nothing, so capability differences
  between model versions cost nothing to establish.
- After palette quantization, re-inspect at game scale — quantization can
  merge the eye pixels into the face ramp or erase 1px details that read fine
  at source resolution.

## Sign-off checklist

- [ ] Source grid/atlas rectangles, tag ranges, aliases, and durations match expectations
- [ ] Every frame individually inspected on a neutral backdrop (not the map)
- [ ] Grounded characters: intended contact baselines verified
- [ ] When integrating: in-engine sheet matches file-level sheet (loader config verified)
- [ ] Directional characters: facing classified per frame, walks built from
      same-sign frames only, confirmed by driving each direction with live
      frame/flip sampling
- [ ] Every animation plays one clean loop from verified frames only
- [ ] Humanoid walks: feet alternate apart/together, hands move
      between stride frames (or a bob compensates for a swing-less sheet)
- [ ] Frame-usage map recorded, deliberately-unused frames listed

Run this before the wiring steps in the `game-integration` skill.
