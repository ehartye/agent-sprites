# Large project authoring

The owner approved all three stages: lazy cached thumbnails, file-backed import/generation with progressive frame access, and shared unchanged geometry with frame-local edits. This design makes those stages a compatible end-to-end workflow. Existing authored assets are fixtures, not outputs to regenerate or overwrite.

## Outcomes

- Opening an animation does not synchronously render every thumbnail twice. Only visible thumbnails are scheduled; cached images are reused, invalidated on relevant changes and bounded in memory.
- A complete detailed animation can be imported directly from a JSON or JSON.GZ file without parsing and serializing its entire contents in the browser. Progress, cancellation and validation errors are visible. A failed or canceled import leaves the active session and stored drafts unchanged.
- Generator stdout is streamed to owned temporary storage with bounded bytes and diagnostics, rather than buffered behind the old 8 MiB boundary. Existing operation/model/render budgets remain enforced.
- Browser connections opt into metadata plus bounded frame requests. A selected frame becomes available without sending the complete project graph through a WebSocket. Session changes and stale responses cannot redirect edits or publish an obsolete view.
- A compact project representation stores repeated shape geometry once. Instances retain IDs, names, paint order, colors and visibility. Editing one instance does not modify another frame; undo/redo and ordinary expanded exports retain their current meaning.

## Compatibility and ownership

Version 1 project JSON and existing JSON routes remain supported. Expanded `Project.toJSON()` remains the compatibility representation. A versioned compact representation is opt-in for files and used internally where a new import/storage path explicitly supports it. No existing user files are converted in place. New imports create new sessions only after validation. Existing database records remain readable without destructive schema migration.

Shared geometry is immutable. Shared instances detach their parameters before a frame-local mutation; transform, copy, replace, erase, color2 and undo paths must all preserve isolation. Legacy mutable projects retain their existing behavior. Compact loading must reject missing references, cycles or ambiguous/prototype keys, invalid grids and excessive expanded work before activation. Compaction may reduce serialized and retained parameter duplication, but does not claim all project memory or rendering cost becomes constant.

## Stage 1: visible thumbnail work

Keep the existing cell navigator and frame selection UI. Create inexpensive thumbnail shells immediately. Observe their intersection with the scrolling strip; schedule at most one uncached render per turn, prioritize the active cell and cancel obsolete jobs when session/grid/filter changes. Cache final thumbnail bitmaps by frame content identity/revision plus dimensions, palette, background and theme/checker identity. Bound entry count and bitmap bytes with LRU eviction; release replaced canvases/bitmaps.

`setFilter` must avoid rebuilding an unchanged strip. `refresh(refs)` invalidates only affected entries and does not render offscreen cells. Browser APIs need a deterministic bounded fallback where IntersectionObserver is unavailable. Empty/unloaded cells remain placeholders and are rendered after data becomes available. Existing rectangular thumbnail fitting, names, selection and exact native raster behavior are preserved. Native rendering remains authoritative; scheduling does not approximate the artwork.

## Stage 2: file I/O and progressive browser state

Add an owned import-job service and dedicated routes mounted before the generic JSON body parser. The browser uploads the File directly, with byte progress and cancellation, rather than calling File.text/JSON.parse/JSON.stringify. Stream compressed input and decompressed JSON through separate byte limits to a uniquely owned temporary directory. Bound concurrent validation work and diagnostic output. Validate in a worker so parsing and surface/model checks do not block the server event loop. Record source bytes/hash and validated output identity.

Jobs have explicit uploading, validating, ready, activating, complete, failed and canceled states. Cancellation aborts streams and workers and removes only that job's temporary files. Activation verifies the originating session still matches, commits prospective metadata transactionally, and publishes the new active project only after success. Server shutdown cleans its own pending jobs. No arbitrary filesystem path upload, unbounded archive extraction or blanket temporary-directory cleanup is introduced. Existing loopback/origin controls apply.

