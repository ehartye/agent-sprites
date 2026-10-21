# ASCII region editing

Read before changing a few pixels of an existing frame. Use the matching managed
launcher from the parent skill. Bounds are exact integers inside the cell;
each read or patch is limited to 4096 pixels. Rows preserve spaces and must be
rectangular. Readback uses exported pixel rules and excludes tracing references.

```text
sprite.js ascii read --cell 0,0 --x 4 --y 3 --w 6 --h 3 --json
sprite.js ascii patch --cell 0,0 --file face-patch.json --json
sprite.js undo --cell 0,0
sprite.js redo --cell 0,0
```

For an existing shared browser session, set `SPRITE_PORT` to its port, inspect
`status`, and add `--session <session-id>` to both ASCII commands. A concurrent
session switch then rejects the command before read or mutation. Do not create or
open another design to patch the current one. Check the result before continuing.

Read returns `rows`, `colors`, region bounds and `unmapped` coordinates with exact
RGBA values. With no supplied colors it assigns printable characters to the first
62 opaque RGB project palette entries. Other colors remain explicit unmapped
pixels. Use `--colors '{"R":"#ff0000","B":"blue"}'` for an
explicit map. Palette names resolve to opaque six-digit RGB; unknown names and
alpha colors are rejected in patch maps. Duplicate mapped colors read back as
their first character.

Three reserved symbols have fixed meanings:

| Symbol | Read | Patch |
|---|---|---|
| `.` | Never emitted | Keep the existing pixel |
| `_` | Transparent pixel | Erase artwork at that pixel |
| `?` | Unmapped or partially transparent pixel | Rejected; resolve it explicitly |

Map unknown colors explicitly and re-read, or replace each `?` with `.` to retain
it. Never silently map unknowns to transparency. Erase punches through artwork
below the patch; a configured chroma export background remains visible. A space
can be a mapped character. Do not trim or indent pixel rows.

Example `face-patch.json`:

```json
{
  "x": 4,
  "y": 3,
  "prefix": "face-detail",
  "rows": [".BB...", "R..R__", "......"],
  "colors": {"R": "#ff0000", "B": "#0000ff"}
}
```

Patches paint named point overlays such as `face-detail:5,3`, preserving underlying
shapes. Reusing the prefix at those coordinates revises its owned points with
stable IDs; it rejects a collision with an unrelated shape. Shapes painted later
can cover a patch. Inspect the result and undo the patch once to revert the whole
edit, including large patches. An all-keep patch adds no undo entry. Undo history
does not survive project reloads; editable shapes and patch ownership do.

Expanded batch form:

```json
{"command":"ascii","sub":"patch","cell":"0,0","x":4,"y":3,"prefix":"face-detail","rows":[".BB...","R..R__","......"],"colors":{"R":"#ff0000","B":"#0000ff"}}
```

Use `sub: "read"` with `x,y,w,h` for batch readback in the report's `results` entries.
The browser ASCII tab supplies
coordinates, readback, color JSON, unmapped diagnostics and patch application;
changing the selected cell, session or bounds requires another read.
