# Source-aware construction replay

Copy this directory into your project. From the copied directory, run the
matching managed launcher resolved from the loaded sprite skill:

```text
node "<launcher>" build sprite-project.json --json
node "<launcher>" replay dist/face.project.json --list --json
node "<launcher>" replay dist/face.project.json --cell 0,0 --step 2 --out eye-review --scale 8 --json
```

The build records selected-cell state after actual operations execute. `--list`
shows each recorded step's label, operation index, source JSON pointer and source
hash. Choose the step from that list; step 2 is the left eye in this example.
`eye-review` must be a new directory inside an existing parent. Inspect before,
after, contribution and changed-mask PNGs plus `replay.json`.

For a diagnosis exercise, change the left eye's `x` from 6 to 14 and rebuild. Its
contribution reveals the displaced pixel; source pointer `/2` identifies the
entry to correct. Restore `x: 6` and rebuild: both source identity and the actual
contribution change. Keep separate review directories for the two versions.

Open `dist/face.project.json` in the live editor, then choose Workbench → Replay
to scrub the same immutable construction. A live edit changes the comparison
with final construction. Undoing that edit restores the match without changing
the construction records. Scrubbing itself never applies edits or consumes undo.
