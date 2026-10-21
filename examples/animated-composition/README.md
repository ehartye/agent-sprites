# Lantern garden: independent animation composition

Copy this folder's source files into your asset source directory, excluding any
existing `dist` and `dist-once` folders. Run sprite-setup first, then use the absolute
managed launcher from the loaded plugin:

```text
node "<plugin-root>/scripts/run-managed.js" build "<asset-source>/animated-composition/sprite-project.json" --json
```

The inline `animation` source combines a static garden, two tiled lanterns and four
fireflies (one stamp plus three seeded scatter instances). The lantern's `glow`
group has 120/80 ms poses; the firefly's explicit `closed`, `open`, `rise` sequence
has 80/120/100 ms poses. Their complete common period is 600 ms. Per-instance random
phases use the scene seed; scatter positions use the placement's separate seed.
No generator or additional `inputs` declarations are needed: build hashes the
referenced child projects automatically.

The source palettes deliberately reuse `ink`, `glow` and `light` with different
colors: lanterns are amber, fireflies mint. Lantern glass starts as a flood fill;
eraser rectangles cut away its corners and border. In the result those transparent
areas reveal the intact garden behind the child. The fill stays inside the 8×12
lantern canvas. This demonstrates child isolation, not a special-purpose lantern
recipe: replace the child project files with your own named primitive frames.

Inspect `dist/contact.png`, then play `dist/preview.html` through several loops.
`dist/animation-report.json` lists each child hash, expanded instance, selected pose
and exact output duration. The output tag is `lantern-garden`; frame aliases start
at `lantern-garden_0000`. The generated editable project is
`dist/lantern-garden.project.json`, alongside the PNG, atlas and captured operations.

For a delayed one-shot example, build the second config:

```text
node "<plugin-root>/scripts/run-managed.js" build "<asset-source>/animated-composition/sprite-project-once.json" --json
```

It writes `dist-once`, uses the firefly's stored group, and finishes at 420 ms.
Both children have `loop: false`; the second holds its first pose for a 120 ms delay,
while the first holds its last pose after finishing at 300 ms. A delay does not hide
the child. The exported `delayed-firefly` tag does not loop. For repeating children,
`delayMs` shifts the wrapped phase instead of adding a first-pose hold.

For repeatable changes, edit the copied child projects or config and rebuild.
Generated edits are replaced. For a manual variation, copy the generated project
outside its generated directory, then open that copy through the managed launcher:

```text
sprite.js open "<asset-source>/garden-manual.project.json"
sprite.js layer list --cell lantern-garden_0000
sprite.js layer edit lantern-garden:lanterns/r0c0:canvas --cell lantern-garden_0000 --dx 1 --dy 0 --z 5
sprite.js shapes --cell lantern-garden_0000
sprite.js save
```

Here `sprite.js` is shorthand for the absolute managed launcher. Choose the ID and
z value from `layer list`; the edit moves/reorders a whole child in that cell.
Named primitives such as `lantern-garden:lanterns/r0c0:glass` remain individually
editable. Apply multi-frame manual changes explicitly and inspect playback.

Read the [animation composition contract](../../skills/sprite-motion/references/animation-composition.md)
for phase, delay, loop precedence, complete-cycle duration rules and build limits.
