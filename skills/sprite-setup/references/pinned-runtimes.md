# Pinned build and review runtimes

Use this when a project deliberately selects distinct pinned plugin releases.
Obtain trusted immutable sources first: version strings do not establish release
provenance. Preserve original source trees and existing project assets.

Run the current setup script against each absolute pinned source:

```text
node "<current-plugin>/scripts/setup.js" --managed-only --source "<absolute-pin>" --expect-version "<exact-version>" --json
node "<current-plugin>/scripts/setup.js" --managed-only --source "<absolute-pin>" --expect-version "<exact-version>" --check --json
```

Both selectors require each other and `--managed-only`. Expected version is checked
before installing or repairing anything. The route installs native dependencies
outside the source, checks fingerprint, installed content, native bindings and
server identity, and never queries or changes the global npm link. `--check` is
read-only. Without selectors, `--managed-only` qualifies the current plugin.

Require exit zero, `ok: true`, `qualification: "managed-launcher"` and
`runtimeOk: true`. `linkRequired: false` and `linkOk: null` mean the global link was
not checked. Invoke the reported absolute `launcher` with Node, preserving the
reported `AGENT_SPRITES_HOME` and `SPRITE_PORT`. Record full fingerprint, version,
sourceRoot and runtimeRoot. Never substitute PATH or a checkout CLI.

Use distinct ports for an offline builder and running reviewer. A server from
another version or managed root fails qualification; setup never stops it. Ports
do not isolate storage: use separate `SPRITE_DB_PATH` values for independent
sessions. Build into disposable outputs when qualifying a pin, preserving assets.

The managed identity layout is verified with releases 0.99.0 and 0.101.1; other
historical layouts are not promised compatible. Pins must include their original
managed launcher and identity helpers; unsupported helper policies are rejected
before installation or repair. After qualification, run that launcher
with `--version` and verify the expected version. Failure is a stop, not permission
to relink or fall back. Ordinary setup may correctly report a stale global link
while this explicitly selected route succeeds.
