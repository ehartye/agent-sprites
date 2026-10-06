# Native face construction

Use the cardinal faces as the style reference before drawing a diagonal. These guides and the eight-direction walking mannequins share the same editable source geometry; changing a reference in the workbench alone does not change the generator.

## Head volume

The bare skull stays ten pixels wide, x=3..12, inside a 16×32 body cell. The adult and large crown is y=2; the child crown is y=8. Diagonal skulls occupy eleven rows. Walking lowers the complete head by one pixel on stride frames and returns it on passing frames. Move the skull, eyes and shading together; do not enlarge the cheek, flatten the crown, or change head depth to make room for facial details. Large bodies retain the adult eye scale.

The diagonal silhouette has a closed, fully opaque interior. Model the turn with the far eye's narrower width and shifted light/shadow clusters. Mirror the entire right-facing construction for the corresponding left facing. Rear diagonals show the back of the skull without brows, eyes or a frontal mouth.

## Brows and eyes

The native eye band occupies **three rows**: a dark brow, a shaded white/iris row, then a lighter white/iris row. The narrower far eye retains that height; perspective changes width rather than deleting a row. The front-right guide is:

```text
bb.b
wi.i
lj.j
```

Here `b` is brow, `w` shadow white, `l` light white, `i` shadow iris, `j` light iris, and `.` leaves the underlying skin visible. This four-column band starts at x=8 and five rows below the diagonal crown. Camera-near means the visible anatomical right side in SE: the larger eye is on the image left, with two columns beneath its two-pixel brow. Its white is outward, away from the nose, at x=8; its iris is inward at x=9. The nose gap is x=10 and the compressed far eye retains a single iris column at x=11. Mirror the complete head for SW: the larger camera-near eye is on the image right, with white at x=7, iris at x=6, nose gap at x=5 and far iris at x=4. Do not infer nearness from which eye sits farther to the screen right. The two visible iris rows plus brow give it the same visual height as the existing front and side eyes. Do not add an expressive mouth or a heavy eyebrow beyond what the cardinal sprite establishes. Hats, goggles and masks may deliberately occlude features; they should not redefine the underlying head.

| Role | Adult / large | Child |
|---|---|---|
| Brow | `#000000` | `#010101` |
| White, shadow | `#d3c0b8` | `#b2e5f9` |
| White, light | `#fffdfc` | `#edf4fa` |
| Iris, shadow | `#682b0f` | `#3d4f78` |
| Iris, light | `#813f20` | `#8f72c6` |

Keep `eyes` and the five `eyes-*` role groups within `head`, outside all `skin-*` groups. Skin changes must not recolor eyes. `native-eyes.mjs` owns reusable eye patterns and material classification; `native-diagonal-head.mjs` owns the occupied skull and placement. These are source pixels, without antialiasing or interpolation.

## Build and review

```powershell
node scripts/run-managed.js build examples/native-character/eye-construction.build.json
node scripts/run-managed.js build examples/native-character/adult.build.json
node scripts/run-managed.js build examples/native-character/child.build.json
node scripts/run-managed.js build examples/native-character/large.build.json
```

The head study has three rows (adult, child, large), with columns front, right, back, left, front-right, back-right, back-left, front-left. Each actual mannequin has eight direction rows with idle plus four walk frames. Open the generated project in the agent-sprites workbench to inspect semantic groups; `review.html` provides synchronized walking playback.

Compare the entire turnaround at native size and a nearest-neighbor enlargement. Check the brow and two iris rows, head volume, opaque cheeks, and identical bob through the walk. Inspect rear diagonals for facial color leaks. Verify every skin tone, mirrored facings, and gear placement at the authored wrist. Diagonal locomotion has no measured foot-plant calibration; only the original side profiles publish that calibration.
