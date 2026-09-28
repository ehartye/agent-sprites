# Native 16×32 character report, body sides and held gear — design

Date: 2026-09-28. Status: approved in conversation (sections 1–4); awaiting written-spec review.

## Goal

The Stardew-style 16×32 native mannequins are the primary character system
(wiki: `primary-character-system-adr`). Give them what only the 40×56 `character`
recipe has today, in two phases:

- **Phase 1 (this spec):** per-frame body sides (near/far/front/back, shoulder,
  wrist, hip), a character report published by native builds, and a held 16×32
  trowel attached by anatomical side.
- **Phase 2 (separate spec, later):** locomotion data so `createWalker` drives
  native walks.

Non-goals for phase 1: walking data, new bodies, other gear items, changing any
existing native pixels (outputs are byte-identical unless a sheet declares gear).

## Current state (verified 2026-09-28)

- Templates (`examples/native-character/templates/{adult,child}.project.json`)
  carry only `head`, `body` and `skin-*` shape groups per pose — no joints.
- Per-pose hand rectangles are hard-coded in `dress-template.mjs` (`hands`),
  used to keep hands visible under clothing.
- Poses: 4 front and 4 right source poses per body; left mirrors right
  (x → 15−x); back reuses the front silhouette. Soles sit on row 29. Walks are
  four authored frames at 8 fps. The large body derives from the uncut adult by a
  column split (x<7 → x−1, x>8 → x+1) plus arm bands.
- Native builds are `generator` builds, which publish no report.

## 1. Joint table and derivation

New `examples/native-character/joints.mjs` exports hand-authored landmarks for
the 8 source poses of `adult` and `child` (`front_0…3`, `right_0…3`):

```js
export const JOINTS = {
  adult: {
    right_1: { left: { shoulder: [x, y], wrist: [x, y], hip: [x, y] },
               right: { shoulder: [x, y], wrist: [x, y], hip: [x, y] },
               hands: [[l, t, r, b], ...] },  // moved from dress-template, unchanged
    ...
  },
  child: { ... },
};
export function jointsFor(kind, facing, phase) { ... }  // derived, see below
```

Coordinates are 16×32 cell pixels, including each pose's head bob. The idle
frame for a facing uses phase 0.

Derivation (never authored):

- **left** — mirror of right: `x → 15 − x`, and the `left`/`right` side labels
  swap (as the 40×56 recipe does).
- **back** — the front pose's positions with side labels swapped (from behind,
  the character's right is on the image right).
- **large** — the adult landmarks with x mapped through the broadening split. The large
  body's arm bands move some arm pixels, so the on-body test (section 4) is what
  confirms these; any landmark it rejects gets a large-specific override row.
- **role** — `bodySideRole(side, direction)` from
  `server/authoring/humanoid-poses.js`, with native facings mapped
  front→down, back→up.

`dress-template.mjs` reads `hands` from this table instead of its inline arrays.
This is a pure move: every native preview and sheet stays byte-identical.

## 2. Generator reports and the native report

`server/build/project-build.js`: a generator's stdout may be either an operations
array (unchanged) or `{ operations, report }`. When `report.kind === 'character'`
the build writes `character-report.json` (artifact `characterReport`), copies
`playback-runtime.mjs` (artifact `playbackRuntime`), and the manifest lists both
with `report: 'character-report.json'`. A plain array builds exactly as today.
An object without `operations` or with a malformed report fails the build before
publication.

Native report shape:

```js
{ version: 1, ok: true, kind: 'character', system: 'native',
  cellSize: { width: 16, height: 32 }, ground: 29,
  aliases: { idle: '{direction}', walk: '{direction}_walk_{frame}' },
  directions: { down: 'front', up: 'back', right: 'right', left: 'left' },
  frames: [{ alias, cell, direction, frame, sides, gear, bounds }] }
```

- `sides.{left,right}` = `{ role, shoulder, wrist, hip }`, the recipe's shape.
- `direction` uses native names (`front|right|back|left`); `directions` maps the
  runtime's facing names onto them.
- `gear` lists declared gear with its current `role` (empty when none).
- `bounds` is the frame's opaque pixel bounds (for `hitBounds`).

Runtime compatibility: `groundAnchor`, `drawAtGround`, `hitBounds` and
`attachmentFor` work unchanged. `createWalker` on a report whose walk frames lack
`locomotion` throws `no locomotion data in this report` (phase 2 adds it).

Generators that emit reports: `generate-template.mjs` (bodies, including large),
`dress-template.mjs`, and `generate-cast.mjs` (everyday and pressure suits).
`generate-wig.mjs` stays report-free (hair-only overlay).

## 3. The 16×32 trowel

Declaration mirrors the recipe: `gear: [{ item: 'trowel', side: 'left'|'right' }]`,
one hand item per side, validated. Accepted as a cast profile field in
`cast/manifest.json` and as a generator argument `gear=trowel:<side>` (repeatable)
for `generate-template.mjs` and `dress-template.mjs`.

Layering in single-layer point art:

- **near / front** — trowel pixels draw on top of the body.
- **far** — trowel pixels draw only on empty cells; the body hides the rest
  (the recipe's `under-body`).
- The trowel anchors at the declared side's wrist from the joint table.
- Its outline colour joins the sheet's outline set, so the final corner pass
  (`finishNative`) treats it like any other outline.
- Shapes are named `gear_trowel_<side>_*` in a `gear` shape group; report frames
  list it with its role.

Art is owner-gated, stage by stage: draft a small trowel (about a 2px handle and
a 2×3 blade) in four facings and one walk cycle; present it in the casting UI with
a no-gear baseline and no starred pick; measure near/far visible pixels and
front/back image sides; only then finalise the art.

## 4. Testing and order of work

Tests are written first for each step.

- **Joints:** every landmark lies on or within one pixel of a body pixel in its
  frame; left mirrors right; back swaps labels; large follows the split.
- **Hand move:** all 51 native build outputs (previews and sheets) byte-identical
  before and after.
- **Report:** shape and alias/direction mapping; `attachmentFor` and
  `groundAnchor` from a native report; `createWalker` raises the clear error.
- **Build:** a generator emitting `{ operations, report }` publishes the report,
  runtime and manifest entries; a plain array is unchanged; a malformed object
  fails before publication.
- **Trowel (pixel diffs against a no-gear build):** at least 4 visible pixels when near, at most a couple of pixels when far, correct image
  side in front and back, visible through every walk frame when near.
- **Regression:** every existing native build is unchanged unless it declares gear.

Order, each merged separately:

1. Joint table + hand-box move (no output change).
2. Generator report support in the build (no output change).
3. Native reports for bodies, wardrobe and cast.
4. Trowel drafts for owner review, then the approved art.
5. Phase 2 walking: its own spec (stride and contact measured from the row-29
   soles across the authored walk, or published as uncalibrated).

Estimate: about two days plus review rounds for steps 1–4.

## Risks

- Hand-authored landmarks can be subtly wrong; the on-body test and a debug
  overlay for the owner mitigate this.
- A 16×32 trowel is only a few pixels; readability is an art question for the
  owner, not a measurement.
- Two systems now expose the same report contract; divergence is caught by the
  runtime tests running against both report kinds.
