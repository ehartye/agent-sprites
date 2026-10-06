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

`sides.left` and `sides.right` give each anatomical side's `role` (near/far in profile, front/back otherwise) and its `shoulder`, `wrist` and `hip`. They come from the authored table in `joints.mjs` (eight source poses per body); left, back and the large body are derived from it, and clothing reads its exposed hand boxes from the same file. Use `attachmentFor(frame, side, joint, groundAnchor(report, frame), x, y, {scale})` to place one-sided items. Walk frames also carry `locomotion`, so `createWalker` drives native walks (four frames at 8 fps). Right and left walks plant the support foot: each frame travels its measured step (`PROFILE_STEPS` in `joints.mjs`, from the sole centres on row 29: adult 3.5, 2.5, 4.5, 3; child 3.5, 1, 3.5, 2; large 4, 3, 5.5, 4 source pixels), published as `frameDistances` with `contactCalibration: 'profile'` and `rootCompensation: 'subtract-phase-remainder'`. In `authored-contact` mode the draw offset holds the body still within a frame and steps it between frames, so `contactsCalibrated` is true and the planted sole keeps its world position (to half a source pixel once the host rounds). Front and back walks use one uniform stride (`STRIDE`: adult 3.5, child 2.5, large 4) and claim no planting, like the 40×56 recipe's projected facings.

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

## Inline `native` build source

Costume builds no longer copy scripts out of this directory. A build config declares the
character as JSON under `native` (like `character`, `environment` and `ui`), and the managed
runtime does the rest:

```json
{
  "version": 1,
  "output": "../../public/assets/wanderer-rags",
  "omit": ["project", "operations", "preview", "contactSheet"],
  "expectedTags": ["walk_front", "swing_right", "water_left", "hurt_back", "down"],
  "native": {
    "name": "wanderer-rags",
    "preset": "scavenger-rags",
    "skin": "tan", "hair": "black", "wig": "tied",
    "motifs": [{ "name": "scarf", "colors": { "base": "#f0d466" } }],
    "omit": ["canteen"]
  }
}
```

```powershell
node scripts/run-managed.js build wanderer-rags/sprite-project.json
```

The library lives in `server/authoring/native/` (the whole native pipeline moved there from this
directory so the managed runtime ships it; the files here are thin re-exports plus the existing
command-line generators, whose output is byte-identical). Fields of `native`:

| Field | Meaning |
|---|---|
| `name` | Required project name (output file names). `id` defaults to it. |
| `preset` | A named starting point (below); your fields lay over it. |
| `kind`, `outfit`, `tone`, `wig` | The body and wardrobe, as for the cast: `adult` / `child` / `large`; `jacket` / `dress` (`none` for the bare `large` body); a skin tone id; `short` / `tied` / `none`. |
| `skin`, `hair` | A named ramp (`SKIN_RAMPS`: fair, tan, brown, dark, ghoul, zombie, grey, mutant; `HAIR_RAMPS`: brown, black, blond, red, grey, white) or a four-role ramp `{outline, shadow, base, highlight}`. |
| `materials`, `colors` | Material ramps and motif colour symbols, exactly as in [cast/README.md](cast/README.md#repeatable-costume-source). `colors.o` is the costume outline colour. |
| `motifs` | Library names, `{name, colors, side, directions}` objects, or custom motifs with `rows` (the cast's format). Library entries replace a preset's motif of the same name; `omit` drops preset motifs by name. |
| `gear` | The existing held trowel, by anatomical side. |
| `actions` | `true` or a list of `swing`, `water`, `hurt`, `down` (below). |
| `tool` | The held tool in swing frames: `hoe`, `pick` or `club`. |
| `posture` | `shamble`: arms forward on every idle and walk frame. |
| `bodyMaterial`, `armMaterial`, `handMaterial`, `replaceHead` | As the cast's casing and replacement heads; the arm and hand materials say which ramps redrawn arms use (default: the cloth, and skin). |

### Wasteland motif library

Costumes compose from names. Each entry is authored in front, right and back (left reflects
right), anchored to the head, shoulder, waist or ground so it bobs with its landmark, and
widened automatically for the `large` body. Colours are named slots with defaults from the
shared wasteland ramps; `@cloth.base`-style defaults follow the character's own material.

`wide-brim-hat`, `scarf`, `bandana`, `goggles`, `respirator`, `welding-mask`, `duster-coat`,
`ragged-cloak`, `scrap-pauldron` (`side: right|left`), `backpack`, `bedroll`, `canteen`,
`tool-belt`, `bone-trophy`, `rag-patches`, `ragged-trousers`, `glow-eyes`, `glow-core`,
`extra-arm`, `antennae`, `grey-alien-head` and `scrap-bot-head` (replacement heads).
`WASTELAND_MOTIFS` in `wasteland-motifs.mjs` lists each entry's slots and `describe` text.
The pack, bedroll and cloak drape use the `behind` layer; the shoulder plate stays on top of
redrawn arms. Presets (`NATIVE_PRESETS`): `scavenger-rags`, `scavenger-scrap`,
`scavenger-expedition`, `settler-farmer`, `settler-tinkerer`, `settler-elder`, `trader`,
`raider`, `ghoul`, `zombie`, `mutant-brute`, `alien-visitor`, `scrap-bot`.

### Action poses

With `actions`, every direction also gets, on the same 4-row sheet (15 columns, one row per
facing: idle, 4 walk, 4 swing, 4 water, hurt, down):

| Tag | Frames | Aliases | Plays |
|---|---|---|---|
| `swing_<dir>` | 4 at 10 fps: gather, overhead, impact, follow-through | `<dir>_swing_0..3` | till, clear, attack with the held `tool` |
| `water_<dir>` | 4 at 6 fps: lift, tilt, pour, long pour with falling drops | `<dir>_water_0..3` | pour from a canteen |
| `hurt_<dir>` | 1 | `<dir>_hurt` | flinch: head thrown back, arms flung up |
| `down_<dir>`, `down` | 1 each; `down` plays the front frame | `<dir>_down` | knocked out |

The frames are derived from the finished composite: the acting arm is cleared and redrawn
from authored joint paths in the character's own sleeve and skin ramps (forearm bare, so it
reads against the torso), with the tool, canteen and water drawn on top. Costume motifs
survive; only motifs marked `overArms` (the shoulder plate) stay above the new arm. Tools and
droplets keep to rows 0-29 so `bounds.bottom` and the ground anchor still agree.

Limits, stated plainly: the tool is in the **right hand**, so `swing_left` (the mirror of
`swing_right`) holds it in the character's left hand; every action frame's report entry names
`actingSide` and publishes the grip point as that side's `wrist`. A 16-pixel-wide cell cannot hold a
lying 30-pixel body, so `down` is a slumped, kneeling collapse (legs folded, head dropped),
not a prone sprawl. Actions are authored for the adult and large bodies (not child). The tool
is drawn only in swing frames; idle and walk keep their empty hands (or the trowel).

Report frames for action cells carry `action`, `actingSide` and no `locomotion`; the report's
`aliases` gains `swing`, `water`, `hurt` and `down` patterns.

### Publishing a build

`"omit": ["project", "operations", "preview", "contactSheet"]` leaves only the sheet,
atlas, manifest, verification, report and playback runtime in the output (a native sheet's
editable project and operations are megabytes). The manifest records `omitted`, and
`build-set --check` still reports the output current.
