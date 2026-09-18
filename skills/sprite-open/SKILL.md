---
name: sprite-open
description: Find and reopen a saved agent-sprites session. Use when resuming a previous sprite project by name or ID.
---

Reopen an earlier sprite project. Usage: /sprite-open [name or id]

Load the sprite-setup skill and complete its version sync check before first use or after a plugin update. Do not fall back to a PATH or checkout CLI.

Projects persist automatically in SQLite — no save file to hunt for. Run:

```
node "<plugin-root>/scripts/run-managed.js" sessions
```

to list recent projects (id, name, last updated). If the user gave a name or id, open it directly; otherwise show the list and ask which one:

```
node "<plugin-root>/scripts/run-managed.js" open --session <name|id>
```

Cell groups, shape groups, and pivot come back with the project. Load the `sprite-editing` skill before making edits.

Resolve <plugin-root> from this loaded skill's directory (two parents up), not from PATH or the current project. Follow [sprite setup](../sprite-setup/SKILL.md) and use the absolute managed launcher. For PowerShell invocation, read [CLI setup](../sprite-editing/references/cli-setup.md).
