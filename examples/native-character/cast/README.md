# Space to Grow cast concepts

Eight characters use the native 16×32 adult/child mannequins and their four-direction walks. The owner accepted this format to replace Room2Grow's previous 40×56 cast. Nori is a provisional child-neighbor design; the other names come from the game's brief and existing art studies. An available character model does not establish their presence in the playable story: Clementine remains missing.

| Character | Visual idea |
|---|---|
| The Grower | Copper field jacket, teal overalls, sun cap, seed pack |
| Mara | Dark tied hair, work goggles, tool harness, service pack |
| Pip | Short lilac body, cream kitchen apron, sealed chef cap |
| Clementine | Silver hair, sage field coat, plum trousers, Almanac bag |
| Sprocket | Mustard casing, teal display, antenna, animated treads |
| Registrar Nine | Ivory casing, optical band, survey aerial, specimen case |
| Vey | Mint chitin, compound eyes, folded plum wings, four arms |
| Nori | Child proportions, dark hair puffs, yellow top, teal overalls |

From the repository root, build the eight cast presets:

```powershell
Get-ChildItem examples/native-character/cast-*.build.json | ForEach-Object {
  node scripts/run-managed.js build $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "Build failed: $($_.Name)" }
}
```

Serve `examples/native-character` over HTTP and open `cast.html`. The gallery offers the whole lineup, four views of the selected character, idle/walk, frame stepping, speed, and native-size comparisons. Refresh after rebuilding. PNG, atlas, editable project, contact sheet and build verification live in `dist/cast-<id>/`. Each character keeps the same 20 aliases, four walk tags, and pivot as the bare mannequin.

## Pressure suit concepts

The **Outfit** selector compares everyday clothing with **Field suit**, **Service shell**, and **Retro ribbed** across all eight characters. Open `cast.html?outfit=field` (or `service` / `retro`) to start suited. The glob above builds all 32 cast/outfit presets. The 24 suit presets use the same generator with `[characterId, suitId]`; their output names add `-field`, `-service`, or `-retro`.

**Robots generally do not need vacuum suits.** Sprocket and Registrar Nine normally operate in vacuum in their own casings. Their shell variants are optional protection against specific hazards, such as corrosive environments, rather than mandatory breathing or pressure equipment. Organic characters use pressure gear when the destination requires it. Portal travel alone does not require a suit; the prototype's Upside has breathable air. These are Space to Grow design rules, not general engineering claims about robots.

`pressure-suit.mjs` owns the shared fit. Field suits combine teal fabric and rounded cream helmets; service shells use angular helmets and harder chest panels; retro suits use copper fabric, ribbed chest panels and paired rear tanks. Head, collar, chest and pack attachments follow each pose's landmarks. Adult/child dimensions use their respective mannequins. Source skin outside the head becomes a separate pressure-fabric material, including hands and neck; it is removed from skin-role groups so later skin edits cannot uncover gloves. Robots keep their face displays inside environmental shrouds. Vey retains four arms with suited sleeves and gloves; antennae and the everyday wing mantle are enclosed or stowed.

Front visors reveal the face. Profile helmets have opaque rear casing and glass only on the forward side; they never reuse the front oval. Rear helmets are opaque. A colored collar joins the helmet rim to the torso and life-support pack, avoiding the floating-head reading caused by two adjacent dark outline rows. All four directions, both strides, and the repeated passing pose share that rule.

These are visual pressure-suit concepts, not technical life-support specifications. The gallery presents 480 suited frames alongside the 160 everyday frames. Tests protect complete aliases/groups, bounds, mirrored profiles, body coverage, visible collar bridges and profile visor placement; inspect actual playback and native pixels as well.

## Repeatable costume source

`manifest.json` holds both gallery copy and editable costume data. `generate-cast.mjs` passes each profile to the shared `costume-template.mjs`; no game-specific renderer or hand-edited export is needed.

- `kind`, `outfit`, `wig`, and optional `tone` select the existing mannequin and wardrobe.
- `materials` replaces semantic `outline`, `shadow`, `base`, and `highlight` colors for existing materials (`skin`, `hair`, `cloth`, `trim`, `trousers`, `shoes`). Omit materials absent from the selected outfit.
- `colors` maps single motif symbols to six-digit hex colors. A motif's own `colors` can override them. `.` always means transparent. `o` supplies the assembled motif outline color.
- Each motif has a stable `name`, integer `x`/`y`, an `anchor`, and pixel `rows`. Anchors are the moving `head`, `shoulder`, `waist`, fixed `ground` at y=29, or `cell` at y=0. Anchor x is always the cell origin; y is an offset from the landmark. Optional `frames` supplies four arrays of pixel rows in walk order; idle uses frame 0.
- `directions` selects `front`, `right`, or `back`; omission applies everywhere. Left always reflects the complete right-facing costume. Authoring a separate left motif is rejected.
- `layer: "behind"` places a pack, mantle, or extra arm behind the body. The default is foreground. Foreground motifs preserve exposed source hands unless explicitly marked `coverHands: true` for deliberate occlusion.
- `replaceHead: true` removes original head-group points. Use directional motifs with `part: "head"` to provide an editable replacement, and deliberately connect the neck. Source body proportions and walk pixels otherwise remain intact.
- `bodyMaterial: "casing"` changes the original skin role-group names for robots, so the skin-tone picker cannot repaint their metal shells.

Newly exposed costume pixels are outlined after rear/body/front composition. This catches edges where a motif protrudes beyond the base silhouette. It does not repair a disconnected shape or invent an anatomically appropriate attachment; inspect all four directions and both stride poses.

The shared recipe supports palette changes, anchored details and layered silhouettes. It is not a general skeletal rig. Vey's extra arms use authored motifs; Sprocket's lower limbs use tread overlays. Their motion is a compact concept treatment, not a claim of biomechanical fidelity or a complete species animation set. Everyday outfits suggest space equipment; the separate suit variants add closed helmets and body coverage.
