# Native 16×32 walking data — design

Date: 2026-09-28. Status: approved in conversation (option A, uncalibrated).

## Goal

Phase 2 of the native parity work: publish `locomotion` in native character reports
so `createWalker` drives 16×32 walks. Feet are **not** claimed to lock.

## Findings (measured from the art)

The native walk is a four-frame cycle. Frames 0 and 2 are the same passing pose
(feet together under the body); frames 1 and 3 are stride poses with both feet on
row 29, one behind and one in front. Locking the planted foot would need uneven
per-frame body travel (adult ≈ 2.5 then 4.5 px, child ≈ 1 then 3.5 px), which the
runtime's single `frameDistance` cannot express, so a constant stride leaves about
1 px of slide.

Stride per frame = mean over the two stride frames of (front-foot centre − back-foot
centre on row 29) ÷ 2, rounded to the nearest 0.5 px:

| Body | Stride frames (front − back) | Per frame | Cycle (4 frames) |
|---|---|---|---|
| adult | 6, 7.5 | 3.5 | 14 |
| child | 4.5, 5.5 | 2.5 | 10 |
| large | 7, 9.5 | 4 | 16 |

## Design

- `joints.mjs` exports `STRIDE = { adult: 3.5, child: 2.5, large: 4 }` with the
  measurement rule in a comment.
- `nativeReport` adds `locomotion` to every walk frame (`frame !== null`):
  `{ cycleDistance: 4 × stride, frameDistance: stride, phaseDistance: frame × stride,
  frameCount: 4, fps: 8, direction, contactCalibration: 'none',
  rootCompensation: 'none', contacts: [] }`, where `direction` is `[1,0]` right,
  `[-1,0]` left, `[0,1]` front, `[0,-1]` back. The same stride serves all four
  facings (an approximation for front and back). Idle frames carry no locomotion.
- No runtime change: with `rootCompensation: 'none'` both walker modes give a zero
  draw offset and `contactsCalibrated: false`; stopping shows the idle frame through
  the report's `aliases` and `directions`.

## Testing

- Walking right advances `right_walk_0…3` every `frameDistance` source pixels per
  body; stopping returns `right`; left, front and back use native names.
- Offsets stay `[0,0]` and `contactsCalibrated` is `false` in both modes.
- The 40×56 walker tests pass unchanged; all native sheets stay byte-identical.

## Not in scope

Planted-feet walking for 16×32 (per-frame distances in the runtime, or a redrawn
even stride). Recorded as a follow-up in the wiki.
