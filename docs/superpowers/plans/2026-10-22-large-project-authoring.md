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
- [ ] Add progressive project summary and bounded frame retrieval tests, including session/revision races and response limits; wire new opt-in browser protocol and bounded frame cache.
- [ ] Exercise selection, edits, undo, onion skin, tags, construction review and session switching with sparse frame data. Add behavior tests at actual integration boundaries.
- [ ] Independent spec/quality review and milestone commit after focused gates pass.

The file-import slice passed independent spec and quality review. Its broad regression gate passed 775 tests across 47 files. Browser checks exercised File upload without File.text(), validation, activation and cancellation. Whole-model worker parsing and hydration remain explicit limitations until compact storage is integrated.

Generator spooling and the progressive server protocol also passed independent spec and quality review. Generator receipts preserve bounded diagnostics and publication outcomes. Server summaries avoid publication-only geometry cloning, and bounded frame responses enforce pins and byte limits. Legacy payload ordering, rollback, canonical group ownership and targeted versions were exercised through real requests. The latest server regression gate passed 1,028 tests across 85 files; browser progressive integration remains pending.

Implementation order for the remaining slices is generator spooling, progressive server protocol, shared codec/persistence, then progressive browser caches and asynchronous native preview work. Defining transport before the codec and wiring the browser afterward avoids building a temporary full-graph client path. Each slice retains independent spec and quality review; the final integration gate still covers all three approved outcomes together.

## Milestone 3: shared geometry and integrated delivery

- [ ] Define deterministic versioned dictionary/instance JSON in codec tests. Assert complete V1 semantic round trip before implementing the encoder/decoder.
- [ ] Add malformed-reference/grid/work-budget tests. Implement bounded validation and loader support without changing default expanded JSON output.
- [ ] Add shared identity and frame-local edit/copy/transform/undo/redo tests. Implement immutable shared geometry with explicit detachment; audit every direct parameter mutation.
- [ ] Deliberately integrate compact persistence/download and import validation, retaining legacy files/routes. Test reconstruction of timing, groups, layers, normals, lighting, pivots, review and replay.
- [ ] Run unchanged existing engine/handler/API/CLI/UI suites appropriate to touched paths. Validate real full detailed animation imports in a disposable database and compare raster output with canonical fixtures.
- [ ] Measure input/compact sizes, parameter sharing, peak memory, first interactive/frame latency and thumbnail render counts. Resolve observed bottlenecks rather than relying only on byte acceptance.
- [ ] Independent final review; public docs/skills/version metadata and required CI/native checks; reviewed PR/squash publication and managed runtime verification.
- [ ] Coordinate a fresh wiki window for actual architecture/roadmap state and measured delivery evidence. Preserve older authored comparison/evidence/raw/provenance and foreign work.

The later milestones require their exact implementation file/task breakdown after the preceding boundaries are verified; do not treat this checklist as permission to skip the design, failing tests or independent reviews for those changes.

The shared-geometry work has two review boundaries: first the deterministic codec, direct interned hydration and frame-local mutation isolation; then compact worker snapshots, persistence and explicit file formats. Native raster scheduling and progressive browser integration follow those reviewed boundaries. This retains the approved scope while allowing each model and I/O contract to be verified separately.
