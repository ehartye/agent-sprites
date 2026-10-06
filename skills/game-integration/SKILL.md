---
name: game-integration
description: Integrate agent-sprites exports into a 2D game, build pixel UI with bitmap text and inventory panels, or export sprite-based app icons. Use for atlas loading, animation tags, and repeatable game asset builds; not for CSS/SVG animation.
---

# Game Integration

Before running sprite operations, use [sprite setup](../sprite-setup/SKILL.md) for
first-time installation and version sync after plugin updates. Always invoke this
plugin's absolute scripts/run-managed.js with Node; never use a PATH executable,
checkout CLI, or plugin-cache CLI. All sprite.js examples mean that launcher.

Patterns for taking agent-sprites exports into a real game project. Everything here shipped in production games (horde-peril, thrill-peril) — prefer these shapes over inventing new ones.

`sprite.js` means the invocation resolved by [sprite editing](../sprite-editing/SKILL.md).
Stop on failed CLI commands; see its PowerShell helper before running a build sequence.

## Custom engine GPU effects

For runtime shaders in an owned game renderer (Canvas/WebGL lighting, warps,
color effects or trails), use `agent-engine:engine-custom-shaders` from
[agent-engine](https://github.com/ehartye/agent-engine). Custom is an engine type;
the shader skill owns pass integration and GPU verification. Resolve that skill
from the available agent-engine plugin or development checkout; if unavailable,
use the renderer's official documentation and disclose the missing guidance.
Keep sprite PNG/atlas and playback metadata as the asset contract. For highlights
and shadows painted into the sprite instead, use [sprite shading](../sprite-shading/SKILL.md).

## Creatures (animals, insects, mutants)

Build non-humanoid creatures with the inline `creature` source ([README](../../examples/creature/README.md)),
one project per creature, never a game-local generator. Load the atlas with `anims.createFromAseprite`; tags are
`idle_<dir>`, `walk_<dir>`, `attack_<dir>`, `hurt_<dir>` for `front`, `back`, `right`, `left`, plus `down`. Place
sprites with the report: origin is bottom centre (`groundAnchor`), collide with `footprint` (source pixels, scale by
the game zoom), and read `animations` for fps and loop. `playback-runtime.mjs` accepts the report as-is for
distance-driven walking. Look at the 8x contact sheet and the walk/attack previews before integrating: silhouettes
should read at the game zoom, and a small creature (16x16) needs strong palette contrast against the ground.

## Strict pixel UI

For bitmap lettering, inventory panels, dialogue and pixel controls, read the
[UI recipe and runtime contract](../../examples/ui/README.md). Build separate
`ui` recipes with `kind: "font"` and `kind: "skin"` through the managed launcher.
Use the exported glyph metrics, tone frames, panel insets and `ui-runtime.mjs`;
keep font masks and skin drawing in the tool rather than copying them into a game.

Compose glyphs and skin parts at integer scales. Check the actual text repertoire
with `missingGlyphs`, including punctuation, changing quantities and error text.
Phaser games load `ui-phaser.json` (per-tone `BitmapFontData` and nine-slice numbers; see the UI README) instead of writing an adapter.
Use `ui-boot.mjs` when loading/failure messages must also use the exported font.
For a strictly pixel interface, replace visible browser lettering, native form
art, tooltips, list markers, focus rings and world labels as well as main menus.
Retain semantic controls for keyboard and screen readers beneath the visual layer.
Drive dirty UI painting from the game's existing frame loop; use one-shot
invalidation during bootstrap rather than a second perpetual animation loop.

Verify long dialogue wrapping, scrolled/clipped content, focus and disabled states,
modal layering and phone hit targets in the running game. A loaded atlas or a
successful build does not establish that every visible UI pixel comes from it.

## Open-ended terrain (wasteland materials and overlays)

For a ground sandbox where any 1x1 tile can be any material, use an `environment` recipe with `kind: "terrain-overlay"`
(add `customMaterials` for game-specific ground; no code change). Draw every tile as its base `<material>_<variant>`,
then for each neighbour material of HIGHER priority stack `<material>_<mask>_<variant>` where the mask is the bit set of
this tile's neighbours that are that material (N=1 NE=2 E=4 SE=8 S=16 SW=32 W=64 NW=128; a diagonal counts only when
both adjacent cardinals are clear, so 8 neighbours normalise to 85). Priority is the game's choice. Play the exported
`water` tag for all water tiles. Read cells from `environment-report.json`, set the scale guard from `pixelScale`, and see
`examples/environment/wasteland/compose-map.mjs` for a reference composition. Details: `examples/environment/README.md`.

