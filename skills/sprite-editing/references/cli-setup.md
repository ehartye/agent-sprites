# Managed CLI setup and invocation

Every sprite skill uses the managed CLI installed by [sprite setup](../../sprite-setup/SKILL.md).
Run setup on first use and after a plugin update. It installs outside the plugin cache,
links the CLI, and checks plugin/CLI/server version sync. Never use a bare PATH
`agent-sprites`, a checkout's `scripts/sprite.js`, or the plugin-cache CLI for skill work.

Resolve the plugin root from the loaded skill's actual path, two directories above
its containing skill directory. Invoke that plugin's `scripts/run-managed.js` by
absolute path. The launcher validates the matching managed release; it never falls
back to another install. Setup is `node "<plugin-root>/scripts/setup.js"`; its
read-only check is `node "<plugin-root>/scripts/setup.js" --check --json`.

Run from the game/project directory so relative input/output paths resolve there.
This PowerShell helper stops a workflow when a native command fails:

```powershell
$spritePluginRoot = 'C:\actual\installed\plugin\root'
$spriteLauncher = Join-Path $spritePluginRoot 'scripts/run-managed.js'
function Invoke-Sprite {
    node $spriteLauncher @args
    if ($LASTEXITCODE -ne 0) { throw 'agent-sprites command failed' }
}
Invoke-Sprite batch .\ops.json --json
Invoke-Sprite export --dest .\public\art
Invoke-Sprite view --sheet --scale 4 --out .\review\contact-sheet.png
```

For POSIX shells, use `set -e` before sequences, then
`node "/actual/plugin/root/scripts/run-managed.js" <command> ...`.
Claude Code's supplied plugin path can locate the launcher:
`node "$CLAUDE_PLUGIN_ROOT/scripts/run-managed.js" <command> ...`.
In PowerShell, use `$env:CLAUDE_PLUGIN_ROOT` only when it actually exists.
Other hosts can resolve the path from their loaded skill location.

Inspect `ops.json` before replay: it may already create the session, export, or
call `save`. Avoid duplicate lifecycle steps. `save` writes project JSON;
automatic SQLite drafts do not require it. Omit `save` when assets should contain
only PNG and atlas. Quote comma-separated coordinates in PowerShell functions:
`Invoke-Sprite name --cell '0,0' --as idle`.

## Ports and service identity

The default port is 3377. For an unused alternate port, set
`$env:SPRITE_PORT = '3378'` in PowerShell (or `export SPRITE_PORT=3378` on POSIX)
for setup checks and every CLI call. Use the matching browser URL.

A running server must match the managed runtime's package version and installation
root as well as the service protocol. Mismatches fail before drawing. Setup reports
the mismatch and never stops an existing server. Stop a known old server when safe
and authorized, or choose an unused port; do not shut down an unidentified app.

Ports isolate HTTP endpoints, not storage: sessions still share
`~/.claude-sprites/session.db`. Use `open --session <name-or-id>` to select the
intended saved session. `AGENT_SPRITES_HOME`, if set, must stay consistent between
setup and launch; it affects the managed runtime, not the existing session database.
