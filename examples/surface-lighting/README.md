# Editable surface lighting

Copy this folder's three source files into an asset-source folder. Run the copied
`sprite-project.json` through the matching managed launcher's `build <config>`
command after setup/version sync. Generated files stay under the copy's `dist`.

Three 32×24 poses retain named shapes, a dome normal, a beveled crate and floor,
a luminance-height stone, a hand-painted directional label, solid/wall/unlit
material flags and a warm attached lamp. Only the lamp and its wire move between
poses. The one-shot reverse ping-pong group plays C/B/A/B for 525 ms.

The color PNG contains the offline lighting bake. The normal PNG remains a
direction map, encoded with green up and flat RGB 128/128/255. Its separate atlas
copies color frame rectangles, trim offsets, aliases, durations, tags and pivot.
Use the normal image in an engine only with an explicit matching normal-map
integration; this build does not install a runtime lighting system.

`palettePolicy: "rgb"` deliberately permits lit colors outside the authoring
palette. Choose `"nearest"` to quantize lit RGB to declared opaque palette colors;
alpha and unlit pixels remain unchanged. Omit or clear cell lighting to inspect
the original painted colors without removing normal or material authoring.

Open the generated editable project in the existing preview session. The Lighting
tab edits a selected shape's surface metadata or the current cell's lighting and
shows color, normal and light-map channels from the same server. The Replay tab
shows actual construction steps; scrubbing does not change live undo history.

For revisions, change the source generator, rebuild and inspect the verification,
contact sheet and retained project. A lamp attached to a shape follows supported
move, flip, quarter-turn, layer and composition transforms with that shape.
