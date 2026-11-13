# Retained native stock ordering repair (proposal, 2026-11-13)

## Evidence and containment
Released agent-sprites 0.104.1 appends newly allocated stock objects to an attachment parent, then calls setDepth. Phaser Container does not reorder children from setDepth. Cyberpunkt PR150 made additional icon requests reuse the runtime, exposing a new icon ID above previously existing higher paint. Canvas and WebGL retained-versus-fresh hashes differ, with native depth112 after170. Cyber PR151 reverted only PR150 and was live verified; alpha-role preadmission remains unshipped.

## Additive opt-in ownership boundary
One private stock paint group per mount and actual attachment parent identity, not context ID. Contexts may alias the same actual parent and their commands must interleave. Runtime owns the private group and stock members; caller retains ownership of borrowed parent and unrelated siblings. Extensions remain siblings outside the group. Default extension overlay remains above stock; explicit host under-stock sendToBack remains below it. Reconcile orders only the private group using prepared commands, never caller siblings.

Explicit NativeScene container creation and owned group ordering capabilities are added to structural types and validated before allocation. No silent add-only compatibility fallback. Existing attachment-parent contract stays add-only. Existing world transforms and camera filtering must be verified with real renderers. Owned group lifecycle must precede attachment release; aliasing does not imply shared ownership of attachment releases.

## Tests before implementation
- Faithful CPU parent model, retained insertion/reordering/removal and kind replacement versus fresh order.
- Borrowed unrelated siblings; multiple mounts; retained extension overlay and under-stock identities.
- Aliased and distinct context parents, context replacement, cleanup and failure retirement.
- Real Canvas/WebGL exact pixels, including translucent rectangles, new icon IDs, clipped/scrolling text and input/focus changes.
- Existing producer UI and native gates, Cyber adopter contract and Fallow compatibility witness before adoption.

## Release constraints
No borrowed consumer vendor edits. New producer export must be authenticated through existing updater and reviewed. Object/group overhead and measured workload cost must be recorded. This is correctness work, not a claim of sustained60FPS. Admission experiments only return after exact pixel/input/lifetime parity, including insertion rather than same-ID changes.

## Compatibility decision
Use explicit stockOrdering: isolated; default direct mode preserves existing behavior and required capabilities. Validate scene.add.container only for opted-in mode. ContextAttachment shape and lease timing remain unchanged; support well-formed refcounted owned aliases, not a new exclusivity rejection. Cyber and Fallow use borrowed real Containers and will opt in after qualification. Hullgrown has structural scene wrappers without container and add-only tagging proxies; leave direct until explicit adapter migration. Rattletin shared-runtime adoption not found in accessible source; no universal repair claim. Direct mode retained-order defect remains documented.

Maintain borrowed empty group's stable sibling slot during context replacement while new attachments resolve. Owned leases remain responsible for keeping aliased actual parent alive until their final release. Context retirement removes its stock/extension resources before attachment release; final group release precedes final parent lease.

## Candidate and scope
Corrected native red reproduced retained/fresh pixel mismatch on Canvas and WebGL before runtime edits (1.54 seconds; native-red-corrected.log). Candidate reserves groups for empty stock, retires extensions on all contextRevisions dependencies, and phases cleanup to drain private resources before leases. Mixed borrowed/owned aliases remain permitted: the caller must keep surviving borrowed attachments valid beyond any owned lease release. Failed cleanup still attempts remaining phases. New stockGroups limit defaults to 256 only in isolated mode; aliases share a group, native.objects remains paint primitives. Not yet qualified or released.

Candidate version 0.105.0 reserves the additive opt-in contract; not yet released. Edge-red.log confirms the two review findings before correction. cpu-candidate.log: 155/155 runtime tests green; native-candidate.log: Canvas/WebGL retained/fresh insertion, retained overlay/under-stock extension and borrowed sibling survival green. Expanded transform/clip/mask/camera witness and full producer/consumer gates still pending. No restored icon preadmission and no FPS claim.

## Producer qualification
2026-11-13 HAL: full UI gate passed 553 tests across 15 owners plus strict consumer TypeScript check (46.42 seconds CPU). Existing native gate passed 16 cases with no failures (18.845 seconds), followed by retained-order tests in Canvas and WebGL (1.46 seconds). Expanded witness compares fresh direct versus isolated pixels under borrowed translation/scale/alpha, clipped stock, GeometryMask, and camera ignore; visible/hidden hashes differ to exclude blank false positives. Existing producer native gate remains default/direct, while new witness is explicit isolated. Cross-consumer qualification still pending.
