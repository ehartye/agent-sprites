# agent-sprites

A pixel-art sprite authoring toolset for coding agents and 2D game projects, with a CLI, a live web UI, and a Claude Code plugin. Human collaborators watch and edit through the web UI while their agent works the CLI.

Built and battle-tested by shipping real games with it (SNES-style dungeon crawlers, a rhythm brawler) — every tool exists because a real build needed it.

## Collaborative preview workbench

Open the server's preview URL to work on the same live draft as your agent.

- **Sessions** switches among saved drafts; **Copy for edits** creates an independent session with its own save destination. All viewers on one server follow its active session.
- **All palettes** displays every preset together. Selecting a library swatch uses its exact color without changing existing artwork.
- **All tools** provides searchable forms for drawing, shading, transformations, groups, animation, references, saving and exporting. JSON parameters expose advanced options. Build, trace and verification forms run existing file workflows from the server's localhost page; restart remains a terminal command.
- **Pass design** downloads editable project JSON, PNG and atlas, imports a project into a new session, and saves a review note and selected frame in the portable project. Copy the handoff to give your agent the exact server port and session ID. The agent can read the saved design and review at `GET /api/workbench/project`.
- Expanded CLI batch operations can be pasted into **Apply agent operations**. Session creation and disk publication use their separate controls. The batch stops on the first failure; earlier edits remain applied.

Draft changes persist automatically. **Save project** writes the editable file on disk. Copies preserve animation timing and shape groups. Session guards stop stale tabs or in-flight batches from editing a different design after a switch. Large traces fit the canvas and have searchable, paged shape lists.

**Show traced baseline** hides/shows the generated `trace-000001` rectangle shapes
throughout your local view, leaving newly drawn shapes visible. **Show reference
image** controls an attached tracing underlay. These are view-only switches: saved
artwork and exports retain all shapes. Renamed traced shapes no longer belong to
that automatically recognized baseline. A new session starts with both visible.

## The core idea

Sprites are **named parametric shapes** (circle `ball`, rect `bg`), not raw pixel buffers. Shapes carry z-order, live in grid cells, support per-cell undo/redo, and are addressable by name for later edits (`move-to`, `recolor`, `resize`, `clone`, `flip`, `rotate`, `tween`). This gives an LLM semantic handles instead of pixel coordinates — the affordance that makes agent-driven pixel art tractable.

## Highlights

- **Reusable characters** — a built-in JSON character source fits adult/child and rangy bodies, human/insectoid heads, two/four arms, expressive faces, eight-pose walks, travel clothing and fitted pressure suits; exports remain named editable shapes with an anatomical report. See [character recipes](examples/character-cast/README.md).
- **Native 16×32 mannequins** — editable adult/child/large mannequins with eight-direction walk cycles and face-construction references, four-direction fitted wardrobes and animated wigs, and a synchronized browser reviewer. See [native character templates](examples/native-character/README.md).

- **Lighting automation** — `highlight` / `shadow` / `sphere-shade` place ramp-aware lighter/darker pixels along curved arcs inside the form (with optional `--dither`), compensating for the thing LLMs are worst at: hand-placing individual pixels
- **Pattern fills** — any filled rect/circle/ellipse/polygon takes `--pattern checker|stripes|sparse|scatter --color2 <hex>` for two-color dither fills in one op (pointillism, texture, gradients by band); `recolor --color2` swaps the second color later
- **Feedback loop** — `view` renders any cell/group/sheet to PNG (`--scale` for nearest-neighbor upscales, `--out` to a chosen path) that the agent reads back; the web UI mirrors every operation in real time over WebSocket
- **Game-ready export** — gapless sheet PNG + Aseprite JSON atlas (`meta.frameTags` from cell groups, per-frame durations from group fps, pivot slice). Phaser, Unity, and Godot importers consume it directly
- **Batch mode + recipes** — JSON op arrays with `{{var}}` substitution and per-frame vars files; generate large builds from a small JS script (see `recipes/` and the `game-integration` skill)
- **Animation** — cell groups with fps, server-side `tween` with easing, cell mirror/rotate for direction variants, repeated cells for 4-beat walk cycles
- **Palettes** — pico8, gameboy, nes, cga; ramp-aware: pico8, db-16, db-32

## Install

### Managed CLI for coding agents and people

Install Node.js with npm, then use the `sprite-setup` skill from your installed
plugin. A checkout can run the same bootstrap:

