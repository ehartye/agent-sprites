# Four-beat courier walk

Copy this folder's source files into your game's asset source directory, excluding
any existing generated `dist` directory. Run the plugin's
managed launcher from anywhere:

```sh
node "<plugin-root>/scripts/run-managed.js" build "<game>/asset-src/courier/sprite-project.json" --json
```

Run the sprite-setup skill first if the matching managed CLI is missing or stale.
The source is `character.json` plus `generate.mjs`; generated files live in `dist`.
Open `dist/preview.html` and inspect `dist/contact.png` before game integration.
The atlas exposes a `walk` tag and four named frame aliases. The editable
`courier.project.json` retains shape names, anatomical limb groups and timing.

| Parameter | Range / behavior |
| --- | --- |
| `name` | Filename-safe letters, numbers, hyphens and underscores |
| `stride` | Integer 2–5; contact feet offset this many pixels from the center |
| `bob` | 0 or 1; body rises by this amount on passing poses |
| `fps` | 4–12; default 8 gives a half-second four-frame cycle |
| `colors` | Optional six-digit hex overrides; see swatch names in `generate.mjs` |

Keep `jacket`, `jacketLight`, and `jacketShade` distinct when recoloring. Near/far
trousers and skin use separate colors to keep overlapping limbs legible. Custom
colors are rendered directly; this recipe does not apply palette-ramp shading.

The pose sequence is `right_contact`, `right_support`, `left_contact`,
`left_support`. The character faces screen-right; the anatomical **right** side
is nearest the viewer throughout. `right_*` and `left_*` names never exchange
identity when their screen positions cross. The yellow `right_wrist_band`
demonstrates an accessory that stays attached to the same hand. Do not rename
limbs based on screen coordinates. For left-facing art with asymmetric gear,
author corresponding poses and depth order: simply mirroring swaps visible
laterality. Whole-sprite mirroring is suitable only when that distinction does not matter.

Both feet reach y=29 on contact poses. On passing poses, one foot stays at y=29
while the other rises three pixels. The pivot is (11,29). At the default stride,
the supporting foot moves back four pixels per frame; matching game movement at
roughly `stride * fps` pixels/second reduces sliding (adjust visually for your game).
Arm swing opposes leg swing; bob is limited to one pixel. Every part remains a
named rectangle or polygon in the captured `operations.json`.

This is a compact **24×32**, four-pose side-view starting point, not a general rig.
Use nearest-neighbor display scaling for larger presentation. Different anatomy,
oblique views, weapons, or more detailed motion need explicit new keyed poses;
do not rotate thin pixel limbs to fake them. Check contact-sheet silhouettes and
watch full loops after changing parameters. Rebuild overwrites generated edits:
change source parameters/poses, or copy the project outside `dist` for a manual variant.