## Tilesets, props, item icons and crop stages

For a regular grid where frame index equals cell index (Phaser tilemap tilesets, Tiled), item icon sheets and crop
growth stages, use the `tileset` recipe: [tileset recipe](../../examples/tileset/README.md). Draw tiles as `.pxl`
text, recolour templates for tool tiers or seed packets, and let `@autotile` generate 47-mask wall, floor and roof
sets and 16-mask fences in selectable materials. Load the PNG as a tileset image and map names to indices with
`tileset-report.json`. Masks are clockwise from north (N=1 ... NW=128) with a diagonal kept only when both adjacent
edges are set; do not reuse an encroachment mask normaliser for them. `"omit"` in the build config keeps megabytes of
editable project JSON out of a game repo. For a farming or survival HUD use the `wasteland` UI theme (meters,
minimap frame, tabs, colour need and weather icons).

## Export layout convention

One sheet per character family / tileset / UI set, exported into the game repo:

```
<game-repo>/
  asset-src/gen-build.mjs        # generator script (source of truth)
  asset-src/build.json           # emitted ops — reviewable, replayable
  assets/claude-sprites/<name>/  # one folder per sheet
    <name>.png
    <name>.atlas.json
```

Export each sheet with `sprite.js export --dest <game-repo>/assets/claude-sprites/<name>`.
This writes directly into the supplied directory; `new --dest` instead takes a
parent and appends the project name. The legacy `assets/claude-sprites` default
is compatible with existing games; `public/art` is equally valid when requested.
Omit `save` when no project JSON should enter assets; drafts persist automatically.

## Full-game asset builds: generate, don't hand-write

A game's asset set is hundreds of ops (thrill-peril: ~760 across 9 sheets). Keep one
build config per sheet and use the managed `sprite.js build <config> --json`.

For human casts start with the inline `native` source (16×32, primary; JSON only, with motif library,
presets and swing/water/hurt/down poses: see [sprite character](../sprite-character/SKILL.md));
set `"omit": ["project", "operations", "preview", "contactSheet"]` when the output is
committed into the game (those files are megabytes) and rebuild a whole directory of profiles with
`build-set`; for expression sheets, nonhuman humanoids and fitted
pressure suits use the built-in 40×56 [`character` recipe](../../examples/character-cast/README.md). It needs only JSON,
exports ordinary editable shapes plus a joint report, and shares fixes across
projects. The custom generator workflow below remains useful for other assets.

1. Write a project-local `generate.mjs` that prints an operations array to stdout,
   beginning with one `new` and omitting `save`/`export`/`ref`.
2. Create `sprite-project.json` with `version: 1`, `generator: "generate.mjs"`,
   explicit `output`, and `expectedTags` for the game animations.
3. Run the managed build; stop on nonzero exit. It isolates the session, stages and
   verifies artifacts, and preserves previous output on failure.