```powershell
node ./scripts/setup.js
if ($LASTEXITCODE -ne 0) { throw 'CLI setup or version sync failed' }
node ./scripts/setup.js --check --json
if ($LASTEXITCODE -ne 0) { throw 'Version sync check failed' }
```

Setup copies this release's runtime into `~/.agent-sprites/releases/`, installs
lockfile dependencies there with `npm ci --omit=dev`, verifies the native `canvas`
and `better-sqlite3` bindings, and runs `npm link` from that managed copy. It does
not install dependencies in the plugin cache or link your checkout. No published
npm package is required. The global link uses your configured npm prefix; setup
reports its PATH directory if it is missing from the current environment.

Run setup again after a plugin update. Releases are identified by version, content,
platform and Node ABI; matching installs are reused, and old releases are retained.
An optional `AGENT_SPRITES_HOME` overrides the managed home and must be consistent
between setup and use. Existing sessions remain in `~/.claude-sprites/session.db`.

**Every sprite skill uses the checked launcher** from its loaded plugin:
`node "<plugin-root>/scripts/run-managed.js" <command> ...`. It requires the
matching external install and never falls back to PATH, a checkout, or the plugin's
bundled CLI. The linked `agent-sprites` command is also available for shell users.
Run commands from your game/project directory to preserve relative asset paths.

The version sync check compares plugin/package/lockfile metadata, runtime contents,
native dependencies, npm link target, and a running server's version and install
root. A stopped server is valid. A mismatched server blocks operations; stop the
known old server when safe or choose an unused `SPRITE_PORT`, then rerun the check.
Setup never stops an existing server automatically.

### Optional Claude Code plugin

```
/plugin marketplace add ehartye/agent-sprites
/plugin install agent-sprites@agent-sprites
```

Then invoke `/agent-sprites:sprite-setup`, or run
`node "<plugin-install-dir>/scripts/setup.js"`. The setup skill installs and links
the external runtime and performs the version sync check.

### Upgrading from claude-sprites

The repository and plugin are now named `agent-sprites`. Install the new plugin name above, then disable the old `claude-sprites` plugin to avoid duplicate commands. Existing sessions remain in `~/.claude-sprites/session.db`, and the default project output remains `assets/claude-sprites/<name>/` for compatibility. No data move is required. Existing local checkouts can keep their folder name; update their remote with:

```
git remote set-url origin https://github.com/ehartye/agent-sprites.git
```

## Quickstart

Run from the project where assets belong. This PowerShell example creates two
named frames of a blinking robot, exports only PNG + atlas into `public/art`,
and writes a 4× contact sheet into `review`. The helper stops on command failure.

```powershell
function Invoke-Sprite {
    agent-sprites @args
    if ($LASTEXITCODE -ne 0) { throw 'agent-sprites command failed' }
}
Invoke-Sprite new robot --size 16 --rows 1 --cols 2 --palette pico8
Invoke-Sprite draw rect --cell '0,0' --x 3 --y 3 --w 10 --h 10 --color '#c2c3c7' --name body
Invoke-Sprite draw rect --cell '0,0' --x 5 --y 6 --w 2 --h 2 --color '#1d2b53' --name eye_l
Invoke-Sprite draw rect --cell '0,0' --x 9 --y 6 --w 2 --h 2 --color '#1d2b53' --name eye_r
Invoke-Sprite clone-cell --from '0,0' --to '0,1'
Invoke-Sprite resize eye_l --cell '0,1' --updates '{"h":1}'
Invoke-Sprite resize eye_r --cell '0,1' --updates '{"h":1}'
Invoke-Sprite name --cell '0,0' --as robot_open
Invoke-Sprite name --cell '0,1' --as robot_blink
Invoke-Sprite group create blink '0,0' '0,1' --fps 2
Invoke-Sprite export --dest .\public\art
Invoke-Sprite view --sheet --scale 4 --out .\review\robot-contact-sheet.png
```

Inspect both frames in the contact sheet and play `Invoke-Sprite view-anim blink
--loops 3`. For a supplied `ops.json`, inspect its lifecycle/destination commands,
then use `Invoke-Sprite batch .\ops.json --json` instead of duplicating its build.

With dependencies installed, the sprite server starts on the first CLI call.
The UI at `http://localhost:3377` shows every operation. If another app owns that
port, set `$env:SPRITE_PORT = '3378'` to an unused port and use its matching URL.
A service identity mismatch fails clearly; leave the other application running.
Different ports do not isolate the shared session database.

