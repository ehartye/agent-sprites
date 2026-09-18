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

```
/sprite-new bouncer 32 1x8 db-32
```

Then ask Claude to draw. The sprite server auto-starts on the first CLI call (port 3377, override with `SPRITE_PORT`); the web UI at `http://localhost:3377` shows every operation live.

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

## Architecture

- `server/engine/` — canvas/cell/shape/palette model; PNG + terminal renderers
- `server/handlers/` — tool handlers (draw, cell, shape, history, view)
- `server/web/` — Express 5 API + vanilla-JS live web UI
- `server/db/` — better-sqlite3 persistence
- `scripts/sprite.js` — CLI entry; thin mapper to the HTTP API; auto-starts the server
- `skills/`, `commands/`, `recipes/` — the Claude-facing plugin surface

## Development

```
npm install
npm test        # vitest — engine, handlers, CLI, web API, DB, browser UI (jsdom)
npm start       # run the server directly
```

## License

MIT
