# Friction fixes — design

Integration testing identified four CLI/export friction points. The specifications below
address them independently, with focused verification for each change.

## 1. Export destination control

**Problem.** `new` stamps `destination_folder` and `project_path` from the *server
process* cwd. A server left running from another repo silently exports there.

**Spec.**
- CLI `new` sends `cwd: process.cwd()` (the CLI caller's directory) and, optionally,
  `dest` from a new `--dest <folder>` flag (CLI resolves it to absolute).
- Server `/api/session/new`: `destination_folder = dest ? join(dest, name)
  : join(cwd ?? process.cwd(), 'assets', 'claude-sprites', name)`; `project_path`
  likewise prefers the CLI cwd. `--dest` is the *parent* folder — the project still
  gets its own subfolder.
- CLI `export --dest <folder>` sends a one-off override; the server writes the PNG +
  atlas into exactly that folder for this export only (session record unchanged).

## 2. Project switching / sessions

**Problem.** One active project; `new` switches away; no way back without a
hand-`save`d JSON file.

**Spec.**
- DB: `listSessions(limit = 20)` → `[{id, project_name, created_at, updated_at}]`
  newest-first; `findSessionByName(name)` → most recently updated match.
- Routes: `GET /api/session/list`; `POST /api/session/open-session {ref}` — `ref`
  matched as session id first, then project name. Loads `draft_json` into the live
  project, restores `sessionId`, rebuilds cell groups from SQLite, broadcasts.
  Errors: unknown ref; session without a draft.
- CLI: `sessions` (prints `id  name  updated`); `open --session <name|id>`
  (file-path `open <path>` unchanged).

## 3. Batch-mode parity

**Problem.** A full asset build can't be one batch file: `new`, `clone-cell`,
`pivot`, `ref`, `group fps`, shape-group ops, `save`, `export` are missing from the
batch mapper, and `group create` drops `fps`.

**Spec.** Extend `mapCommandToApi` with: `new` (incl. `WxH` size strings, `dest`,
CLI-cwd injection), `clone-cell` (`to` as array or space-separated string), `pivot`,
`ref` (`sub: set|clear`, relative paths resolved against the CLI cwd), `group fps`
sub-command plus `fps` forwarding on `group create`, `shape-group`
create/add/remove/delete, `move-group`, `recolor-group`, `save`, and `export`
(with optional `dest`). `describeBatchCommand` labels for each. Explicitly out of
scope: `tween` (multi-call client-side algorithm) and `view`/`view-anim`
(interactive output) — documented in the tool reference.

## 4. Upscaled PNG views

**Problem.** Judging 16px art from 1:1 renders requires external upscaling.

**Spec.**
- `CanvasRenderer.renderCell/renderCells/renderSheet` accept `scale` (int 1–32,
  default 1): render at 1x, then nearest-neighbor blit onto a scale-multiplied
  canvas (`imageSmoothingEnabled = false`).
- `/api/cell/view` accepts `scale` (PNG format only). New `GET/POST /api/view/sheet`
  route (the sheet handler existed but was never routed) with `scale`.
- CLI: `view --cell R,C --png --scale 8`; `view --sheet [--scale N]` renders the
  whole sheet to a temp PNG and prints the path.
- Docs note (tool reference, export section): the exported pivot slice is consumed
  by Unity/Godot importers; Phaser ignores slices — set `setOrigin` in code.