For a separate workbench database, set `SPRITE_DB_PATH` to an absolute SQLite
file path before starting the server. The default remains
`~/.claude-sprites/session.db`. Tests supply a private temporary database per
test file, inherited by CLI-spawned servers, and remove it after shutdown.

For POSIX shells, run sequences with `set -e` and call `agent-sprites` directly.
For host-specific paths and setup, see [CLI setup](skills/sprite-editing/references/cli-setup.md).

### Batches and output files

- `batch ops.json` stops at the first failure; `--continue-on-error` attempts the
  remaining operations and still exits 1 when any operation fails.
- `--quiet` prints the final summary and artifact paths without successful-op
  chatter. `--json` emits one JSON summary with `ok`, `total`, `attempted`,
  `succeeded`, `failed`, `errors`, `session`, `artifacts`, and `exports`.
- `new --dest public/art` stores `public/art/<name>` as the session destination;
  `export --dest public/art` writes directly into `public/art` for that export.
- Edits are drafted automatically in SQLite. `save` explicitly writes project
  JSON, normally into the session destination. Omit `save` when assets should
  contain only `<name>.png` and `<name>.atlas.json`.

Do not publish outputs from a failed batch, even if some export operations ran.

### Rebuild a project's complete asset set

Keep one list of build configs, including character, suit and wardrobe variants,
instead of separate shell loops that can miss assets after a tool update:

```json
{
  "version": 1,
  "projects": [
    "asset-src/cast/sprite-project.json",
    "asset-src/player-suit/sprite-project.json",
    "asset-src/ui-font/sprite-project.json"
  ]
}
```

Save this as `sprite-projects.json`. Paths resolve relative to that list, while
each build config retains its own relative source and output paths.

```powershell
agent-sprites build-set ./sprite-projects.json --check --json
agent-sprites build-set ./sprite-projects.json --json
```

`--check` reads files without executing generators, starting a sprite server or
writing outputs. It exits 1 if any project needs attention and reports why: a
different tool version, changed inputs, missing artifacts, or legacy output
without provenance. Successful builds now record tool/version and SHA-256 input
hashes in `sprite-manifest.json`; existing manifest fields remain compatible.

`agent-sprites app-icons app-icons.json [--check]` builds the web app icon set (192 and 512 icons, maskable 512, apple-touch 180
without alpha, 16/32/48 favicons, `favicon.ico`, optional 1200x630 share card) from three tiles of a built tileset using whole-number
scales only; the config fields are in the game-integration skill.

To look at tiles composed into rooms, fence runs or icon boards, `agent-sprites tileset-preview layout.json --out sheets
[--scale N] [--night]` stamps built frames from a small JSON layout (autotile glyphs pick `<prefix>_<mask>` from
neighbours); see `examples/tileset/README.md`.

For tileset projects `--check` also parses the `.pxl` sources, so a row typed a
character short is reported as `source-invalid` with its file and line (status
`invalid`) instead of waiting for a rebuild. To check one project's sources
without building, run `agent-sprites build ./sprite-project.json --check [--json]`:
it lists every wrong-width row (file, line, tile, expected and actual width) and
unknown palette character, writes nothing, needs no server and exits 1 on any
problem, so it fits a CI step or a pre-commit hook.

The config and its ops file or generator script are tracked automatically.
Declare generator imports, palettes, source images and other dependencies in
the build config's optional `inputs` list (paths relative to that config):

```json
"inputs": ["../shared/palette.json", "./character-parts.mjs"]
```

Declare every external file that affects the result; imports are not discovered
automatically. Freshness checks compare recorded inputs and verify artifact
presence; they do not verify artifact contents or detect unreleased tool edits
under the same version. `verify` remains the atlas validation command.

Builds run in list order, so derived sheets can follow their base sheets. Each
project uses the existing isolated, verified publication path. A failure stops
the list and preserves that project's previous output; earlier successful
projects remain published and later projects are reported as skipped. Treat
the whole set as ready only when the command exits 0. Duplicate configs and
overlapping outputs/source directories are rejected before the first build.

Try the checked-in example with
`agent-sprites build-set examples/sprite-projects.json --json`, then run it with
`--check --json` to inspect the blink, font and skin outputs.

### Verify exported files

`Invoke-Sprite verify .\public\art\robot.atlas.json --expect-tags blink --contact-sheet review.png --report review.json --json`

