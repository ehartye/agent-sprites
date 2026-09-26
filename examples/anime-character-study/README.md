# Anime RPG character study

Editable front/right idle studies of Reed, an original adventurer, as an adult
and a child. Both use 32×48 cells, chestnut hair, a short teal tunic and plum
outlines. Child proportions are authored separately, with a similarly sized
head, narrower shoulders and shorter body/limbs. Both stand on row 45.

Requires agent-sprites 0.22.0+ for the configured outline checks.
Use [sprite character](../../skills/sprite-character/SKILL.md) for the construction
workflow and [sprite setup](../../skills/sprite-setup/SKILL.md) to check the installed
managed runtime. From this example directory, with the checked absolute launcher:

```powershell
node $spriteLauncher build ./adult.json --json
if ($LASTEXITCODE -ne 0) { throw 'Adult build failed' }
node $spriteLauncher build ./child.json --json
if ($LASTEXITCODE -ne 0) { throw 'Child build failed' }
```

Copy these source files into your project before editing; omit `dist`.
Each build publishes its PNG, Aseprite atlas, editable project, emitted operations,
contact sheet, verification report and HTML preview under `dist/adult` or
`dist/child`. Each sheet has two authored cells: `idle_front` and `idle_right`.
Numeric frame entries and single-frame tag aliases may repeat them in the
contact sheet. These are standing poses, not animation frames.

`identity.json` supplies semantic color overrides and a `clasp` toggle. Change
`teal`, `tealLight` and `tealShade` together for a clothing palette variant;
`clasp: false` removes the neck ornament in both views, retaining the belt buckle.
If you change the `outline` color, also update `outlineColors` in both build
configs. Each build checks the final exported contour, including overlaid fills.
These are this generator's parameters, not built-in character recipe fields.
Hair shape and tunic geometry are authored in `generate.mjs`; arbitrary wardrobe
presets and body sliders are not implemented. The `geometry` map holds per-age
landmarks shared by both views. Named shapes and hair/face/clothing/limbs groups
remain editable; preserve lasting changes in source because builds replace output.

The study exercises the skill's proportions and front/profile construction.
It is an original interpretation with smaller eyes and fuller clothes than the
supplied anatomical references. It does not establish four-direction consistency,
walking quality, or a character-builder UI. No game loader integration is included.
