# Native character templates

Editable adult and child templates use 16×32 cells, ten-pixel bare heads centered at x=3..12, and soles at y=29. Templates retain the eight reconstructed front/right source poses and semantic skin groups. These are reference-derived studies; the back view is an authored inference, not a traced reference or an approved animation.

From the repository root:

```powershell
node scripts/run-managed.js build examples/native-character/adult.build.json
node scripts/run-managed.js build examples/native-character/child.build.json
```

The generated projects in dist/adult and dist/child contain neutral front, right and back frames. Open their *.project.json files in the workbench to edit or copy them. Skin tones remain selectable. Regenerate from source to preserve repeatability; save interactive changes to a new source before rebuilding.

The back shares the front silhouette and ground, replaces all facial colors with a skin ramp, and adds rear skull, neck, shoulder, arm and heel shading. This is a three-direction standing study; movement and a left view remain unauthored. The original enlarged references stay outside this repository. See ../reference-grid/README.md for reconstruction and tone normalization.
