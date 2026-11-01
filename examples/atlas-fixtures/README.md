# Atlas fixtures

Three small agent-sprites atlases with committed expected values. They are the shared definition of correct playback for the engine loader examples: a loader passes when, for every tag, it plays the same frames, durations, loop behaviour and placement as `expected.json`.

Each folder holds `<name>.png` (the sheet), `<name>.atlas.json` (the Aseprite JSON atlas) and `expected.json`.

| Fixture | Cells | Covers |
| --- | --- | --- |
| `trimmed` | 32x24, trimmed | Tag `sweep` over frames 3 to 5, `pingpong_reverse`, `loop: false`, durations 75, 125 and 200 ms. Frames are the 30x22 opaque box at offset (1, 1) in a 32x24 source. Pivot (16, 22). The tag also carries `repeat: "1"`, as the exporter writes beside `loop: false`. |
| `blink` | 16x16 | Forward tag `blink` over frames 2 to 5 (250 ms each), loop absent. The grid cells come first, so the tag does not start at frame 0, and named alias frames `open` and `closed` (125 ms) follow the tag. Pivot (8, 15). |
| `directions` | 12x12, untrimmed | One tag per direction over cells of 80, 120, 160 and 240 ms. `forward-run` (forward, loop absent), `reverse-once` (reverse, `loop: false`), `pingpong-loop` (pingpong, `loop: true`) and `pingpong-reverse-once` (pingpong_reverse over three cells, `loop: false`). Pivot (6, 11). Both `loop: false` tags also carry `repeat: "1"`. |

`trimmed` and `blink` are copies of the site examples `surface-lighting` and `blink`, without the lighting and normal map metadata (and with the exporter URL in `meta.app` shortened to `agent-sprites`). `directions` was built with the repository's own CLI (`new`, `draw`, `clone-cell`, `duration`, `group create --direction --loop`, `pivot`, `export`).

## expected.json

Engine-neutral and machine-readable. Top level: `fixture`, `image`, `atlas`, `pivot` and `tags`. Each entry of `tags` has:

- `name`, `direction` (`forward`, `reverse`, `pingpong` or `pingpong_reverse`).
- `loop`: a boolean, already resolved. A present `loop` decides (a tag loops unless it is explicitly false). Without `loop`, a `repeat` of the string `"1"` makes a one-shot. A tag with neither loops.
- `repeat`: the tag's `repeat` string, present only when the atlas tag has one. It is informational; loaders resolve `loop` as above.
- `steps`: `[{index, duration}]`, the played order exactly as `atlasSequence(atlas, {tag})` returns it. `index` is an index into the atlas `frames` array (not a grid cell) and `duration` is in milliseconds. Ping-pong tags already contain the way back, without repeating either end.
- `durationMs`: the sum of the step durations.
- `frames`: for each frame index the tag plays, `frame` {x, y, w, h} (region in the sheet), `offset` {x, y} (`spriteSourceSize` x and y: where the region sits inside the untrimmed cell), `sourceSize` {w, h} (the untrimmed cell) and `pivot` {x, y}, in pixels from the top-left of the untrimmed cell (`null` when the atlas has no pivot slice).

All coordinates are whole pixels with the origin at the top-left and y pointing down.

## repeat-rule

`repeat-rule.atlas.json` and `repeat-rule.expected.json` sit beside the fixture folders (they are a pair of files, not a fourth fixture folder). The atlas is hand-written: the first four cells of the `directions` sheet (`image` points at `directions/directions.png`) with one forward tag per case of the loop rule: `repeat-only` (`repeat: "1"`, no `loop`: a one-shot), `loop-true-repeat` (`loop: true` and `repeat: "1"`: a loop, `loop` wins), `loop-false-repeat` (`loop: false` and `repeat: "1"`: a one-shot), `neither` (a loop) and `repeat-two` (`repeat: "2"`, no `loop`: a loop). The engine loader checks read the pair like a fixture. The expected file is regenerated with the same command as the others.

## Regenerating

`expected.json` is written by the regeneration helper in `tests/engine/engine-loader-fixtures.test.js`. Never edit it by hand. After changing an atlas, run from the repository root:

```
UPDATE_ATLAS_FIXTURES=1 npx vitest run tests/engine/engine-loader-fixtures.test.js
```

In PowerShell: `$env:UPDATE_ATLAS_FIXTURES=1; npx vitest run tests/engine/engine-loader-fixtures.test.js; Remove-Item Env:UPDATE_ATLAS_FIXTURES`.

A plain `npx vitest run tests/engine/engine-loader-fixtures.test.js` recomputes every tag from the committed atlas and fails, naming the tag and frame, when a committed `expected.json` differs.