For continuous-outline character art, add `--outline-colors "#39283f"` (0.22.0+).
The optional pixel check rejects exposed fill colors or translucent pixels along
the four-neighbor boundary of each distinct packed frame. It reports counts and
up to 16 packed-frame-local coordinates per failing rectangle. Multiple outline
tones may be comma-separated. Omit it for intentionally broken/no-outline styles.
Build configs can enforce the same check with `"outlineColors": ["#39283f"]`;
a contour failure preserves the last successful build.

Static art can declare its required frame aliases too:
`Invoke-Sprite verify .\public\art\garden.atlas.json --expect-frames seed,wingnut,planter --json`.
Frame names match exactly, including case. Missing names fail verification with
`missing-frame`; both array and JSON-hash Aseprite atlases are supported.

This offline command reads the actual PNG and atlas without contacting a sprite
server. It checks image dimensions, frame and trim bounds, unique names, positive
durations, animation ranges/directions, and required tags. It accepts repeated
rectangles. The nearest-neighbor contact sheet shows each unique source rectangle
once as a bordered card: the art on top and its label band directly beneath it
(name, `+N` for further aliases, and every atlas index that uses it, `#0,8,16`),
with a gutter between cards so a label always belongs to the art above it, in a roughly square grid; the report's `contactSheet` records
`tiles` and `frames`. Every frame is still validated.
Empty frames produce warnings. Structural failures return a nonzero exit code;
passing does not certify artwork, facing, or animation quality. Inspect the
contact sheet and play the animations before integrating them.

### Trace a reference into editable shapes

`Invoke-Sprite trace .\reference.webp --out .\reference-baseline --name reference --json`

Trace accepts a local static PNG or WebP and writes a **new** directory containing
an editable project, rendered PNG, Aseprite atlas, replayable `operations.json`,
pixel-comparison report and standalone preview. Open `reference.project.json`
with `Invoke-Sprite open` to edit it in the live browser UI. Tracing itself is
offline and leaves the active session untouched.

Every horizontal color run becomes a named filled rectangle; identical runs on
adjacent rows merge vertically. The tool retains the delivered image's resolution,
background and decoded 8-bit sRGB colors. It does not infer the original pixel
grid, remove backgrounds, quantize colors, or identify anatomical parts. A large
resampled reference can therefore produce thousands of shapes. Its portable
project loads directly; replaying that many operations through `batch` or `build`
is substantially slower.

Before publishing, trace decodes the actual rendered PNG and compares every pixel
with the decoded source. Invisible RGB at alpha zero is ignored. Canvas rounding
can change semitransparent RGB; such inputs fail without publishing a purported
exact baseline. Limits are 32 MiB input, 4 million pixels, 8192 pixels per side and
100,000 shapes. Animated inputs and existing output paths are rejected. Use a new
output directory for each variant; the source is never changed.

### Build a repeatable asset project

Copy `examples/blink` into your game project's source tree, then run
`Invoke-Sprite build .\asset-src\blink\sprite-project.json --json`.
Paths in the config resolve relative to that file, regardless of your shell's directory:

```json
{
  "version": 1,
  "ops": "operations.json",
  "output": "dist",
  "expectedTags": ["blink"],
  "expectedFrames": ["open", "closed"],
  "scale": 4
}
```

Use `"generator": "generate.mjs"` instead of `ops` for a Node script that writes
an operations array to stdout. Optional `args` is an array of string arguments;
the generator runs in the config directory, with a 60-second timeout. Run only
generators you trust: they execute as ordinary local code. Generator diagnostics
belong on stderr. Both inputs use existing batch operations, beginning with one
`new`; omit `save`, `export`, `ref`, and further `new` operations.

Build uses a fresh in-memory session and a temporary loopback API, independent of
your editing server and its database. Operations run sequentially through the
same routes over a reusable native HTTP connection. Isolated builds skip per-operation draft
snapshots and serialize the final editable project once; interactive sessions
continue to autosave each edit. It stages and structurally verifies all
outputs before publishing: PNG, Aseprite atlas, editable `.project.json`, labeled
contact sheet, verification report, captured operations, and `preview.html`.

