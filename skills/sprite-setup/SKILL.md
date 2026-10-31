---
name: sprite-setup
description: Install, npm-link, update, and check version sync for the agent-sprites CLI outside the plugin cache. Use for first-time sprite setup, after plugin updates, or when the managed runtime, native dependencies, npm link, or server version is missing or mismatched.
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

## Reading the check report

The check report says which npm and Node ran and which stage failed. Fields:

- `node`: version of the Node.js that ran setup.
- `npm`: version of the npm that setup uses, read from the npm install that
  `npmExecpath` points at; `null` if it cannot be read.
- `prefix`: npm's global prefix (`npm prefix --global`); `null` if the check did not
  get that far.
- `npmExecpath`: the `npm-cli.js` setup runs. An inherited `npm_execpath` is used
  when it points at a real `npm-cli.js`, so a different npm than the one on PATH is
  named here instead of being trusted silently. Check it when a link lands in an
  unexpected prefix. `null` if no npm was found.
- `runtimeOk`: the managed release resolved, its content matches this plugin, and
  its native dependencies load.
- `linkOk`: the npm link points at that managed release.
- `boundary`: present only when something failed. One of `runtime` (release missing
  or not installable), `dependencies` (native dependency load failed), `link` (npm
  link stale, missing, or npm could not report it) or `version` (plugin, package or
  lockfile versions disagree, the release was modified, or the running server does
  not match).
- `ok`: unchanged and strict. True only when dependencies load, the link matches,
  there are no errors, and any running server matches. A healthy runtime with a
  stale link gives `runtimeOk: true`, `linkOk: false`, `ok: false` and exit 1.

```json
{
  "ok": false,
  "runtimeOk": true,
  "linkOk": false,
  "node": "v24.18.0",
  "npm": "11.16.0",
  "prefix": "<npm-global-prefix>",
  "npmExecpath": "<path-to-npm-cli.js>",
  "linked": false,
  "dependencies": true,
  "errors": ["npm link points elsewhere or is missing; rerun sprite-setup"],
  "boundary": "link"
}
```

The example omits the version, path and fingerprint fields. Setup still requires
`ok: true`; the split only tells you which stage to repair. Exit codes are
unchanged.

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
