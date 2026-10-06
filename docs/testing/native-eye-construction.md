# Eight-direction native mannequins and face construction

Agent-sprites 0.73.0 extends each bare adult, child and large mannequin from 20 to 40 physical poses: the existing front/right/back/left rows, followed by front-right/back-right/back-left/front-left, each with idle and four walk frames at 8 fps. The 24-cell head reference sheet and [construction guide](../../examples/native-character/FACE-CONSTRUCTION.md) use the same diagonal heads as the walking bodies.

The diagonal faces retain a three-row brow/iris band, constant head volume through bob, opaque interiors, and restrained detail. Rear skulls omit facial features. Editable eye roles are independent of skin. The new bodies include articulated arms, torso planes, waist and separate legs; anatomical joints match the drawn limbs. Report-driven playback chooses eight sectors when supported, with cardinal fallback for existing reports. Only the original side profiles claim measured foot planting; diagonals use uncalibrated uniform travel.

## Verification

- **1,694/1,694 tests across 152 files pass**, using `npm test -- --maxWorkers=2`. The initial unrestricted run exceeded the five-second timeout in two unchanged environment rendering cases (8.2/6.7 seconds); their isolated 26-test file and the final reduced-concurrency full suite pass without source changes to those tests. [Test summary](native-eye-construction/test-proof.json).
- Across all three kinds and seven skin tones, all original cardinal occupied coordinates, body colors, aliases, walk tags and pivots remain unchanged. Eye material normalization changes 10 cardinal pixels for adult/large and 48 for child, preserving the child's blue irises. [Baseline proof](native-eye-construction/baseline-proof.json), against main `fe98708fbac92917b8b67d20944149cfc0584ee1`.
- Managed 0.73.0 builds for all three mannequins, the head study and an existing dressed adult pass. All 120 mannequin PNG frames match their source pixels exactly, with eight four-frame tags each and zero export errors/warnings. [Export proof](native-eye-construction/export-proof.json).
- Two consecutive managed builds reproduce all 38 output files byte-for-byte across the three mannequins and head study. [Rebuild proof](native-eye-construction/rebuild-proof.json).
- Muted headless browser checks display all eight facings for each body, exercise four walk frames plus idle, and retain the four-facing dressed preview without page errors. [Browser proof](native-eye-construction/browser-proof.json), [adult](native-eye-construction/adult-review.png), [child](native-eye-construction/child-review.png), [large](native-eye-construction/large-review.png).
- Independent visual/code review inspected all 120 final managed mannequin poses, 24 head references, and native-size art. It caught flattened initial diagonal anatomy and a simplified reusable front-eye pattern; both were corrected before the final run. All 60 diagonal body head poses retain closed interiors. No unresolved blocking finding remains.

## Scope

The original `sourceMannequin` remains a four-direction foundation for fitted clothing, wigs and costume/action recipes. Their diagonal fitting is separate work. The review page shows eight facings for a bare mannequin and the four supported facings when clothing or wigs are selected. No game sprites, installed plugin cache, or existing costume topology are replaced by this release.

Editable source: `server/authoring/native/native-diagonal.mjs`, `native-diagonal-head.mjs`, `native-eyes.mjs`, and `native-head-study.mjs`. Retained contact sheets live in `examples/native-character/preview/`; build configs regenerate editable projects, PNGs, atlases, reports and playback under `dist/`.
