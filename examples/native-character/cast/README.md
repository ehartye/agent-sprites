# Space to Grow cast concepts

Eight exploratory characters use the native 16×32 adult/child mannequins and their four-direction walks. These are concept studies, not replacements for the game's current 40×56 sprites. Nori is a provisional child-neighbor design; the other names come from the game's brief and existing art studies.

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

The shared recipe supports palette changes, anchored details and layered silhouettes. It is not a general skeletal rig. Vey's extra arms use authored motifs; Sprocket's lower limbs use tread overlays. Their motion is a compact concept treatment, not a claim of biomechanical fidelity or a complete species animation set. Collars and fittings suggest vacuum-compatible equipment; these everyday outfits are not closed pressure suits.