A progressive WebSocket mode receives a project summary, session identity and revision. Frame requests are bounded by count and response bytes; they return complete selected cells with the revision they represent. The browser fetches selected/nearby frames and visible thumbnails, maintains a bounded cache and drops results from old sessions/revisions. Editing, onion skins, tags, named cells, construction review and scene switching must not require a full-graph refresh. Existing legacy WebSocket/API consumers continue to work.

Generator execution uses spawn plus a streaming file sink, timeout/abort handling and bounded stderr. Temporary generator input is owned by the build lifecycle and cleaned on failure/cancel. Source/producer hashes, reports and final operations artifacts retain honest provenance; a temporary path is not promoted as a committed source. The implementation must state where a complete parse/model is still required and measure that memory cost.

## Stage 3: shared geometry

Add a project codec with a versioned geometry dictionary and ordered per-cell instance records. Geometry identity includes type and complete nested parameters; instance metadata carries id, name, zIndex, color and visibility. Equal geometry is interned deterministically. A frame edit creates a local replacement/override; unused definitions need not persist in a newly serialized snapshot. Preserve cell names/references/lighting, palette, timing, directions, loops, groups, pivots, review and construction metadata.

Compact files are accepted by the new import path and Project loader. Expanded exports remain available, and compact-to-expanded round trips preserve semantic JSON and raster output exactly. Shared parameters must be reused in memory for compact loading/copying until an edit detaches them. Audit all direct parameter mutations, including non-surface cell transforms. Persistence and download paths use the compatible codec deliberately, not an accidental wholesale format change.

## Validation and measurements

Use behavioral tests for visible scheduling, no duplicate render on unchanged filters, cache invalidation/eviction, stale-job cancellation and fallback selection. Import tests use real streamed requests and disposable databases: complete files larger than the old request boundary, malformed/truncated/gzip-bomb input, cancellation during upload/validation, session changes, worker failure and rollback. Generator tests include output larger than 8 MiB, cancellation and bounded diagnostics.

Progressive state tests cover frame count/bytes, session and revision races, stale tab edits and bounded client caches. Compact tests cover shared identity, edit/copy/undo/redo isolation, all metadata, rejection of malformed references and exact expanded/raster round trips. Existing V1 fixtures and project/session/tool tests must remain passing.

Benchmark the published detailed animation in an isolated database. Record input/decompressed/compact sizes, shared versus unique definitions, peak process memory, time to first interactive state/frame and subsequent selected-frame latency. Record native render counts for initial viewport, unchanged refresh and scroll. Compare with the observed eager import using the same fixture; disclose environment and measurement limits in the wiki, not machine-specific public instructions. All older art/source bytes remain unchanged.

## Alternatives and trade-offs

| Approach | Time | Risk | Complexity | Best practice | Maintainability |
| --- | --- | --- | --- | --- | --- |
| Staged compatible pipeline (selected) | Thumbnail work delivers first; import and shared representation follow with integrated gates. | Moderate concurrency and mutation-isolation risks, covered by explicit job/session boundaries and round trips. | Separate navigator/cache, import job and codec units. | Resource limits describe actual work; legacy formats remain supported. | One official workflow replaces example-specific adapters. |
| Raise limits around the current whole-project path | Small initial change; repeated whole-graph work remains. | High peak-memory and UI-stall risk at larger sizes. | Low initial change, growing recovery work. | A byte ceiling alone does not model expanded work. | Retains multiple full serializations and per-example workarounds. |
| Replace storage/model in one breaking rewrite | Longest delay before a usable improvement. | Highest migration and undo/compatibility risk. | Replaces several established subsystems together. | A clean redesign needs evidence to justify its migration cost. | Broad new surface before smaller measured improvements establish requirements. |

## Delivery

Implement as independently testable milestones on an isolated feature branch, preserving default checkout and all prior assets. Finish with integrated tests, real browser/import measurements, documentation/skill updates, version consistency and native compatibility evidence appropriate to changed paths. Publish the product through reviewed feature work. Any later wiki state update requires a fresh coordinated catalog window; the already-published I/O item remains planned until actual delivery evidence exists.
