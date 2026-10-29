# Agent Sprites field guide

Public demo: https://ehartye.github.io/agent-sprites/

Original character study: https://ehartye.github.io/agent-sprites/tessel.html

Cozy animated scenes: https://ehartye.github.io/agent-sprites/cat.html

Marmalade's scene player switches between the detailed 384×256 bed-and-yarn
story (`little_morning`, 160 frames) and paw-washing scene (`paw_wash`, 120 frames).
Both use exact 50ms frame durations, a timeline scrubber and color/normal
channels. Story cues render stills from the selected atlas, scene downloads
follow the selection, and reduced motion starts paused. See
[the new scene sources](../examples/cozy-cat-detail/README.md) for the editable
art, image-generated concept reference and exported-atlas proofs. The earlier
[160×112 short](../examples/cozy-cat/README.md) remains preserved separately.
The editor ZIP contains independently editable sections sized for the current
workbench import path. The complete native timelines are also available as
lossless `JSON.GZ` archives. The rebuild source includes a portable unpacker.
An actual forty-frame section imported successfully. Since 0.95.0 the workbench
loads selected and visible thumbnails on demand and caches them, so opening a
section no longer waits on every thumbnail, though cold frames still take time to
render. The static scene player uses the exported atlases.

Tessel the Foldback has eight actions in both directions, a pose scrubber,
color/normal channel inspection and downloadable editable source. Its player
uses actual tag ranges and per-frame atlas durations; one-shot actions hold
their last pose. The gallery deliberately repeats those studies for comparison.
See [the Tessel source](../examples/tessel/README.md) for the distinct original
anatomy, rebuild command and exported-atlas proof receipts.

The static site features eight marquee workflows: editable shapes and ASCII,
reusable composition, independent animation, character builders, world and UI
recipes, surface lighting, construction replay, and export/verification.
The expandable reference is generated from the actual workbench command catalog.

```sh
node site/build.mjs
node site/test.mjs
node site/serve.mjs
# Open http://127.0.0.1:4178
```

Normal site builds need only Node 24+ and the repository. They copy reviewed,
committed assets; they do not install native libraries, rebuild artwork, run a
generator or open a user session. The generated `site/dist/` is ignored by Git.
GitHub Actions deploys that directory through the official Pages artifact flow.
All site URLs are relative so the repository Pages prefix works unchanged.

The dioramas play the actual `ambience` atlas tags, not duplicated named aliases
or the default grid sequence. Each loop has 32 frames at 100 ms. README GIFs are
2× nearest-neighbor copies of those canonical pixels. The initial motion state
honors reduced-motion preferences; a global pause also stops laboratory playback.
The named shape and ASCII experiments are local illustrative edits. Composition,
surface rasterization, replay snapshots and bitmap text use actual shared modules
or exported data. Nothing on the site sends mutation requests to a local server.
Filesystem publication, sessions, WebSockets and persistent undo require the
installed local workbench. Generated source examples assume a repository clone;
downloaded editable project JSON is self-contained.

To deliberately refresh the twelve existing recipe exports, prepare the matching
managed CLI with the repository's setup instructions, then run:

```sh
node site/refresh-examples.mjs
```

That command performs isolated builds through `scripts/run-managed.js`, then
copies PNGs, atlases, projects and selected reports into `site/assets/examples/`.
The environment gallery deliberately omits its large editable project; its
complete recipe source is included. This refresh is separate from Pages CI.
See [the diorama sources](../examples/showcase/README.md) for rebuilding the four
scenes and their verified GIFs. Review changed art visually before committing it.

Check desktop/mobile layout, all eight chapters, shape move/undo and ASCII
validation, deterministic seeds, all lighting channels and policies, recipe/font
selection, animation tags/directions/scrubbing, replay steps, scene downloads,
catalog search/empty state, keyboard tabs and reduced-motion pause. The static
test verifies exact catalog coverage, all nine recipe source kinds, exported atlas
bounds, scene receipts, timing boundaries, shared module identity, relative
imports and absence of machine paths. It does not claim a new native platform
compatibility run.

Fonts are self-hosted Pixelify Sans and DM Sans, with their respective OFL licenses
under `assets/fonts/`. No remote analytics, runtime fonts or third-party JS.
