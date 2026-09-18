---
name: game-integration
description: Integrate agent-sprites exports into a 2D game, build a game's pixel-art asset set, or export sprite-based app icons. Use for Phaser, Unity, or Godot atlas loading, animation tags, and repeatable asset builds; not for CSS/SVG animation.
---

# Game Integration

Before running sprite operations, use [sprite setup](../sprite-setup/SKILL.md) for
first-time installation and version sync after plugin updates. Always invoke this
plugin's absolute scripts/run-managed.js with Node; never use a PATH executable,
checkout CLI, or plugin-cache CLI. All sprite.js examples mean that launcher.

Patterns for taking agent-sprites exports into a real game project. Everything here shipped in production games (horde-peril, thrill-peril) — prefer these shapes over inventing new ones.

`sprite.js` means the invocation resolved by [sprite editing](../sprite-editing/SKILL.md).
Stop on failed CLI commands; see its PowerShell helper before running a build sequence.

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

1. Write a project-local `generate.mjs` that prints an operations array to stdout,
   beginning with one `new` and omitting `save`/`export`/`ref`.
2. Create `sprite-project.json` with `version: 1`, `generator: "generate.mjs"`,
   explicit `output`, and `expectedTags` for the game animations.
3. Run the managed build; stop on nonzero exit. It isolates the session, stages and
   verifies artifacts, and preserves previous output on failure.
4. Inspect the emitted contact sheet and play `preview.html`. Load its PNG and
   atlas in the engine. Keep the generated directory dedicated to build outputs.

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
