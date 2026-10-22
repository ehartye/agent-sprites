# Large Project Authoring Implementation Plan

> Use h-superpowers:subagent-driven-development for implementation and independent spec/quality review. The owner selected all three stages; execute them continuously without routine permission checkpoints.

**Goal:** Deliver lazy cached thumbnails, file-backed import/generation with progressive frame access, and shared editable geometry as one compatible workflow.

**Architecture:** Retain the current canonical renderer and expanded project model contract. Separate bounded thumbnail scheduling, owned import jobs and a versioned compact geometry codec. Activate validated imports atomically, and pin progressive data/editing to session/revision identities.

**Tech Stack:** Node 24+, Express, worker_threads, Node streams, existing SQLite sessions, browser modules/Canvas, Vitest/jsdom and real browser checks.

## Milestone 1: lazy cached thumbnails

**Files:** `server/web/public/js/cell-nav.js`, new focused scheduler/cache module if needed, `tests/web-ui/cell-nav.test.js`, new cache tests if separated. Avoid HTTP/model changes in this milestone.

- [x] Write a failing behavioral test that rendering forty thumbnail shells with a controlled viewport does not rasterize all forty cells. Use a controllable IntersectionObserver/scheduler at the boundary while retaining the real cell drawing path.
- [x] Run the focused test and confirm failure is eager rendering, not missing DOM setup.
- [x] Implement viewport observation, bounded scheduled work and active-frame priority. Cancel jobs for an obsolete strip. Preserve fitting/names/selection.
- [x] Add failing tests for unchanged-filter reuse, changed-cell invalidation, offscreen refresh, palette/background/dimension invalidation and LRU capacity. Implement only the necessary cache/lifecycle behavior.
- [x] Verify fallback behavior without IntersectionObserver and ensure its work is bounded; adjust existing synchronous pixel tests to explicitly flush scheduled visible work.
- [x] Run `node node_modules/vitest/vitest.mjs run tests/web-ui/cell-nav.test.js tests/web-ui/animation.test.js tests/web-ui/preview-sequences.test.js --maxWorkers=2` and syntax/diff checks.
- [x] Independently review spec, then quality. Commit only the milestone's owned source/tests after fixes. Root performs actual browser timing against the original forty-frame fixture before final delivery.

Milestone 1 passed independent spec and quality review, including repeated frame occurrences and stable wrapper identities. The initial real forty-frame check rendered only the fifteen visible thumbnails; unchanged filters and repeated scrolls reused cached output. Final integrated measurements remain below because main-thread native raster cost is still visible.

## Milestone 2: owned file import and generated input

- [x] Map existing activation, persistence, loopback/origin checks, CLI build inputs and API tests before selecting exact helper boundaries. Keep new job lifecycle and stream helpers separate from route wiring.
- [x] Write/run failing real-request tests for direct streamed JSON above 64 MiB, compressed/uncompressed byte limits, malformed data and unchanged original session on failure.
- [x] Implement owned job upload/storage, worker validation, status/progress and cancellation/cleanup. Add explicit session-change/worker-failure rollback tests before activation wiring.
- [x] Replace the browser's complete-file parse/request with direct upload and visible progress/cancel states. Preserve the legacy JSON import endpoint.
- [x] Write/run failing generator tests for stdout above 8 MiB, bounded stderr and cancellation; implement spawn/stream-to-owned-file while preserving report parsing, existing work budgets and provenance.
- [x] Add progressive project summary and bounded frame retrieval tests, including session/revision races and response limits; wire new opt-in browser protocol and bounded frame cache.
- [x] Exercise selection, edits, undo, onion skin, tags, construction review and session switching with sparse frame data. Add behavior tests at actual integration boundaries.
- [x] Independent spec/quality review and milestone commit after focused gates pass.

The file-import slice passed independent spec and quality review. Its broad regression gate passed 775 tests across 47 files. Browser checks exercised File upload without File.text(), validation, activation and cancellation. Parsing still materializes a complete project inside the bounded validation worker; compact storage now reduces the retained geometry and activation payload without claiming a streaming JSON parser.

Generator spooling and the progressive server protocol also passed independent spec and quality review. Generator receipts preserve bounded diagnostics and publication outcomes. Server summaries avoid publication-only geometry cloning, and bounded frame responses enforce pins and byte limits. Legacy payload ordering, rollback, canonical group ownership and targeted versions were exercised through real requests. The server slice regression gate passed 1,028 tests across 85 files; browser integration is accepted in the final checks below.

