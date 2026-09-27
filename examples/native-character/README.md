# Native character templates

Editable adult and child templates use 16×32 cells, ten-pixel bare heads centered at x=3..12, and soles at y=29. Templates retain the eight reconstructed front/right source poses and semantic skin groups. These are reference-derived studies; the back view is an authored inference, not a traced reference or an approved animation.

From the repository root:

```powershell
node scripts/run-managed.js build examples/native-character/adult.build.json
node scripts/run-managed.js build examples/native-character/child.build.json
```

The generated projects in dist/adult and dist/child contain neutral front, right and back frames. Open their *.project.json files in the workbench to edit or copy them. Skin tones remain selectable. Regenerate from source to preserve repeatability; save interactive changes to a new source before rebuilding.

The back shares the front silhouette and ground, replaces all facial colors with a skin ramp, and adds rear skull, neck, shoulder, arm and heel shading. This is a three-direction standing study; movement and a left view remain unauthored. The original enlarged references stay outside this repository. See ../reference-grid/README.md for reconstruction and tone normalization.

## Dressed studies

Read [clothing and hair rules](RULES.md) before adding presets. Four examples combine adult/child anatomy with a short-haired jacket/trousers outfit or tied hair and a green dress. Each has front/right/back views.

```powershell
node scripts/run-managed.js build examples/native-character/adult-jacket.build.json
node scripts/run-managed.js build examples/native-character/adult-dress.build.json
node scripts/run-managed.js build examples/native-character/child-jacket.build.json
node scripts/run-managed.js build examples/native-character/child-dress.build.json
```

`dress-template.mjs` is the editable wardrobe source; `templates/*.project.json` are the editable body sources. Build configs and committed `preview/*.png` images all live here. Generated project JSON, PNG, atlas and preview HTML live under `dist/<preset>/`. Open a generated project with `node scripts/run-managed.js open <path-to-project.json>` to copy/edit it in the live workbench. No Downloads files are required to rebuild.

## Independent wigs and rear views

The generator arguments are `kind outfit tone wig`: adult/child, jacket/dress, a supported skin tone, and short/tied/none. Omitting wig keeps the original short-jacket or tied-dress default. Set the build config `args` to select a different combination; output names include nondefault wigs. Existing defaults remain unchanged.

```json
"args": ["adult", "jacket", "peach", "tied"]
```

Additional checked-in configs cover `adult-jacket-tied`, `adult-dress-short`, and their child equivalents. Each still contains front/right/back. To remove a wig, set its argument to `none` and rebuild: hidden body points remain intact. For live editing, copy the session first and edit the `hair` group; deleting that group alone does not necessarily delete its member shapes.

Separate `adult-wig-short`, `adult-wig-tied`, `child-wig-short`, and `child-wig-tied` configs use `generate-wig.mjs`. Their PNG sheets and atlases contain only hair, in the full 16×32 cells with the same bottom-center pivot and directions. Overlay matching cells on the corresponding body at (0,0). The hair source is shared with dressed examples; no duplicate geometry is maintained. Partial overlay edges deliberately meet the face/body and are not expected to be fully outlined in isolation; outline verification applies to the assembled dressed sprite.

All rear views use the derived back anatomy, full rear hair mass and rear garment shading. They omit eyes and frontal jacket openings. The tied wig includes a rear knot and a profile knot. Hair's bare-head width allowance and material rules are documented in RULES.md.
