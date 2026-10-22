# Marmalade, in detail

Two original, editable 384×256 pixel-art shorts: a ginger tabby rolls out of a
little basket bed to play with lilac yarn, then takes a quiet moment to wash a
raised paw. The separate clips run at 20 fps: 160 exact 50 ms poses over eight
seconds for play, and 120 over six seconds for grooming.

This edition redraws the cat and room at their native resolution. It does not
scale the earlier 160×112 example. The standing torso is approximately 86×58
pixels; the rounded head is 66×58 before its ears and cheek tufts. Green irises,
pupils, catchlights, a broad cream muzzle, whisker follicles, divided toes and
paw pads have room to read. The quilt seams, staggered wicker fibres, braided
rim, rug stitches and wound yarn strands are named geometry too.

The [generated concept](reference/marmalade-concept.png) guided feline anatomy,
color, materials and morning light. Its full prompt and image hash are retained
in [reference.json](reference/reference.json). It is a visual reference, not an
exported bitmap layer. The result deliberately uses clean grouped pixel shapes;
it does not claim the reference's painterly microfur density.

## Source and motion

- `art.mjs` authors room, basket, rug, yarn, articulated limbs and feline face.
- `geometry.mjs` supplies named primitives, curved ribbons and convex clipping.
- `timeline.mjs` authors eased poses, weight shifts, yarn arcs, lick strokes,
  cheek wipes and a return with feet anchored during stance.
- `generate.mjs` composes the invariant room once, copies it to subsequent cells,
  then reconciles the dynamic cat, yarn and contact shadows. Stable parent-layer
  depths preserve the basket lip in front of the sleeping cat.
- `build.mjs` uses the official managed `build`, `verify` and `atlas-proof`
  commands. No runtime bounds are changed.

Tabby bands are curved, tapered shapes rather than dorsal triangles. Torso and
head markings are clipped within inset anatomical masks before their pose
transform. A tightly curled tail is concave, so its bands intersect the actual
posed fur raster; the intersections remain editable, named row rectangles.
This contains marks even in rolling and turning poses.

The paw wash has four visible tongue-contact peaks, coordinated head dips and
an elbow-led paw arc across the cheek. Its raised paw, toes, pads, tongue and
face remain separate shapes. The first and last poses agree in both exported
color and normal channels. Neighboring motion and full-loop playback still need
visual inspection; matching endpoints alone cannot establish fluid movement.

## Rebuild and inspect

From a clone of the repository, first run the sprite setup skill's version check.
Then use:

```powershell
node examples/cozy-cat-detail/build.mjs
node examples/cozy-cat-detail/check.mjs
```

Pass `play` or `groom` to either script to handle one clip at a time. Build outputs
live in ignored `dist-play-v2` and `dist-groom-v2` directories; public artifacts
are copied to `site/assets/cozy-cat-detail/play` and `groom`. Native and enlarged
review cards remain local under `.reviews` and are excluded from the site.
`AGENT_SPRITES_LAUNCHER` may explicitly select the matching managed launcher.

Each clip uses the supported ops-file build input. `build.mjs` deterministically
regenerates the ignored `.generated-<clip>-ops.json` intermediate, avoiding the
generator subprocess's 8 MiB stdout buffer. Shape, composition, surface, replay,
image-export and GIF-proof work bounds remain enabled. The final manifest keeps
the intermediate's native input hash/byte receipt in `generatedBuildInputs`,
separately from committed source-file hashes in `sourceInputs`. Text inputs also
retain normalized LF hashes so a fresh checkout can check text identity.

## Editable project download

Download `editor-projects.zip` and open one of its plain `part-NN.project.json`
files in the browser editor. Each part contains forty consecutive frames with
local cell coordinates, a two-second one-shot tag, and all original named shapes,
normals, materials and layer coordinates. Segments are not advertised as seamless
loops. Each is validated with the native project model and against the editor's
64 MiB file/body and 200,000-shape import limits. Individual segment gzip files
are available too. Whole-short replay/review metadata is not attached to remapped
segments; its original custody remains in the full archive and `replay.json`.

Initial workbench loading of a forty-frame part can take several minutes while
the current editor eagerly renders its surface-lit thumbnails. A representative
part imported successfully, but model/import validation does not imply fast
interactive startup. Let the initial render finish before judging responsiveness.

Each clip also contains `project.json.gz`, a lossless gzip of the **exact native
exported full-project JSON bytes**. No shape, material, normal, layer or ownership
metadata is discarded. The full archive is for custody and CLI use: its unpacked
size exceeds the browser editor's import limit. Compression keeps the archive
below the Git hosting per-file limit. The manifest records compressed and
unpacked byte counts and SHA-256 values for both delivery forms.

To unpack an individual editor segment into a new file:

```powershell
node examples/cozy-cat-detail/unpack.mjs site/assets/cozy-cat-detail/play/editable/part-01.project.json.gz marmalade-play-part-01.project.json
node examples/cozy-cat-detail/unpack.mjs site/assets/cozy-cat-detail/groom/editable/part-01.project.json.gz marmalade-groom-part-01.project.json
```

The helper refuses to overwrite an existing output unless explicitly passed
`--force`. Atlas PNGs, paired normal maps, Aseprite JSON, bounded construction
replay, actual-atlas GIF proofs and individual source frames are also included.
The color and normal atlases share rectangles, holds, pivots and alpha exactly.
GIF palette conversion measurements are reported honestly in `proof.json` and
the manifest; the PNG atlas remains the full exported color result.

The full source atlases exceed the official proof service's 2048-pixel input-side
and aggregate-work bounds. Delivery therefore copies forty actual exported tag
frames at a time into pixel-identical 1920×2048 atlas pages, then runs the official
proof command on each page. These bounded native reports are retained under
`proof-pages`. The wrapper joins their canonical PNG frames into the complete
eight- or six-second GIF and verifies its decoded frame count, exact 50 ms holds,
looping, alpha and measured palette conversion. The top-level report is explicitly
`composed-full-sequence` wrapper evidence; it does not claim that a single full
official proof passed. No native guard is disabled or increased.

Nested logical layers keep the room, window, shelf, plant and cat regions small
enough for retained surface processing. Their tight primitive children preserve
editable dome/bevel normals, material flags and the attached morning-window lamp.
Lighting is a restrained offline RGB bake; it is not an engine lighting system.

The original [`../cozy-cat`](../cozy-cat) source and its published assets remain
available as the earlier small-format study.
