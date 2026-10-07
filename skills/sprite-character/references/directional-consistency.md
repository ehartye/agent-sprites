# Keep a character consistent when turning

Use this when adding or repairing views of an existing character. Its established
front, side and back art takes precedence over a generic character recipe.

## Read the reference before adding marks

Place the same character's established and proposed views side by side at 1× and
nearest-neighbor 6–8×, with the same pixel scale and ground anchor. Include at least
front, adjacent side views and both diagonals when those are the proposed views.
Inspect the actual exported pixels, not only the template or enlarged preview.

Record the face policy: which eyes are visible or covered, whether the nose/mouth
is omitted or only a low-contrast suggestion, and how fringe/headwear overlaps it.
If other facings omit a mouth, omit it here too. Do not add a dark mouth pixel just
to make a missing-face test pass. Rotate existing identity cues; do not create a
more detailed face or a new expression only in one direction. Generic eye sizes
in construction guidance are starting points for new designs, not repair targets.

## Preserve the volume before polishing detail

Compare crown, chin, eye band, skull width/depth and the head-to-body ratio.
Use silhouettes and head crops with shared crop bounds; exclude hats, floating
locks and other accessories from skull measurements, but compare their envelopes
separately. Establish the landmarks from this character, not a universal chibi ratio.
A diagonal projects the same head: it must not shrink into a wedge, inflate into a
block or lose the back of the skull. Widths and opaque pixel counts may change with
projection and occlusion; exact equality is not a volume test. Record measurements
as evidence, then inspect whether the turn preserves the reference's form.

Check idle and every walk phase after accounting for authored bob. Facial clusters
and head volume should stay stable; torso motion must not enlarge or squash the head.

## Check opacity and decide whether it is ready

View the head over contrasting solid and checker backgrounds. Gaps between hair,
skin and fringe inside a solid head reveal the world through the face. Close them
using the existing material clusters; retain intentional exterior gaps around
separate floating hair or accessories. An outer-contour check alone cannot prove
that internal head pixels are opaque.

Accept only when the lineup shows consistent volume and feature prominence, each
pose has the intended opaque head, and the exported PNG/atlas reproduces the source.
Keep the native/enlarged lineup and measurements with the source. State which views
and phases were inspected. Passing technical export checks or counting newly added
eyes/mouths cannot substitute for this comparison.
