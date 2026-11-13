# Compact internal appearance feedback assessment

Date: 2026-11-13. Base: canonical main `2e5daa28642ad185476cc5fe96fa2e1d19120aaf` (0.104.0).

## Evidence and scope

A controlled Cyberpunkt inventory tooltip specimen identified full native mount updates as the majority of publication time. A separate optional CDP profile attributed approximately 241 ms inclusive to rich interaction inspection over 24 transitions. These are instrumented synchronous observations, not gameplay FPS or a causal release comparison.

The native renderer previously paginated complete public interaction observations twice per publication/input handling, spreading complete layout records when only paint state was needed. The replacement is a private module-level `readUiAppearance` helper backed by a WeakMap of genuine interaction instances. It returns a new frozen snapshot of id, visibility state, enabled, optional selected paint truthiness, focus, hover and pressed state. Held control IDs are computed once per snapshot. No cache persists observations.

Two native internal feedback consumers use this reader. Public `inspect`, public instance method shape, scope/input admission, immutable layout certification, source/asset validation, extension callbacks and transaction ownership are unchanged. The helper is not re-exported from the public index.

Raw portable scopes can admit nonboolean `selected` data. The internal snapshot intentionally preserves absent/undefined selection and normalizes other values to boolean paint truthiness, matching the native reconciliation conditional. Raw/public observations retain their original admitted values. This avoids leaking structured selection data while adding no rejection to existing admission.

## Test-first and qualification

- Six focused dependency-free contracts first failed because the internal reader was absent.
- A seventh selected-edge contract then failed on `null` versus `false`; private normalization resolved it without changing public values.
- Final focused result: 7 passed. Included by the existing interaction test owner in the canonical UI gate.
- `npm run test:ui`: 533 passed across 15 files; strict TypeScript consumer gate passed.
- `npm run test:ui:native`: 16 passed, zero failures, both WebGL and Canvas; cleanup passed.
- `node --test --test-concurrency=1 tests/native-ui/appearance-parity.test.mjs`: 2 passed. Each renderer compares 12 exact states with a test-only reference that restores the previous paginated public-observation path. More than 256 records, linked state-owner text, selection, disabled focus, hover, press/release/blur, accepted and rejected updates are covered. Exact pixels, input intents, resource state, asset requests and extension callback counts match; teardown passed.

Receipts: `compact-appearance-ui-20261113.log`, `compact-appearance-native-20261113.log`, `compact-appearance-parity-20261113.log`; detailed native parity reports remain outside the tracked source. No native runtime behavior flag was added for the reference comparison.

## Remaining gates

This is a qualified producer candidate, not a published release. Import the complete authenticated software export into an isolated Cyber consumer, repeat its unchanged fixed tooltip publication assay and representative ordinary-input performance observation, and retain exact artifact/pin identity. Do not claim solid 60 FPS from these producer tests. Version metadata-only edits do not warrant repeating unchanged runtime gates.