Every build also writes `sprite-manifest.json`: `format`, `version: 1`, the project
`name`, its `source` (`ops`, `generator`, `character`, `environment`, `native`, `creature` or `ui`), the recipe
`kind` when it has one (for example `furniture` or `font`), the recipe `report` file, and a
`files` map using the same keys as the build's `artifacts` result (`sheet`, `atlas`,
`environmentReport`, `uiRuntime` and so on). Every name is relative to the manifest,
so a game can copy the output directory anywhere and load the sheet, atlas and report
from the manifest instead of guessing URLs from the recipe kind.
Open the self-contained preview directly in a browser to play tags at their
exported durations, pause, step, and zoom. Saved projects retain cell groups,
animation speeds, shape groups, names and pivots when reopened.

Optional `trim: true` publishes a trimmed atlas (opaque bounding boxes with real
`spriteSourceSize` offsets, the layout Phaser, Unity and Godot importers honor);
it needs a transparent background and is not available for UI builds. `export
--trim true` does the same for a live session.

Optional `expectedFrames` lists the exact static aliases your game consumes;
`expectedTags` lists its animations. Both default to no required names. Use these
contracts to catch a renamed or omitted crop, prop, or animation before integration.
A missing frame fails the staged build and leaves the previous export untouched.

Output must be a dedicated generated directory. Rebuilds replace only a directory
marked as owned by the same config, refuse extra files, and preserve the last
successful build on failure. A `.build-lock` beside the output prevents concurrent
builds; after a crashed process, confirm it has stopped before removing that lock.
Ownership follows the config's relative path from the output, so copying a project
and its output together preserves rebuilds when their layout stays the same.
Outputs created before 0.15.2 must be rebuilt once at their original location to
upgrade ownership before copying; otherwise choose a new output directory.
Configs and outputs on different Windows drives retain absolute ownership.
On Windows, transient `EPERM`, `EACCES`, and `EBUSY` errors during publication
renames receive up to five asynchronous retries (50, 100, 200, 400, and 800 ms).
The same bounded retry covers moving the previous output aside and restoring it
if publication fails. Other errors fail immediately. No destination is deleted
to force a rename; if restoration also fails, the error identifies the retained
backup directory so the previous build remains recoverable.
On Windows, build before starting the game dev server when possible. If these
retries exhaust, the previous output remains intact; the error identifies paths,
not the process holding them. Pause only a positively identified, authorized
related reader, rerun the build once, then resume it regardless of the result.
Preserve unknown shared services. If the retry still fails, inspect the path and
its handle owner; do not retry indefinitely or copy generated files into place.
The config plus ops/generator/character/environment source is canonical: edits to the generated project are
overwritten on rebuild. Copy it elsewhere before making a separate hand-edited variant.

