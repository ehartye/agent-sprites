# Three-stage storyboard panels

Use the [storyboard example](../../../examples/storyboard-panels/README.md) when
the story owner supplies scene IDs, three stages per scene, and captions. Build
one landscape cell per panel with semantic names, painter's draw order and an
explicit output directory. Story structure and canon belong to the story source;
the sprite generator supplies rough blocking compositions only.

The example uses the checked managed launcher from the installed plugin, never
a checkout CLI or PATH executable. Run sprite-setup and stop on any failed batch.
It exports each scene for provenance, runs structural verification, and renders
individual panels using `view` outside the batch. Inspect every generated PNG
against its caption before calling the boards reviewed. Distinct hashes prove
different pixels, not an adequate story action.

Preserve input captions in the manifest instead of drawing text into pixels.
Keep UI/card labels in the story owner's HTML. A kind such as `teleport` or
`evacuation` is a visual recipe, not permission to add mechanics or canon.

Match the principal action before rendering: courier and manifest → `dock`,
crew chart → `bridge`, letter/drawing exchange → `correspondence`, working
pipes/pumps → `system`, actuator/sensor assembly → `robot-build`, entire growing
ship → `whole-grown`, external corporate demand → `pressure`, and cared animals
with separately collected samples/comparison beds → `fertilizer`. A crop lens
does not stand in for external pressure, and a fruit tree does not show a ship
growing whole. Reassign kinds per panel where activity changes within a scene.
