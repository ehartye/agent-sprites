# Native character templates

These Stardew-style 16×32 characters are the **primary** agent-sprites character system: new characters and character features start here. The 40×56 [`character` recipe](../character-cast/README.md) remains maintained for joint data, held gear and report-driven walking.

Editable adult and child templates use 16×32 cells, ten-pixel bare heads centered at x=3..12, and soles at y=29. **Walking poses are present:** each source template retains four front and four right poses with semantic skin groups. The builder exports four-direction walk cycles, including reflected left poses and authored rear shading. These are reference-derived studies; rear art is an inference, not a traced reference.

From the repository root:

```powershell
node scripts/run-managed.js build examples/native-character/adult.build.json
node scripts/run-managed.js build examples/native-character/child.build.json
```

The generated projects in `dist/adult` and `dist/child` are named `native-adult` and `native-child`. Each has 20 physical cells: four rows (front, right, back, left), each containing an idle pose followed by four walk frames. Open their `*.project.json` files in the workbench to edit or copy them. Skin tones remain selectable. Regenerate from source to preserve repeatability; save interactive changes to a new source before rebuilding.

Idle aliases remain `front`, `right`, `back`, and `left`. Walk aliases use `<direction>_walk_0` through `_3`; animation tags `walk_front`, `walk_right`, `walk_back`, and `walk_left` play at 8 fps. Source frames 0 and 2 share a passing pose, alternating with the two strides; these are four timed frames, not four unique silhouettes. The bottom-center pivot is shared by body, clothing, and wigs.

`native-mannequin.mjs` preserves every source front/right point. Left reflects right across the cell. Each rear frame shares the corresponding front silhouette and ground, replaces facial colors with skin, and moves rear skull, neck, shoulder, arm and heel shading with the pose's bob. The original enlarged references stay outside this repository. See [reference-grid](../reference-grid/README.md) for reconstruction and tone normalization.

## Character report and body sides

Body, wardrobe, cast and pressure-suit builds publish `character-report.json` beside the sheet, plus `playback-runtime.mjs`, both listed in `sprite-manifest.json`. Wig overlays have no report. The report uses the 40×56 recipe's contract with native names: `kind: 'character'`, `system: 'native'`, `cellSize` 16×32, `ground: 29`, `aliases` (`{direction}` and `{direction}_walk_{frame}`), `directions` mapping the runtime's down/up to front/back, and per-frame `alias`, `direction`, `frame`, `sides`, `gear` and `bounds`.

`sides.left` and `sides.right` give each anatomical side's `role` (near/far in profile, front/back otherwise) and its `shoulder`, `wrist` and `hip`. They come from the authored table in `joints.mjs` (eight source poses per body); left, back and the large body are derived from it, and clothing reads its exposed hand boxes from the same file. Use `attachmentFor(frame, side, joint, groundAnchor(report, frame), x, y, {scale})` to place one-sided items. Walking data is not published yet, so `createWalker` stops with "no locomotion data in this report".

### Held trowel

Declare held gear by anatomical side: `gear=trowel:right` (or `left`) as a generator argument after the tone for `generate-template.mjs`, anywhere in the `dress-template.mjs` arguments, or as `"gear": [{"item": "trowel", "side": "right"}]` on a character in `cast/manifest.json`. One hand item per side. The trowel sits at that side's wrist from `joints.mjs`: on top of the body when the hand is near, facing the viewer or facing away; when the hand is far it is drawn only where the cell is empty, so the body hides it but any part that extends past the silhouette stays visible (the owner prefers showing equipment when feasible). Gear pixels on the new silhouette edge become outline, and the trowel joins the sheet's single corner pass. Shapes are `gear_trowel_<side>_*` in a `gear` group, and report frames list the gear with its current role. Sheets without gear are byte-identical.

## Dressed studies

Read [clothing and hair rules](RULES.md) before adding presets. Four examples combine adult/child anatomy with a short-haired jacket/trousers outfit or tied hair and a green dress. Every idle and walking frame has clothing fitted to that pose, including moving sleeves, visible hands, skirt sway, trousers, and shoes.

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

Additional checked-in configs cover `adult-jacket-tied`, `adult-dress-short`, and their child equivalents. All use the same 20 frames and four walk tags. Hair-free configs (`adult-jacket-none`, `adult-dress-none`, and child equivalents) support independent wig overlays; hidden body points remain intact. For live editing, copy the session first and edit the `hair` group; deleting that group alone does not necessarily delete its member shapes.

