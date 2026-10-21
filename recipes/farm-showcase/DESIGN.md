# High-detail farm showcase

This reproducible sample contains a 32×48 farm character and a 128×96 farm scene,
both in the db-32 palette. `gen-hero.mjs` and `gen-farm.mjs` emit the checked-in
operation batches. Example exports live under `assets/claude-sprites/farm-character`
and `assets/claude-sprites/farm-scene`.

## Art brief

- Use desaturated olive, rust and dust for large forms, with a dusk key light from
  the upper left and sparse green rim light from the right.
- Build the character with roughly five-head proportions, selective outlines in
  dark local colors, three- or four-step material ramps, and hand-placed seam lights.
- Build the environment with per-plank and per-shingle value variation, trim
  accents, restrained distant outlines and checkerboard-dithered ground shadows.
- Reserve high saturation for green (`#99e550`) and ember (`#df7126`) accents.
- Keep operations named and grouped. Begin each batch with `clear` so replay is
  idempotent; inspect both native pixels and an integer-enlarged preview.

The sample demonstrates palette control, material construction and lighting.
Its exported pixels and editable operation batches are the shared reference.