For shared adult/child body profiles, expressions and suits, use the built-in
[`character` source](examples/character-cast/README.md). For non-humanoid animals, insects, arachnids,
birds and crawlers use the [`creature` source](examples/creature/README.md). Choose exactly one source:
`ops`, `generator`, `character`, `environment`, `native`, `creature`, `ui`, or `tileset`. No game-local generator is required.
For 16×32 Stardew-style costumes (wasteland motif library, tool-swing, watering, hurt and
collapse poses, presets), declare an inline [`native` source](examples/native-character/README.md#inline-native-build-source):
JSON only, no copied scripts. A game that ships the output sets `"omit": ["project", "operations",
"preview", "contactSheet"]` to publish just the sheet, atlas, manifest, report and playback runtime.
Review a true idle pose before judging a paused walk frame. The character report
includes profile shoulder/hip measurements and actual heel/ball/toe landmarks; its
neutral standing checks do not constrain moving feet to the same vertical line.
Paired anatomy, a separate pelvic mass, and heel/flat/toe shapes are shared across
the cast. Consume the exported stride and cadence for distance-driven playback;
profile contact is calibrated, while front/back views retain projected depth cues.
Follow the [character review procedure](examples/character-cast/README.md#review-and-iterate)
for separate raw blind reviews, guided measurement, silhouettes and playback.

For repeatable terrain, aligned pressure-habitat layers and furniture, use the
[`environment` source](examples/environment/README.md). It exports editable named
shapes plus `environment-report.json` with floor, door, wall and furniture collision
geometry. Games can consume that geometry alongside the atlas to keep walkable
space aligned with the art. Terrain recipes provide deterministic variants;
`terrain-transition` supplies 47 neighbor-aware path masks with rounded corners,
irregular shoulders and four seam-compatible variants. The wasteland set (dust, sand,
gravel, rubble, concrete, asphalt, ash, mud, slag, fused-glass, salt-crust, clay, animated water, tilled-soil and
tilled-soil-wet), inline `customMaterials`, and `terrain-overlay` (alpha-edged 47-mask encroachment overlays plus base
tiles from one build, optionally with a 1 px lit rim, rounded concave corners and rimless `-soft` twins via `overlayEdge`) give an open-ended ground sandbox; see
[wasteland terrain](examples/environment/README.md#wasteland-terrain-custom-materials-and-overlays). The
habitat kit offers cottage, workshop, kitchen and barn styles with distinct roof
silhouettes and matching interiors, alongside the historical default pressure
vessel. Each style keeps the same reported navigation geometry.

For regular grids of tiles, props, item icons and crop growth stages, use the [`tileset` source](examples/tileset/README.md):
plain-text `.pxl` art, recolour templates, animations and procedural 47-mask wall, floor and roof sets in selectable
materials, with a name-to-index report.

For bitmap text and reusable nine-slice controls, use the [`ui` source](examples/ui/README.md).
Font and skin recipes export editable named pixel rectangles, tone variants, metrics,
`ui-report.json`, and a portable `ui-runtime.mjs` compositor that draws atlas images
without platform fonts. Font builds also publish `font-proof.png` (every glyph in all
four tones at 3×, then wrapped multiline sample text, drawn through the portable
runtime) with `font-proof.json` glyph boxes, and an embedded `ui-boot.mjs` for
loading/error UI. For Phaser `BitmapText`, `resolveFontText` maps unsupported display
characters to the exported fallback; keep the original string for storage and game
semantics. Message skin families include `message` (utility), `speech`, `specimen`,
`specimen_mount`, `specimen_label` (mint label with ink text), `note` (paper),
`notification`, and `warning`. Their report metrics include six-pixel fixed
insets, twelve-pixel content padding, minimum dimensions, and `textTone`.
Use the exported metrics for layout at your integer display scale. The separate
`scrim_solid` frame is opaque pixel art; composite it at its reported `opacity`
(0.48) to quiet the world behind a dialog. Historical skin frames and regular /
compact font colors remain unchanged. A third `face: "display"` gives 2× logo and banner lettering, `kind: "logo"` builds a ready-made stacked title logotype (sun, wheat, lit lettering), every font draws symbols (heart, skull, check, star, moon, bolt, drop, wheat, lock) inline, the wasteland skin adds colour `sym_*` icons, and sheets pack near-square (`verify --max-aspect`). The portable runtime also exports
`getOpaqueBounds(imageData)` and pure `pixelFit(bounds, destination, {padding})`
to crop transparent padding and center artwork at a uniform integer scale.
`pixelFit` returns `{x, y, width, height, scale}` for native engines such as Phaser
without requiring a Canvas context. `drawPixelFit(ctx, image, bounds, destination,
{padding})` draws with the same fit. Empty art and boxes too small for 1× return
`null`; no fractional shrinking or overflow is introduced.

UI output may live in a game's `public/` directory as URL-served assets. Bundled
source should load its JSON/reports through Phaser's loader/cache and import one
unchanged generated `ui-runtime.mjs` vendored outside `public/` by the checked
asset-build script. `resolveFontText`, `pixelFit` and `getOpaqueBounds` are pure
helpers; native Phaser `BitmapText` and `NineSlice` remain the visible UI renderer.
See the [bundler layout and Phaser cache examples](examples/ui/README.md#bundlers-and-public-assets).

Custom Node generators can return `{operations, report}` with a UI `kind` of
`font`, `skin`, or `logo`, using the same report shape as the inline recipe. They
publish `uiReport`, `uiRuntime`, `uiPhaser`, and (for fonts) proof/bootstrap artifacts.
Reports declare `cellSize` and named `frames` with source-cell ink `bounds`
(`left,top,right,bottom`). The build checks those bounds against actual atlas pixels
before replacing owned output. `trim:true` preserves source offsets in native font
data; skins export the cropped `source` size/offset beside their insets.
Font reports can declare `tones:{name:'#rrggbb'}` and a frame for every tone of
every non-space glyph. Names, advances, aliases, bounds and palette pixels are
validated. Omit `tones` to retain the standard four tones. Phaser exports also
carry `cell`, pure per-character `metrics`, and `colors`, so consumers share
measurement data without estimating ink from texture cells. Layout policies
such as trailing spacing and shadow padding remain the game's responsibility.
Font `baseline` must be an integer inside both the source cell and line height.
Skin `content` is optional: either a positive `{x,y,w,h}` rectangle relative to
the cropped atlas frame, or nonnegative `{left,right,top,bottom}` interior insets
with an optional positive `capWidth` leaving a repeatable middle. Unknown content
shapes reject. Panel minima must leave room between the fixed border insets.
Logo reports contain exactly one named `logo` frame.

Grid dimensions have no product policy caps: use positive safe
integers with exactly representable sheet arithmetic. Available memory and the
underlying image renderer determine which sheets can actually be allocated.

For the older four-beat courier example, copy [`examples/character-walk`](examples/character-walk/README.md).
Its four-beat 24×32 courier walk has coordinated anatomical limbs, contact/pass
poses, a planted baseline and restrained bob. Adjust stride, fps and colors in
`character.json`, then run one build to inspect the atlas, contact sheet and
playable preview. All generated parts remain editable named shapes.

### Invocable skills

With the optional plugin installed, `/sprite-new bouncer 32 1x8 db-32` starts a
project. These native skills call the same managed CLI:

| Skill | What it does |
|---|---|
| `/sprite-new` | Create a project (cell size, grid, palette) |
| `/sprite-open` | Reopen a stored project (SQLite-persisted) |
| `/sprite-export` | Export sheet PNG + Aseprite JSON atlas |

## Skills

| Skill | Craft it carries |
|---|---|
| `sprite-setup` | External CLI installation, npm linking, dependency checks and plugin/CLI/server version sync |
| `sprite-editing` | Full tool workflow: drawing, shape editing, groups, animation, export |
| `sprite-character` | Anime/16-bit RPG characters: adult/child proportions, faces, hair, outfits and consistent front/profile studies |
| `sprite-shading` | Multi-tier lighting (form/core shadow, rim, spec), pillow-shading anti-pattern |
| `sprite-motion` | Squash/stretch, shadow-as-elevation, timing, key poses |
| `sprite-palette` | Palette selection, ramp-aware base colors, headroom |
| `sprite-craft` | Expert craft rules and critique order: silhouette, value, outlines, clusters, dithering, small-sprite motion |
| `sprite-review` | Scores art against a written rubric, with an evidence kit, and writes a prioritized remediation plan |
| `sprite-composition` | Draw order discipline, naming conventions, sheet layout |
| `game-integration` | Wiring exports into Phaser/Unity/Godot, full-game asset builds, app icons |
| `sprite-verification` | Source-cell and atlas checks, per-frame inspection, animation review |

Agents can read the relevant `skills/<name>/SKILL.md` directly. The editing skill
explains invocation without requiring Claude-specific environment variables;
the art skills complement it. CSS/SVG logo animation does not need these tools.

## Architecture

- `server/engine/` — canvas/cell/shape/palette model; PNG + terminal renderers
- `server/handlers/` — tool handlers (draw, cell, shape, history, view)
- `server/web/` — Express 5 API + vanilla-JS live web UI
- `server/db/` — better-sqlite3 persistence
- `scripts/sprite.js` — CLI entry; thin mapper to the HTTP API; auto-starts the server
- `skills/`, `recipes/` — reusable agent guidance and build inputs
- `skills/sprite-new`, `skills/sprite-open`, `skills/sprite-export` — optional Claude Code shortcuts

## Development

```
npm install
npm test        # vitest — engine, handlers, CLI, web API, DB, browser UI (jsdom)
npm start       # run the server directly
```

## License

MIT

### Selectable reference skin tones

The [reference-grid example](examples/reference-grid/README.md) can deconstruct
striped palette demonstrations into skin shading groups. Open a normalized
project and use **All palettes > Skin tone** to apply any of seven ramps across
all poses, preserving eyes and geometry. `skin-tone <tone>` provides the same
operation from the managed CLI. Unprepared designs are not automatically
classified; generate the role groups first. Tone edits survive saves and copies,
with one undo step per affected cell.

### Previewing sheets without animation tags

In the live **Preview** tab, choose **Current row**, **All cells**, **Current cell**,
or a saved animation group from **Sequence**, then press **Play**. Current row is
the default, so an untagged pose sheet can be reviewed in motion. Selecting a cell
in another row changes that row preview. Saved groups retain their frame order,
repeated frames and FPS. These preview choices do not create exported animation
tags; use animation groups when defining a finished animation.
