# Atlas composition proof

Use this to check a base animation with clothing, equipment, particles or other
exported overlay tracks. Export each source first. Run the matching managed
launcher resolved from the loaded skill:

```text
node "<plugin-root>/scripts/run-managed.js" atlas-proof proof.json --out review-01 --json
```

`review-01` must not exist, and its parent must exist. Outputs never replace a
previous review or a source file. This command works offline without opening or
changing a session. The browser exposes the same service under Tools → Preview
base and overlay atlases, from the server's localhost page.

```json
{
  "version": 1,
  "canvas": { "w": 32, "h": 48 },
  "scale": 4,
  "tracks": [
    { "name": "body", "atlas": "body.atlas.json", "tag": "walk", "x": 16, "y": 47, "anchor": "bottom-center" },
    { "name": "coat", "atlas": "coat.atlas.json", "tag": "walk", "x": 16, "y": 47, "anchor": "bottom-center" }
  ]
}
```

Paths to atlases resolve relative to the proof JSON; each PNG resolves relative
to its atlas. Tracks paint in list order. Select exactly one `tag` or `frames`
array per track. Explicit frames accept exact names or zero-based indices and
preserve repeated holds. Tags honor forward, reverse, pingpong and
pingpong_reverse. Every selected atlas duration must be a positive integer in ms.

Position `x,y` is where the chosen anchor lands, before scale. Anchors use the
original source size after restoring trim offsets and clockwise-packed rotation:
`top-left` (default), `center`, `top-center`, `bottom-center`, `bottom-left`,
`bottom-right`, `pivot`, or `{ "x": 4, "y": 7 }`. Bottom anchors use `h-1`,
right anchors `w-1`, and center uses integer floors. A pivot must exist in the
atlas slice for that frame; a fractional pivot requires choosing an explicit
whole-pixel anchor instead. Choose a canvas large enough for the intended motion;
pixels outside it are clipped.

Each track loops by default. Set its `loop` to `false` to play once and hold its
last frame. A single selected frame stays static; repeated selections retain
their explicit holds. Output loops when all animated tracks loop; otherwise it
plays once. A top level `loop` changes only the output repeat policy. The proof
includes the complete least common multiple of the looping track periods,
repeated through the first joint boundary at or after all one-shot tracks finish.
With only one-shots it ends at the longest duration. Excessive periods or step
counts fail; frames are never silently capped.

GIF delays are whole 10 ms units. The encoder rounds cumulative boundaries, so
125 ms steps alternate 130/120 ms without accumulating one rounding error per
frame. An interval that rounds to zero fails. The report records requested and
encoded timing. GIF supports binary transparency and a limited palette: partial
alpha fails unless the config supplies an opaque `"matte": "#112233"`. Matte
compositing is explicit. PNG frames retain canonical composite colors; the report
measures GIF palette changes and maximum channel error after decoding the GIF.

Limits: 16 tracks, 4096 selected/timeline steps, 60 seconds, logical canvas and
input PNG sides up to 2048, integer scale 1–8, and a combined 64 million pixel
work budget. The budget includes decoded inputs, track compositing, scaled output,
GIF verification and the full contact sheet. Reduce canvas, scale or track count
when the complete proof exceeds it.

Review `proof.gif`, every PNG in `frames/`, the complete `contact.png` and
`proof.json`. Confirm alignment, clipping, transparency, motion, requested/encoded
timing and quantization measurements. The service verifies decoded GIF frame
count, delays, loop behavior and transparency before publishing, and rechecks
source hashes. A successful report establishes those checks; judge the artwork
visually as well.
