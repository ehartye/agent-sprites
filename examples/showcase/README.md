# Four little places

Four hand-authored pixel dioramas built entirely from editable, named native
agent-sprites shapes. No flattened image is imported into the projects.

| Scene | Composition | Independent motion |
| --- | --- | --- |
| `night-station` | A coral umbrella between the last train and a lit vending machine | Rain, puddle rings, wet neon reflections, signal lamp |
| `glasshouse` | Ivory glass ribs, a fig tree and a little stone fountain | Fountain droplets, water glints, butterfly, sunlit motes |
| `ember-workshop` | A resting smith, deep stone forge and moonlit workbench | Flame tongues, rising sparks, kettle steam, reflected hearth light |
| `dusk-shrine` | A floating island, monumental gate and flowering cherry | Waterfall streaks, spray, paper lanterns, windblown petals |

Each source frame is **192 × 128 art pixels**. The small figures anchor the scale
at roughly 10 × 24 pixels. Display at an integer multiple with nearest-neighbor
sampling; the exported GIF and poster use 2×. The 32 frames play at 10 fps for a
3.2-second loop. The `ambience` atlas tag is the authoritative playback sequence.
Atlas exports also retain grid frames and named aliases, so do not play the
entire `frames` array as one animation.

The common style uses large depth bands, selective local-color outlines,
hand-placed material highlights and a restrained palette per scene. Saturated
colors mark the focal objects. Quiet sky and wall areas balance the small props.
The lighting is authored into the geometry so it remains clear at native scale.
Most motion uses periodic functions whose periods divide 32; falling effects
wrap outside their visible run. Frame 32 repeats frame 0 without an extra hold.

## Rebuild

First run the version sync check for the plugin's managed runtime. From this
repository, after setup:

```powershell
$env:SPRITE_PORT = '14794'
node scripts/setup.js --check --json
node examples/showcase/rebuild.mjs
```

For a copy outside this repository, pass the absolute path to the matching
plugin's checked launcher:

```text
node rebuild.mjs --launcher <plugin-root>/scripts/run-managed.js
```

An optional list of slugs rebuilds a selection. The driver invokes the actual
managed `build` and `atlas-proof` commands. Both work in isolated state and leave
the live editor database alone. A failed command stops publication for that
scene. The `.build/` and `.reviews/` directories are local build/review artifacts;
each proof gets a new review directory.

`generate.mjs` loads the selected scene parameters and dispatches to the native
geometry in `scenes.mjs`. Reusable mark, plant and planter helpers live in
`drawing.mjs`. Each build declares these dependencies in `inputs`. The base
scenery is drawn once, copied to the other cells, then independent animation
shapes are added. Names such as `umbrella_lit_panel`, `fig_leaf_vein`,
`arch_stone_joint` and `paper_lantern_rib` survive in every editable project.

## Published artifacts and review

The driver publishes a portable selection to `site/assets/scenes/<slug>/`:

- `scene.gif` and `poster.png`: the checked animation and its first frame at 2×.
- `sheet.png`, `atlas.json`, `project.json`: native sprite sheet, Aseprite atlas
  and fully editable geometry.
- `contact.png`: the complete 32-frame proof, with timing labels.
- `proof.json`: timing, decoded GIF color comparison, relative file references
  and SHA-256 measurements of the published bytes.

Raw build ownership receipts and machine-local source paths remain in the
ignored build/review directories. The published atlas points to `sheet.png`.
The proof measures 32 encoded frames, 100 ms delays, infinite repeat, a 3200 ms
requested/encoded duration, zero drift and exact decoded colors for all four
scenes. The art uses fewer than the GIF palette limit of 256 colors.

Review the poster at native scale and an integer enlargement, inspect every
tile in `contact.png`, then play the `ambience` tag or GIF through its seam.
The proof establishes timing and pixel preservation; visual composition and
motion still deserve a human review.
