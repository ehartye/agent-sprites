# Courier walk

Copy this folder's source files into your game's asset source directory, excluding
any existing generated `dist` directory. Run the plugin's
managed launcher from anywhere:

```sh
node "<plugin-root>/scripts/run-managed.js" build "<game>/asset-src/courier/sprite-project.json" --json
```

Run the sprite-setup skill first if the matching managed CLI is missing or stale.
The source is `character.json` plus `generate.mjs`; generated files live in `dist`.
Open `dist/preview.html` and inspect `dist/contact.png` before game integration.
The atlas exposes a `walk` tag and eight named frame aliases. The editable
`courier.project.json` retains shape names, anatomical limb groups and timing.

| Parameter | Range / behavior |
| --- | --- |
| `name` | Filename-safe letters, numbers, hyphens and underscores |
| `stride` | Integer 2–5; leading and trailing ankles offset this many pixels from the pivot at contact |
| `bob` | 0 or 1; body rises by this amount on passing poses |
| `fps` | 4–12; two poses per beat, default 8 beats/second gives eight poses in half a second |
| `colors` | Optional six-digit hex overrides; see swatch names in `generate.mjs` |

Keep `jacket`, `jacketLight`, and `jacketShade` distinct when recoloring. Near/far
trousers and skin use separate colors to keep overlapping limbs legible. Custom
colors are rendered directly; this recipe does not apply palette-ramp shading.

Play the atlas's `walk` tag in order: `right_contact`, `right_load`,
`right_support`, `right_push`, then the same four phases on the left. The four
original contact/support aliases still occupy cells 0–3; loading and push-off
occupy cells 4–7. Playback interleaves those cells. The character faces
screen-right; the anatomical **right** side
is nearest the viewer throughout. `right_*` and `left_*` names never exchange
identity when their screen positions cross. The yellow `right_wrist_band`
demonstrates an accessory that stays attached to the same hand. Do not rename
limbs based on screen coordinates. For left-facing art with asymmetric gear,
author corresponding poses and depth order: simply mirroring swaps visible
laterality. Whole-sprite mirroring is suitable only when that distinction does not matter.

At heel strike the leading boot meets y=29 on its heel; the trailing boot
pivots on its toe. The forward knee flexes as the sole rolls flat. During
single support the other knee leads its ankle, the boot clears the floor, and
the leg unfolds for the next strike. The pivot stays at (11,29). The stance ankle
travels from `11 + stride` to `11 - stride` over a half-cycle. Match rightward
travel to `stride * fps` pixels/second (32 at defaults) for a planted gait;
odd strides alternate pixel distances on the added breakdowns. Exported frames
split the old beat duration in two: 62 and 63 ms at the default setting.

This is a compact **24×32** side-view starting point.
Use nearest-neighbor display scaling for larger presentation. Different anatomy,
oblique views, weapons, or more detailed motion need explicit new keyed poses;
do not rotate thin pixel limbs to fake them. Check contact-sheet silhouettes and
watch full loops after changing parameters. Rebuild overwrites generated edits:
change source parameters/poses, or copy the project outside `dist` for a manual variant.
