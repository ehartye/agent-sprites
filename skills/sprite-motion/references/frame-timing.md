# Author exact frame timing

Use the matching absolute managed launcher established in sprite-motion and
sprite-setup. `sprite.js` below means that launcher. Bind `SPRITE_PORT` to an
existing matching workbench before live commands, and stop on command failure.

```text
sprite.js duration set 75 --cell impact --session <session-id>
sprite.js duration read --cell impact --group bounce --session <session-id>
sprite.js duration clear --cell impact --session <session-id>
sprite.js group fps bounce 6 --session <session-id>
sprite.js group loop bounce false --session <session-id>
sprite.js group direction bounce pingpong_reverse --session <session-id>
sprite.js view-anim bounce --session <session-id>
sprite.js export --trim true --session <session-id>
```

`read` returns the canonical cell coordinate, its explicit `overrideMs` or `null`,
the `effectiveMs`, and timing `source`: `frame`, `group` or `default`. Named cell
references resolve to their coordinate. Milliseconds must be positive safe integers;
fractions, zero and values outside exact integer range fail before mutation.
The optional session guard also pins standalone group commands and export. A stale
session fails before editing another design or writing its export.

## Ownership and precedence

1. A cell's explicit milliseconds win in every animation group and occurrence.
2. Without an override, the selected group's FPS supplies `round(1000 / fps)` ms.
3. Ungrouped playback, base atlas frames and named aliases use 8 FPS (125 ms)
   unless the cell has an override.

A cell shared by a 4 FPS group and a 10 FPS group therefore uses 250/100 ms while
unset, and the same 75 ms in both groups after `duration set 75`. Clearing the
override restores each group's rate. Repeating the cell in a group repeats that
same hold; it does not create an independently timed copy. For different durations
on two occurrences, use distinct cells. Group creation preserves explicit repeated
holds; adding cells preserves those holds and appends only new coordinates.

Timing belongs to the coordinate, separately from its artwork. Copying, clearing
or renaming artwork does not replace a destination cell's duration. A portable
project stores `frameDurations` and optional group `animationLoops`; drafts, saved
files, imports and session copies retain them. Group references persist as canonical
coordinates, including when created with named cells.

The browser's **Timing** tab lists cells once in group order, showing their names,
effective milliseconds and source. Enter an override or clear it to inherit. Group
FPS and loop controls update the same server metadata. **Open animation preview**
selects that group directly. Unsaved timing input remains available after a failed
request; switching sessions prevents an old request from updating the new design.

## Playback and exports

Forward, reverse, ping-pong and reverse ping-pong use the same expanded sequence
in browser playback, terminal playback and atlas proofs. Ping-pong omits duplicated
endpoints. Browser and standalone previews preserve a paused frame's remaining
hold; one-shot playback stops after the final hold and Play restarts it.

Terminal `view-anim` defaults to three passes for repeating groups and one pass for
one-shot groups. Explicit `--loops N` requests that many passes; `0` repeats until
interrupted. Optional `--fps N` overrides inherited rates for that preview only:
explicit per-cell milliseconds still win. Source project timing stays unchanged.

Atlas frame durations retain exact source milliseconds, including trimmed frames
and named aliases. The tag's optional `loop` field is agent-sprites metadata, used
by its previews and proof tools; consumers that ignore it need their own repeat
policy. Exported group FPS cannot override a cell's explicit duration.

GIF stores whole centiseconds. The atlas proof rounds cumulative boundaries to
10 ms and reports the encoded delays and drift; for example, two 125 ms holds
encode as 130/120 ms while retaining the 250 ms total. A step that would encode as
zero fails explicitly. Keep the source milliseconds; do not round the project to
make the format appear exact. Use the PNG/atlas and decoded proof report to check
the distinction. Read [atlas proof](../../sprite-export/references/atlas-proof.md)
for palette, transparency and complete-cycle limits.

Expanded batch operations use `{"command":"duration","cell":"0,0","ms":75}`
and `ms:null` to clear. `{"command":"duration","sub":"read","cell":"0,0","group":"bounce"}`
returns the timing in the batch results. The browser, CLI and batch share GET/POST
`/api/cell/duration`; use `X-Sprite-Session` for a pinned direct API request.