4. Inspect the emitted contact sheet and play `preview.html`. Load its PNG and
   atlas in the engine through `sprite-manifest.json` (`files.sheet`, `files.atlas`,
   `report`), resolved relative to the manifest; never derive paths from the recipe kind.
   For characters and furniture, draw at the report's ground with the published
   `playback-runtime.mjs` (`drawAtGround`, `createWalker`) instead of the cell bottom;
   if you drive walks yourself, honor `frameDistances` when a gait has them (the frame is the first
   whose running total exceeds `distance % cycleDistance`); see the [character walking rules](../../examples/character-cast/README.md#anatomy-and-distance-driven-walking-0214). Keep the generated directory dedicated to build outputs.
   A build with `trim: true` (or `export --trim true`) packs frames tightly: draw each at its
   `spriteSourceSize.x/y` offset inside the cell (engines' Aseprite importers and `drawAtGround` do).

Copy `<plugin-root>/examples/blink` into the game source tree for an ops-file
example. See the [build config and ownership rules](../../README.md#build-a-repeatable-asset-project).
Generator/config files are canonical; manually editing the generated project does
not update the generator. Save a separate variant if those edits must survive.

For an existing multi-sheet generator that intentionally edits a live session,
the lower-level workflow remains:

1. Write `asset-src/gen-build.mjs` — a small JS script with helper functions (`draw()`, per-archetype recipes) that emits `build.json`
2. Run `node asset-src/gen-build.mjs > asset-src/build.json` and check its exit status
3. Replay with `sprite.js batch asset-src/build.json --json`; continue only on exit 0
4. Export each sheet

The generator is the maintainable artifact; the emitted `build.json` is the reviewable one. Rebuilding a sheet after a tweak is a re-run, not an archaeology dig.

**Variant tiers via recolor, not redraw.** For enemy tiers / palette swaps (5 zombie tiers from one drawn set): draw the base variant, `clone-cell` its frames, put the recolorable shapes in a pattern shape-group, then `recolor-group` per tier. One drawn set, N variants — see the [palette-swap example](../sprite-editing/references/tool-reference.md#shape-groups).

## Phaser (proven wiring)

Animated sheets load as Aseprite; every cell group becomes a named animation with correct per-frame durations:

```js
// preload — animated sheets (characters, fx)
for (const k of ['dancer', 'zombie', 'gfx']) {
  this.load.aseprite(k, `assets/claude-sprites/${k}/${k}.png`,
                        `assets/claude-sprites/${k}/${k}.atlas.json`);
}
// static sheets (tiles, ui, props) — plain atlas, frames by name
this.load.atlas('gtiles', 'assets/claude-sprites/gtiles/gtiles.png',
                          'assets/claude-sprites/gtiles/gtiles.atlas.json');

// create — one call registers all frameTags as animations
for (const k of ['dancer', 'zombie', 'gfx']) this.anims.createFromAseprite(k);

// use
sprite.play({ key: 'walkd', repeat: -1 });   // 'walkd' = cell group name
img.setFrame('tomb');                          // named cell = named frame
```

Two gotchas:

- **Phaser ignores the pivot slice** — call `sprite.setOrigin(0.5, 1)` in code for bottom-center characters. Unity/Godot importers do read the exported pivot.
- Frames carry both numeric indices and name aliases, so named-cell lookups (`setFrame('tomb')`) and tag playback both work from the same atlas.

Unity/Godot: import `<name>.atlas.json` with their Aseprite JSON importers — frameTags, durations, and pivot come through without game code.

## App icons from sprites

Draw the icon as a normal cell (32×32 works well), then export crisp nearest-neighbor upscales straight from the CLI — never let an image editor resample pixel art:

```
sprite.js view --cell 0,0 --scale 1  --out icon-32.png     # favicon
sprite.js view --cell 0,0 --scale 6  --out icon-192.png    # 32 × 6
sprite.js view --cell 0,0 --scale 16 --out icon-512.png    # 32 × 16
```

Reference the PNGs from the web manifest (192 + 512, `"purpose": "any maskable"` — keep important detail inside the inner ~80% for maskable) and `<link rel="icon">`. Proven on two shipped PWAs.

## Sourcing art from image models

If assets come from an image-generation model rather than the parametric
toolset, read [generated sprite guidance](../sprite-editing/references/generated-sprites.md) first. The
short version: the model will not hold character height across runs, so
calibrate every run to one canonical standing height before the frames reach
an atlas; never request a transparent background, request a flat key colour;
and slice on whitespace gutters, never by grid division.

## Verify before wiring

Before any sheet reaches game code, run the `sprite-verification` skill: per-
frame contact-sheet inspection, baseline alignment, and an in-engine loader
check. Frame counts and registered animations are not verification.

## QA loop

Judge art at scale before shipping it into the game:

```
sprite.js view --sheet --scale 8 --out qa.png    # then read qa.png back
```

Review the rendered PNG after every few draw operations, not just at the end — composition mistakes compound across cloned frames.

## Port hygiene

The sprite server defaults to port 3377. If occupied, set `SPRITE_PORT` to an
unused port (PowerShell: `$env:SPRITE_PORT = '3378'`) and use the matching UI URL.
This separates HTTP endpoints, not session storage: the SQLite database remains
shared. A service identity mismatch is a clear error; leave the unrelated app running.
