# Tessel character animation plan

> Execute with h-superpowers:subagent-driven-development: one isolated art implementer, independent spec review, then quality review. Root owns the review page and integration. This reversible asset task proceeds under the user's request without a design approval pause.

**Goal:** Create an original character and animation set from entirely new geometry, with a usable editable project, color/normal exports and a public animation review page.

**Character:** Tessel, the Foldback. A low, broad crescent shell over a petrol-colored body; six paddle feet, a ribbon tail and an expressive luminous face beneath the shell. Folded ivory/coral plates open into a fan for a bloom gesture. No human mannequin, robot chassis, moth head, inherited clothing or imported character geometry. The silhouette, pose keys, palette and source are independent of previous iterations.

**Scale contract:** 64×64 source pixels; 4× nearest-neighbor review. Standalone character anchor at source (32,55), transparent source background, full dark tinted outer silhouette for unknown game backgrounds. No differently scaled anatomy or effects.

**Palette:** Aubergine ink, warm ivory/coral shell planes, petrol/sea-glass underside, small amber signals. Hard readable clusters, hue-shifted shadow ramps, no character dithering. Distinguish face, shell and near/far feet at 1×.

## Asset task — owned by the art implementer

Create only `examples/tessel/**` and `site/assets/tessel/**`. Author readable original drawing/motion source and a declarative managed build. Use the actual enhanced tools: reusable named-part composition, exact cell milliseconds, retained normal/material/lamp data, paired normal export, construction replay and exported-atlas GIF proofs. Independent child animation composition may be added for a compact bloom vignette if it improves the result; no runtime changes are required.

- [ ] Eight keyed actions: idle, scuttle, burst, hop, listen, bloom, flinch, rest. Eight source poses each; left-facing variants may mirror these deliberately because no held asymmetric gear is present. Name all cells and sixteen animation tags. Preserve semantic part names.
- [ ] Timing: idle1600ms, scuttle800ms, burst400ms, hop1600ms, listen1600ms, bloom1600ms, flinch800ms, rest1600ms. Idle/scuttle/burst/rest loop; other actions play once. Use anticipation, contact, follow-through and action-specific silhouette changes, not just translation.
- [ ] Build through the absolute checked managed launcher, offline isolated state, unused `SPRITE_PORT=14795`. Never change the owner session database.
- [ ] Export portable `sheet.png`, `atlas.json`, `normal.png`, `normal.atlas.json`, `project.json`, construction replay, per-action GIF/contact/poster/proof and a combined eight-action proof. Use a matte explicitly when required; disclose GIF quantization and timing measurements.
- [ ] Inspect every right/left source frame and each action through its seam. Review at 1× and 4×, including normal alignment, silhouette, values, foot contact and source bounds. Iterate art quality.
- [ ] Rebuild driver must reproduce exports, keep local receipts ignored and publish no absolute machine paths. Commit exact owned art paths after verification.

## Review page and delivery — root

Create `site/tessel.html`, `site/tessel.js` and small scoped styles. Reuse field-guide typography/chrome while giving this character its own presentation. Show all eight actions, direction and color/normal selection, exact timing and frame scrub controls, pause/reduced-motion, and real downloads. Add the page to the static builder and a deliberate link/asset option to the character chapter. Use actual `*_right`/`*_left` tag ranges, trim offsets and pivots rather than the entire alias-bearing atlas array.

- [ ] Integrate reviewed asset contract, build and static artifact checks.
- [ ] Independently verify art spec, then code/art quality. Fix reproduced issues before publication.
- [ ] Test browser playback, scrubbing, direction/channel switching, downloads, reduced motion and mobile layout. Check transparent source/normal correspondence and actual GIF receipts.
- [ ] Commit on feature branch, rebase latest before squash merge, publish through normal Pages workflow and verify live review URL. No new runtime version or marketplace pin required.
- [ ] Draft a new original wiki asset/design record outside the vault; coordinate a fresh short catalog/publication window before any vault token or write. Preserve prior comparisons/evidence and foreign work.
