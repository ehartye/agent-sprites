# Marmalade: detailed morning and grooming scenes

The owner's revision asks for substantially finer native detail, fluid movement,
tabby markings that stay within the fur, and a separate paw-licking scene.
The earlier 160×112 short remains preserved as a historical example.

## Art direction

Draw two new editable 384×256 scenes. The ginger domestic cat should occupy a
large enough area for shaped feline cheeks, green eyes, eyelids, pink nose,
cream muzzle/chest/paws, toe divisions and whiskers. Use grouped copper and
amber fur clusters with curved, contained tabby bands. The image-generated
reference guides proportions, materials and lighting; it is not the rendered
animation background. Named geometry remains the final editable source.
Use selective local-color outlines, warm window light, cooler shadow planes,
a woven wicker bed, folded sage cushion, textured rug and wound lilac yarn.

## Task 1 — new source and exports

- Own only examples/cozy-cat-detail/** and site/assets/cozy-cat-detail/**.
- Save the selected reference and generation prompt in the new example.
- Create shared room, material, cat rig and shape helpers plus separate play
  and grooming generators/configs. Do not merely scale the old geometry.
- Target exact 50ms frames (20fps): play 160 frames/8s; grooming 120 frames/6s.
  Split the atlases so each stays within the existing tool limits. If an actual
  limit rejects a build, adjust the split/output rather than raising a bound.
- The play story includes waking, rolling from the bed, stretching, tapping
  and playing with yarn, settling back. Interpolate eased joint/body motion,
  contact and ball arcs, with weight shifts and delayed tail motion.
- Grooming includes a comfortable seated pose, paw raised to the muzzle,
  multiple readable pink-tongue contacts, face wipe, blink and return to the
  starting pose. Paw/head placement must make the licking legible.
- Clip markings into each local fur region before the region's world transform.
  No stripe triangle may protrude from the back or detach through rotation.
- Build with the managed 0.94.0 launcher after setup check, using offline build
  isolation and a free port. Retain paired normal atlases, named surface data,
  exact frame timing and representative construction replay.
- Generate deterministic operations-file inputs through the supported build
  route. Reuse the invariant room through native cell copy, and group tight
  primitive layers inside bounded logical regions. Preserve both color and
  normal pixels when changing that layer organization.
- Publish separate play/groom atlases, projects, normals, proof GIFs and JSON
  receipts. Manifest contracts must describe actual inspected output, timing,
  source inputs and portable artifact hashes. Preserve normalized text hashes
  for CRLF/LF checkout equivalence and exact bytes for generated artifacts.
- Transport the large editable projects as lossless JSON.GZ archives with a
  portable unpack helper. Record compressed and unpacked identities; no shape,
  material, timing or edit data is removed. Keep generated intermediate inputs
  distinct from committed canonical source inputs in the manifests.
- Inspect all exported frames at native and enlarged scale, plus real playback.
  Specifically verify anatomy, stripe containment, paw/yarn contact, tongue
  visibility, floor contact, seam behavior and absence of blank frames.

## Task 2 — player and documentation

- Root owns site/cat.html, cat.css, cat.js, focused static checks, README links
  and this plan. Support a play/groom scene selector, exact new dimensions and
  timing, pause, seeking, restart, color/normal channels, per-scene story cues
  and downloadable source/proof files. Honor reduced motion.
- Keep the visual hierarchy simple: the art first, then the scene choice and
  controls. Check keyboard access and responsive widths down to 320px.
- Preserve older assets and protected unrelated examples. Do not modify the
  core plugin/runtime or version pins for this asset-only revision.

## Task 3 — independent checks and delivery

Use subagent-driven development for the asset task, followed by independent
spec review then quality review. Reviewers compare the actual new output with
the old short and selected reference, including all poses and real motion.
Resolve material findings before final verification. Run source replay/export
and site tests appropriate to this change, verify a clean LF checkout when
needed, then rebase latest and deliver through a feature PR and squash merge.
Check deployed Pages assets against canonical hashes and actual browser
playback. Do not claim all-platform CI on an asset-only lane.

Document the final asset architecture, reproduction commands and validation in
the project documentation after canonical and deployed artifacts are verified.
