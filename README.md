# agent-sprites

A pixel-art sprite authoring toolset for coding agents and 2D game projects, with a CLI, a live web UI, and a Claude Code plugin. Human collaborators watch and edit through the web UI while their agent works the CLI.

Built and battle-tested by shipping real games with it (SNES-style dungeon crawlers, a rhythm brawler) — every tool exists because a real build needed it.

## The core idea

Sprites are **named parametric shapes** (circle `ball`, rect `bg`), not raw pixel buffers. Shapes carry z-order, live in grid cells, support per-cell undo/redo, and are addressable by name for later edits (`move-to`, `recolor`, `resize`, `clone`, `flip`, `rotate`, `tween`). This gives an LLM semantic handles instead of pixel coordinates — the affordance that makes agent-driven pixel art tractable.

## Highlights

- **Reusable characters** — a built-in JSON character source fits adult/child bodies, multipart expressive faces, eight-pose walks and three pressure-suit families; exports remain named editable shapes with an anatomical report. See [character recipes](examples/character-cast/README.md).

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

### Verify exported files

`Invoke-Sprite verify .\public\art\robot.atlas.json --expect-tags blink --contact-sheet review.png --report review.json --json`

Static art can declare its required frame aliases too:
`Invoke-Sprite verify .\public\art\garden.atlas.json --expect-frames seed,wingnut,planter --json`.
Frame names match exactly, including case. Missing names fail verification with
`missing-frame`; both array and JSON-hash Aseprite atlases are supported.

This offline command reads the actual PNG and atlas without contacting a sprite
server. It checks image dimensions, frame and trim bounds, unique names, positive
durations, animation ranges/directions, and required tags. It accepts repeated
rectangles and labels every atlas entry in the nearest-neighbor contact sheet.
Empty frames produce warnings. Structural failures return a nonzero exit code;
passing does not certify artwork, facing, or animation quality. Inspect the
contact sheet and play the animations before integrating them.

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
your editing server and its database. It stages and structurally verifies all
outputs before publishing: PNG, Aseprite atlas, editable `.project.json`, labeled
contact sheet, verification report, captured operations, and `preview.html`.
Open the self-contained preview directly in a browser to play tags at their
exported durations, pause, step, and zoom. Saved projects retain cell groups,
animation speeds, shape groups, names and pivots when reopened.

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
The config plus ops/generator/character source is canonical: edits to the generated project are
overwritten on rebuild. Copy it elsewhere before making a separate hand-edited variant.

For shared adult/child body profiles, expressions and suits, use the built-in
[`character` source](examples/character-cast/README.md). Choose exactly one source:
`ops`, `generator`, or `character`. No game-local generator is required.

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
| `sprite-shading` | Multi-tier lighting (form/core shadow, rim, spec), pillow-shading anti-pattern |
| `sprite-motion` | Squash/stretch, shadow-as-elevation, timing, key poses |
| `sprite-palette` | Palette selection, ramp-aware base colors, headroom |
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
