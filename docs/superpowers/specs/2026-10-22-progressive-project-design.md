# Progressive project access

The editor will opt into a metadata and frame protocol. Legacy WebSocket consumers and deliberate expanded project APIs retain their behavior. This protocol is defined before compact storage and browser integration so both stages use the same frame boundary.

## Identity and summary

Connect with `?project=progressive-v1`. The server sends `project_summary` on connect, explicit `get_project` and coalesced mutations. Its data includes `sessionId`, an opaque `projectId`, a monotonic `revision` and `cellVersions`. Replacing the active project object or session changes project identity. Reads do not increment revisions.

Summary fields include project name, dimensions/grid, palette/background/pivot, timing/groups/directions/holds/loops, review, construction availability and cell names/counts/reference metadata. Each cell placeholder has a version and no `shapes` property. Shape-group summaries contain names and cell membership, with actual member IDs supplied only for requested cells. Storage format is cheap metadata, not a reason to serialize the project. Live editing metadata comes from SQLite without losing explicit prototype-like group names.

`GET /api/workbench/project-summary` returns the same summary in the ordinary `{ok:true,data}` envelope. Construction replay remains deliberate, on-demand data rather than part of every summary.

## Bounded frames and edits

Request `GET /api/workbench/frames?refs=0,0|0,1&sessionId=...&projectId=...&revision=...`. Require a small raw query, one to eight distinct canonical in-grid coordinate references and exact current identity/revision pins before allocating frame data. Stale pins receive HTTP 409. Invalid references/counts are rejected clearly. The complete serialized response is bounded to 8 MiB; oversized frames receive HTTP 413 rather than a partial successful frame.

The response data contains `sessionId`, `projectId`, `revision`, `cells`, `cellVersions` and selected `shapeGroups`. Requested cells use canonical complete Cell JSON, including lighting/reference metadata and explicit `shapes:[]` for an authored empty cell. An unloaded placeholder and an authored empty frame remain distinct. No unrelated frame or group members are included. Capture one synchronous revision snapshot for the response.

Progressive WebSocket edits carry session/project/revision pins. Optional HTTP `X-Sprite-Project` and `X-Sprite-Revision` headers require both pins and the existing session header. Reject stale edits before handlers run; unpinned legacy clients remain compatible.

## Publications and caching

A common lazy project publication helper avoids constructing an expanded snapshot when no legacy clients need it. Progressive clients receive summaries instead of geometry-bearing legacy draw/cell/project events. Generic notifications remain available. Deliberate legacy GET/export and persistence paths are separate responsibilities.

Common frame edits increment affected cell versions while preserving unrelated versions. Copy/fanout and history invalidate their actual destinations; project replacement resets identity. Known metadata changes preserve frame geometry versions. Palette/background and unknown graph-wide changes invalidate conservatively. Coalesce synchronous edit batches without creating a revision loop on resync reads.

The browser will cache complete requested frames by identity and cell version, bound entries/bytes, abort obsolete requests and preserve unchanged shape identities. Selected/visible/onion/playing consumers request frames as needed. A stale or missing frame cannot receive edits. Asynchronous canonical raster work follows the same identity rules; it must not publish an obsolete bitmap after a context or selection change.

## Verification

Exercise real progressive and legacy WebSockets, zero-client publication, request count/bytes, empty frames, session/revision races and stale edits. Assert no whole-project snapshot for progressive publication; draft persistence is measured separately. Verify targeted versions and group/timing/review metadata through actual API mutations. Browser integration then covers bounded demand/cache behavior, selection/edit/undo/session switching and exact native raster parity.