Asynchronous native preview work, progressive browser caches and browser build progress now pass independent spec and quality review. The browser retains bounded frame geometry, shares native bitmaps between consumers and streams build receipts. An actual offline build with no active project completes without a live-project refresh; opening its generated project remains explicit. The final release gate covers all three approved outcomes together.

## Milestone 3: shared geometry and integrated delivery

- [x] Define deterministic versioned dictionary/instance JSON in codec tests. Assert complete V1 semantic round trip before implementing the encoder/decoder.
- [x] Add malformed-reference/grid/work-budget tests. Implement bounded validation and loader support without changing default expanded JSON output.
- [x] Add shared identity and frame-local edit/copy/transform/undo/redo tests. Implement immutable shared geometry with explicit detachment; audit every direct parameter mutation.
- [x] Deliberately integrate compact persistence/download and import validation, retaining legacy files/routes. Test reconstruction of timing, groups, layers, normals, lighting, pivots, review and replay.
- [x] Run unchanged existing engine/handler/API/CLI/UI suites appropriate to touched paths. Validate real full detailed animation imports in a disposable database and compare raster output with canonical fixtures.
- [x] Measure input/compact sizes, parameter sharing, peak memory, first interactive/frame latency and thumbnail render counts. Resolve observed bottlenecks rather than relying only on byte acceptance.
- [ ] Independent final review; public docs/skills/version metadata and required CI/native checks; reviewed PR/squash publication and managed runtime verification.
- [ ] Coordinate a fresh wiki window for actual architecture/roadmap state and measured delivery evidence. Preserve older authored comparison/evidence/raw/provenance and foreign work.

The later milestones require their exact implementation file/task breakdown after the preceding boundaries are verified; do not treat this checklist as permission to skip the design, failing tests or independent reviews for those changes.

The shared-geometry work has two review boundaries: first the deterministic codec, direct interned hydration and frame-local mutation isolation; then compact worker snapshots, persistence and explicit file formats. Native raster scheduling and progressive browser integration follow those reviewed boundaries. This retains the approved scope while allowing each model and I/O contract to be verified separately.

The model and codec boundary passed independent spec and quality review. Its latest broad gate passed 1,456 tests across 105 files. Replacement parameters become owned mutable data, while constructor and clone paths retain immutable sharing. Encoder and loader depth limits agree. Codec size reduction alone does not establish faster activation or responsive browser playback.

Compact I/O also passed independent spec and quality review, with 449 tests across 27 suites in its broad gate. New file imports retain V2 through drafts, reopen, copy and default save/download; explicit expanded interchange and legacy routes remain available. Build artifacts opt into shared format explicitly. Scene preflight uses the same canonical palette as hydration before skipping redundant constructor checks.

Final real-browser checks exercised complete large-file upload without File.text(), bounded selected/visible loading, unchanged refresh reuse, edits and exact undo, scroll reuse, reference-image lifecycle, stale-session rejection and a full authored playback cycle. Readback-heavy native canvases request willReadFrequently on their first context creation; display canvases retain their normal policy. Same-browser old canonical, current canonical, worker and fallback pixels match across the raster corpus. Cold full-sequence preparation remains a separate visible cost; these checks do not claim instant activation or all-platform equivalence.

The streamed browser build was also exercised with more than 8 MiB of real generator stdout and Unicode stderr. Cancellation after live child output removed owned temporary state and preserved the prior output. Its uncertain-request UI does not claim rollback without an authoritative receipt. Final documentation, full-suite/native CI, managed runtime and coordinated wiki publication remain release gates below.

Final integrated SPEC review found lost activation responses could misreport a committed import. Existing DELETE status plus one GET fallback now recover the authoritative receipt without replaying activation; unavailable recovery explicitly reports an unconfirmed outcome. Real helper/CLI and browser regressions cover postcommit SIGINT, explicit cancellation and closed views. Independent SPEC rereview passed, and actual Chrome checks recovered a deliberately dropped receipt or truthfully reported unavailable recovery. The final full local suite passed 2,892 tests across 232 files, with three platform-specific skips; static showcase build/tests also passed. Final quality review, actual native matrix, release/runtime evidence and coordinated wiki publication remain open gates.
