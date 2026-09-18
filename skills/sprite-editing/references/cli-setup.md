# CLI setup and invocation

Resolve paths from the loaded skill, not from the game's working directory.
The repository/plugin root is two directories above `sprite-editing/SKILL.md`'s
directory. Its CLI is `scripts/sprite.js`. Confirm that file exists before use.

## Any coding agent: checkout installation

In the discovered checkout, install the lockfile dependencies with `npm ci`, then
`npm link` to expose `agent-sprites` on PATH. This is a local installation from
source, not a claim that an npm registry package is published. The server uses
native `canvas` and `better-sqlite3` dependencies; a failed installation must be
resolved before starting a sprite build.

PowerShell (replace the root with the actual discovered path):

```powershell
$spriteRoot = 'C:\path\to\agent-sprites'
Push-Location $spriteRoot
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
    npm link
    if ($LASTEXITCODE -ne 0) { throw 'Local CLI linking failed' }
} finally { Pop-Location }
```

Run from the game/project directory so relative input/output paths resolve there.
For a linked install, `agent-sprites <command> ...` is the entry point. Without
linking, use the absolute Node script path. This PowerShell helper also stops a
multi-command workflow when a native command fails:

```powershell
$spriteCli = Join-Path $spriteRoot 'scripts/sprite.js'
function Invoke-Sprite {
    node $spriteCli @args
    if ($LASTEXITCODE -ne 0) { throw 'agent-sprites command failed' }
}
Invoke-Sprite batch .\ops.json --json
Invoke-Sprite export --dest .\public\art
Invoke-Sprite view --sheet --scale 4 --out .\review\contact-sheet.png
```

Inspect `ops.json` before replay: it may already create the session, export, or
call `save`. Avoid duplicate lifecycle steps. `save` writes project JSON;
automatic SQLite drafts do not require it. If project JSON must stay out of
assets, omit `save` from both commands and ops.

POSIX shells can use `set -e` before a sequence, then
`node "/absolute/path/to/agent-sprites/scripts/sprite.js" <command> ...`.
In Claude Code, its supplied plugin path remains supported:
`node "$CLAUDE_PLUGIN_ROOT/scripts/sprite.js" <command> ...`.
For PowerShell use `$env:CLAUDE_PLUGIN_ROOT` only when that environment variable
actually exists; Codex need not supply it.

## Ports and service identity

The default port is 3377. If occupied by another app, choose an unused port and
set it before every CLI process in that workflow:

```powershell
$env:SPRITE_PORT = '3378'
```

Use the matching browser URL, `http://localhost:3378`. The CLI rejects a service
identity mismatch; do not issue sprite shutdown against an unrelated app.
Changing the port separates HTTP endpoints, not SQLite storage: sessions still
share `~/.claude-sprites/session.db`. Startup resumes the latest saved draft;
use `open --session <name-or-id>` to select an explicit session. An older server
without the identity marker is also rejected: stop that known old instance
manually or choose an unused port, then let the new CLI start its server.
