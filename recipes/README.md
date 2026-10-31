# Recipes

Shareable `batch` files that demonstrate the per-frame parameterization workflow.

## farm-showcase

High-detail showcase (32×48 character + 128×96 environment, db-32) built with
the generator-script pattern — `gen-hero.mjs` and `gen-farm.mjs` emit build
JSONs replayed by a single `batch` call each, led by `clear` for idempotent
iteration. The worked example behind
`skills/sprite-editing/references/high-detail.md`; design notes in `DESIGN.md`.

## reference-conversion

A documented recipe, not a command: convert a supplied reference to a native grid,
then refuse a result with more colours than the budget, a fractional grid or an
unstated alpha policy before tracing it. See `reference-conversion/README.md`.

## bounce-basketball

An 8-frame bouncing-ball animation, db-32 palette, 64px cells.

```
# 1. Create the project and seed frame 0
sprite new bounce-ball --size 64 --rows 1 --cols 8 --palette db-32
sprite draw ellipse --cell 0,0 --cx 32 --cy 48 --rx 20 --ry 12 --color "#df7126" --name ball --filled true

# 2. Fan out the base cell into all 8 frames (atomic)
sprite clone-cell --from 0,0 --to "0,1 0,2 0,3 0,4 0,5 0,6 0,7"

# 3. Replay the recipe once per frame — resize + sphere-shade
sprite batch recipes/bounce-basketball.json --vars-file recipes/bounce-basketball-frames.json
```

The recipe replaces ~40 per-frame CLI calls (5-tier lighting × 8 frames) with a single call.