Separate `adult-wig-short`, `adult-wig-tied`, `child-wig-short`, and `child-wig-tied` configs use `generate-wig.mjs`. Their PNG sheets and atlases contain only hair, in full 16×32 cells with matching aliases, animation tags and pivot. Overlay the same named frame on the corresponding body at (0,0), advancing both together; hair follows the head's bob. The hair source is shared with dressed examples; no duplicate geometry is maintained. Partial overlay edges deliberately meet the face/body and are not expected to be fully outlined in isolation; outline verification applies to the assembled dressed sprite.

All rear views use the derived back anatomy, full rear hair mass and rear garment shading. They omit eyes and frontal jacket openings. The tied wig includes a rear knot and a profile knot. Hair's bare-head width allowance and material rules are documented in RULES.md.

## Interactive review

Build the two bare bodies, four `*-none` outfits, and four standalone wigs, then serve this directory over HTTP and open `review.html`. To build all presets from the repository root:

```powershell
Get-ChildItem examples/native-character/*.build.json | ForEach-Object {
  node scripts/run-managed.js build $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "Build failed: $($_.Name)" }
}
```

The review page shows synchronized front/right/back/left views, adult/child bodies, independent clothing and hair selectors, playback speed, idle mode, and clickable frame strips. Its large canvases display native pixels at 8×. This is an asset inspection page, not a game character replacement or a full customization system. Generated `dist` files must be rebuilt after source changes; refresh the page after rebuilding.

## Space to Grow cast concepts

The [cast example](cast/README.md) applies the new format to eight residents: the Grower, Mara, Pip, Clementine, Sprocket, Registrar Nine, Vey, and a provisional child neighbor. Build `cast-*.build.json` and open `cast.html` for a synchronized lineup and selected-character turnaround. Its shared costume adapter supports semantic material ramps, landmark-attached pixel motifs, rear layers, replacement heads and robot casings while retaining the mannequin's walk aliases and pivot.

## Large-build mannequin

`large.build.json` creates `dist/large/native-large.project.json` and matching PNG/atlas/preview. It uses the same 16×32 cells, four directions, 20 frames, walk tags, adult head pixels, bob and bottom-center pivot. `large-mannequin.mjs` is the editable construction source, applied to the adult's source poses by `native-mannequin.mjs`.

```powershell
node scripts/run-managed.js build examples/native-character/large.build.json
```

The neutral front torso/shoulders span x=2..13 (12 pixels versus the adult's 10); bulkier forearms reach x=0..15. The bare head remains x=3..12. Thicker thighs/calves and a deeper profile provide a base for muscular or armored designs without changing the ground row. A split expansion adds two body columns, preserves the central leg separation and neck, and adds pectoral shading. Pose-specific arm bands add two interior skin columns between outlines (three in some profile sections), with separate light/shadow clusters. The `arms` group exposes these pixels for further editing. In the swinging profile poses the arm band steps evenly to a hand at the body front, and leftover adult arm outlines beside it become the arm's shadow on the torso instead of stripes. Rear shoulder and arm contours expand with the body. All body pixels retain semantic skin groups and support the seven skin ramps.

The large build also carries extra neck, jaw and shoulder mass: the jaw row (the skull base from behind) is one pixel wider each side, the neck two, with a trapezius step into shoulders squared over the arm tops; profiles bulk toward the face and the nape. Every mannequin (adult, child and large) then has its outside outline corners cut, so horizontal and vertical outline runs join diagonally (`cutOutlineCorners` in `server/engine/outline-corners.js`, one pass, never exposing skin); `sourceMannequin` returns the uncut source poses. Wardrobe, cast and pressure-suit sheets start from the uncut body and get one final pass over the finished composite, so garment, hair and costume outlines (every colour in a `*-outline` group, plus the costume outline) join diagonally too; a cut corner removes every layer at that pixel, so skin never shows through. Wigs are extracted from that finished composite. The adult face above the jaw is unchanged.

Select **Large** in `review.html` to inspect it. Adult wig sheets still align: the hair covers the head, and its edges meet the new jaw and neck pixels without gaps. Existing clothing is not fitted to this body; the review page locks clothing to the bare mannequin for Large. Armor silhouettes and costume-specific padding remain a later design pass. The committed `preview/large.png` shows every authored pose.
