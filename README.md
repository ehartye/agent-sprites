# agent-sprites

A pixel-art sprite authoring toolset for coding agents and 2D game projects, with a CLI, a live web UI, and a Claude Code plugin. Human collaborators watch and edit through the web UI while their agent works the CLI.

Built and battle-tested by shipping real games with it (SNES-style dungeon crawlers, a rhythm brawler) — every tool exists because a real build needed it.

## The core idea

Sprites are **named parametric shapes** (circle `ball`, rect `bg`), not raw pixel buffers. Shapes carry z-order, live in grid cells, support per-cell undo/redo, and are addressable by name for later edits (`move-to`, `recolor`, `resize`, `clone`, `flip`, `rotate`, `tween`). This gives an LLM semantic handles instead of pixel coordinates — the affordance that makes agent-driven pixel art tractable.

## Highlights

- **Lighting automation** — `highlight` / `shadow` / `sphere-shade` place ramp-aware lighter/darker pixels along curved arcs inside the form (with optional `--dither`), compensating for the thing LLMs are worst at: hand-placing individual pixels
- **Feedback loop** — `view` renders any cell/group/sheet to PNG (`--scale` for nearest-neighbor upscales, `--out` to a chosen path) that the agent reads back; the web UI mirrors every operation in real time over WebSocket
- **Game-ready export** — gapless sheet PNG + Aseprite JSON atlas (`meta.frameTags` from cell groups, per-frame durations from group fps, pivot slice). Phaser, Unity, and Godot importers consume it directly
- **Batch mode + recipes** — JSON op arrays with `{{var}}` substitution and per-frame vars files; generate large builds from a small JS script (see `recipes/` and the `game-integration` skill)
- **Animation** — cell groups with fps, server-side `tween` with easing, cell mirror/rotate for direction variants, repeated cells for 4-beat walk cycles
- **Palettes** — pico8, gameboy, nes, cga; ramp-aware: pico8, db-16, db-32

## Install

### CLI for Codex, Claude Code, other agents, and people

Clone this repository, then run the following in its directory. This installs
from source and links the local `agent-sprites` executable; no npm registry
package is required.

```powershell
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
npm link
if ($LASTEXITCODE -ne 0) { throw 'Local CLI linking failed' }
```

The server depends on native `canvas` and `better-sqlite3` modules. Resolve any
installation errors before starting a build. Without linking, invoke
`node /absolute/path/to/agent-sprites/scripts/sprite.js` from your project directory.

### Optional Claude Code plugin

```
/plugin marketplace add ehartye/agent-sprites
/plugin install agent-sprites@agent-sprites
```

Then install the server's dependencies (native modules: canvas, better-sqlite3) inside the installed plugin directory:

```
npm install --prefix <plugin-install-dir>
```

The CLI tells you the exact path if you skip this step.

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

### Claude Code shortcuts

With the optional plugin installed, `/sprite-new bouncer 32 1x8 db-32` starts a
project. These shortcuts call the same CLI:

| Command | What it does |
|---|---|
| `/sprite-new` | Create a project (cell size, grid, palette) |
| `/sprite-open` | Reopen a stored project (SQLite-persisted) |
| `/sprite-export` | Export sheet PNG + Aseprite JSON atlas |

## Skills

| Skill | Craft it carries |
|---|---|
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
- `commands/` — optional Claude Code shortcuts

## Development

```
npm install
npm test        # vitest — engine, handlers, CLI, web API, DB, browser UI (jsdom)
npm start       # run the server directly
```

## License

MIT
