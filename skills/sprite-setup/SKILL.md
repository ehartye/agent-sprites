---
name: sprite-setup
description: Install, link, update, and check version sync for the agent-sprites CLI outside the plugin cache. Use for first-time sprite setup, after plugin updates, or when the managed runtime, native dependencies, CLI link, or server version is missing or mismatched.
---

# Agent Sprites Setup

Install the CLI from this plugin's runtime snapshot into `~/.agent-sprites/releases/`,
then link it with npm. Node.js and npm must already be available. Never install
dependencies in the plugin cache or link a development checkout for skill use.

## Setup and version sync

Resolve the plugin root from this loaded file: two directories above its containing
`sprite-setup` directory. Confirm `scripts/setup.js` exists there. Use its absolute
path; do not infer the root from the current project or a PATH executable.

1. Run the read-only version sync check:
   `node "<plugin-root>/scripts/setup.js" --check --json`.
2. If the managed runtime, dependencies, or npm link need setup, run:
   `node "<plugin-root>/scripts/setup.js" --json`.
   This copies the matching runtime outside the cache, installs lockfile dependencies
   with `npm ci --omit=dev`, exercises the native bindings, and runs `npm link`.
   Stop on failure; do not fall back to another installation.
3. Run the version sync check again. Require exit 0 and `ok: true`. Report the
   plugin/CLI version, managed runtime path, linked target, and server status.

The release identity includes the plugin package version, runtime content hash,
platform and Node ABI. The check also compares plugin/package/lockfile versions,
installed content, native dependency loading, npm link target, and any running
server's version and installation root. A stopped server is valid; the next sprite
operation starts the matching one. Repeating setup reuses a complete matching
install and repairs its link. Older releases and saved sprite sessions are retained.

If the server is mismatched, setup reports it and exits nonzero. Do not send drawing
commands or silently restart it. Stop the known old sprite server when safe and
authorized, or select an unused `SPRITE_PORT` for the workflow, then rerun the check.
Different ports still share the session database; explicitly open the intended
session. A locked setup or modified release needs inspection, not blind deletion.

The default managed home is `~/.agent-sprites`. An existing `AGENT_SPRITES_HOME`
override is honored by both setup and launch; keep it consistent and outside the
plugin/checkout. npm uses its configured global prefix. If the report includes
`pathHint`, the bare shell command needs that directory on the user's PATH; skill
execution still uses the checked launcher below. Do not use elevated npm as a
workaround for an unwritable prefix.

## Required invocation for every sprite skill

Run operations through the absolute launcher from the loaded plugin:

```text
node "<plugin-root>/scripts/run-managed.js" <command> ...
```

It selects and validates the managed release matching this plugin, then runs its
CLI with the original arguments and project working directory. It never chooses a
PATH executable, checkout CLI, or the CLI inside the plugin cache. A missing or
modified release fails with setup instructions. The installed CLI also refuses a
server from another version or installation before sending operations.

In other skills, `sprite.js` is shorthand for this launcher, not a literal script
path or command on PATH. For checked PowerShell and POSIX invocation examples,
read [CLI setup](../sprite-editing/references/cli-setup.md).
