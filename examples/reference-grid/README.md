# Reconstruct an enlarged reference grid

This narrowly scoped example reconstructs an opaque 4-column, 2-row character
reference into **16×32 cells with 10-pixel-wide heads**. It is an editable
reconstruction, not a pixel-exact trace or automatic grid detector. Supply your
own PNG/WebP; no reference artwork is bundled.

Measure the enlarged logical pixel spacing and grid origin first. Whole-image
resizing includes screenshot margins and can change head widths. Each source
block is sampled by its most frequent color. Background-like colors are removed
only when connected to the cell exterior, preserving enclosed pale skin. The
four-neighbor silhouette boundary is recolored in place to keep the outline
continuous without growing the head. Facial colors remain sampled from the source.

Create a local `reference.json`:

```json
{
  "source": "reference.png",
  "name": "native-study",
  "background": "#f0f0f0",
  "outline": "#673649",
  "grid": { "x": 0, "y": 0, "step": 8, "offsetY": 0 },
  "head": { "top": [2, 2, 2, 2] }
}
```

`source` resolves relative to this config. Grid origin and step are source-image
pixels; `offsetY` shifts the reconstructed art in native pixels. `head.top` gives
the head crown in each column before that shift, shared by both rows. The first
ten rows from each crown must measure exactly ten occupied pixels across.
This example assumes front poses in row one and right-facing poses in row two.
Other layouts need explicit adaptation.

Run `node <repo>/examples/reference-grid/generate.mjs reference.json operations.json`
using the installed repository dependencies.
The output file must be new. Then use the managed agent-sprites `build` command
with this local build config:

```json
{
  "version": 1,
  "ops": "operations.json",
  "output": "dist",
  "scale": 8,
  "outlineColors": ["#673649"]
}
```

Inspect both the native PNG and enlarged preview. The named point shapes are
grouped as head/body for later edits. Frame aliases appear alongside numeric
frames in the atlas/contact sheet; they share the same eight physical cells.
Poses are not declared a walk animation. Color compression artifacts, enclosed
background pockets and per-frame grid drift still need visual review. Preserve
the original full-resolution reference separately.

## Selectable skin tones

Set `"skinTone": "peach"` in the reference config to remove the reference's
seven diagonal tone demonstrations while preserving their shading roles.
Available ramps: `rose`, `peach`, `apricot`, `terracotta`, `umber`, `plum`,
`espresso`. The generator recognizes colors from these specific references,
including small compression deviations; this is not a general skin detector.
Eye colors remain separate. Unknown colors are left unchanged for visual review.

The output contains `skin-highlight`, `skin-base`, `skin-shadow`, and
`skin-outline` shape groups in each cell. In the live workbench, **All palettes >
Skin tone** applies a ramp across every pose. Alternatively run managed
`skin-tone umber`. These groups survive save, import and session copies; added
skin shapes must join the appropriate group. Ordinary drawing colors do not
change the chosen tone. Undo remains per cell, one step for its whole ramp.

Use the selected tone's outline color in build verification. Changing a live
study does not update the source config; update `skinTone` before rebuilding.
