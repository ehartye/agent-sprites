# Reusable part composition

Copy this folder into an asset project, then use the matching managed launcher:

```text
sprite.js build sprite-project.json --json
```

`composition.json` is the canonical editable declaration. The generator combines
one hero stamp, a flower tile, a grass tile and explicitly seeded pebble scatter.
The build records the declaration as an input, verifies exported pixels, and
publishes an editable project, PNG, atlas and preview in `dist`.

For an ordinary live create/revise cycle:

```text
sprite.js new garden --size 32 --rows 1 --cols 1 --palette db-32
sprite.js compose --file composition.json --plan --session <current-session-id>
sprite.js compose --file composition.json --session <current-session-id>
```

Change the flower's petal color in `composition.json`, then run the same compose
command again. Matching output names keep their IDs. Removing a placement removes
only its obsolete owned shapes. One `undo --cell 0,0` restores the whole revision.
Individual qualified shape names can also be moved or recolored using ordinary
shape tools; reapplying the declaration replaces those local output edits.

For a separate live variation of a built asset, copy its editable project before
editing. A rebuild republishes the generated directory from canonical source.
Use the workbench's **Tools → Compose reusable parts** to edit the same parts and
placements through the server, and inspect the returned instance inventory.
