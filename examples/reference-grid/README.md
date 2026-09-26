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

Run `node generate.mjs reference.json operations.json` from the copied example.
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
