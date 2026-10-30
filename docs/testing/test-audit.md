# Test audit: risk map, verdicts and safe fixes

Scope: all 244 vitest test files at commit f97fd8b (main), audited with the agent-tests test-audit skill (plugin version 0.7.0) and vitest 4.1.3. Phase `dev`, no backward-compatibility obligation (owner decision recorded in `.testing/risk.yml`). The audit read evidence from the static scan and then opened the flagged files; it never measured per-file wait time or CI minutes.

## Summary

- Of 244 files, 212 have a tier and 32 do not (section 2). The 212 got these verdicts: keep 186 (88 of them kept unopened), rewrite 22, demote 4, merge 0, delete 0, quarantine 0 (file-level; the two `merge` rows in section 1, one removed test case and one removed assertion, leave their files at keep and rewrite). The 32 untiered files get no verdict, and one of them (`tests/cli/ui-software.test.js`) was rewritten.
- No file is marked delete or merge, so estimated tokens in delete/merge files is zero. Four test-level removals were proposed. Two were applied (one test case and one assertion line) after a coverage comparison showed no source file lost a covered line, statement, branch or function (section 7). Two were reverted: an independent proof found no direct covering assertion for their input, so one case was restored as it was and the other was restored and strengthened.
- No file had an `edit` lane before this audit, so no file was demoted out of the edit lane. Four low-tier files now carry `@lane scheduled`; the tag only records the decision because no script or include glob reads it yet.
- The rewrites fix real hazards: shared temp paths and `Date.now()` file names (11 files), writes into the checkout (1), the process working directory used to locate repo scripts (2), and assertions that could not fail (about 10 files).
- Full suite on unmodified main: 1 failed file, 17 failed tests, 3207 passed, 3 skipped of 3227 tests, 173.7 s. Full suite on the final tree as it stood when that run was taken: 0 failed files, 244 passed, 3221 passed, 3 skipped of 3224 tests, 171.9 s. The 17 failures were the dangling-link cases in `tests/cli/ui-software.test.js`, which Windows refused (EPERM) for file symlinks. That run still had three test cases removed; two of them were restored afterwards, so the current tree has 3226 tests (3227 minus the one remaining removed case). That figure is arithmetic, and the two restored files were run alone, not the full suite.
- Both runs used `npx vitest run --maxWorkers=2` on the same machine. Nothing else was controlled (background load, cache), so the 1.8 s gap in wall time is not a speed result. The independent verifier later ran unmodified main and the audit branch back to back on the same machine: main 212.1 s, branch 205.7 s and 210.9 s. The wall time of the audit branch was in line with unmodified main. The earlier baseline of 173.7 s was taken at a quieter moment, so timing varies with machine load.

This document describes the contents of branch `test/audit-risk-map-and-safe-verdicts`: 28 edited test files, the new risk map `.testing/risk.yml` and this document, with `package.json` and `package-lock.json` unchanged (details in section 7).

## 1. Verdict table

Ordered by review priority: low-tier files that still run on every local run come first (cheap to change, lowest value per run), then rewrites by agent tokens (descending), then case-level proposals, then flagged files that were read and kept, by agent tokens (descending). Cost columns are separate and no combined score is shown, because the `weights` in `.testing/risk.yml` are all 1. Churn is edits that touched the test without the code it covers, over all edits that modified it.

Files kept unopened (tiered, no findings, no flags, no lane tag): 88 (engine, db, io, import 31; cli and handlers 37; web, web-ui and root 20). They are counted, not listed.

### Demote (tag written, no test code changed)

| File | Tier | Verdict | Why (finding rule and evidence) | Agent tokens | Churn |
|---|---|---|---|---|---|
| tests/native-costume.test.js | low | demote | Q6, frequency. Tier low (examples/**), untagged, runs on every local `npm test`. About 1.4 s in one run under load. Assertions are real (mirrored profiles, exposed hands, config rejection). Tagged `@lane scheduled`. | 1158 | 0/0 |
| tests/native-arm-swing.test.js | low | demote | Q6. Same reasoning, about 0.7 s under load. Assertions are real (foreshortening, alternating sides, silhouette connectivity). Tagged `@lane scheduled`. | 1045 | 0/2 |
| tests/engine/character-walk.test.js | low | demote | Q6. Tier low (first match, examples/**), builds a real project through `buildProject` with a 20 s timeout, sits in tests/engine/** which the native workflow path filter matches. Not named in the native job run step, so not protected. Its second subject server/build/project-build.js has no risk area (section 2), so the low tier comes from first-match only. Tagged `@lane scheduled`. | 829 | 1/1 |
| tests/native-pressure-suit.test.js | low | demote | Q6. Heaviest low-tier root file (3 styles by cast, 25 cases, about 2.0 s under load). Behaviour is sound (sealed collar bridge, mirrored sides, 20 poses). Tagged `@lane scheduled`. | 677 | 0/0 |

### Rewrite (22 files, all applied)

| File | Tier | Verdict | Why (finding rule and evidence) | Agent tokens | Churn |
|---|---|---|---|---|---|
| tests/engine/atlas-verifier.test.js | standard | rewrite | Q5. Two CLI tests resolved `scripts/sprite.js` from `process.cwd()`; the file already used `import.meta.url` elsewhere. Hub file, 6 edits. Protected file (native job run step), so rewrite only. | 4887 | 1/6 |
| tests/cli/batch.test.js | critical | rewrite | Q5. Hand-built `Date.now()` temp directory name, not flagged by the scan. Churn reflects new batch features. | 2436 | 4/5 |
| tests/engine/cell.test.js | standard | rewrite | Q4. Serialize round trip only asserted the shape existed. Now asserts type, params and colour. | 1927 | 0/2 |
| tests/handlers/highlight-shadow.test.js | standard | rewrite | Q4. "Defaults" and "all 8 directions" asserted only `length >= 2`. Now compares default to explicit pixels and checks each direction's side of the shape centre. | 1697 | 1/2 |
| tests/engine/environment-edge-shade.test.js | standard | rewrite | Q4, readability. A `.replace` on a string hid the expected alias. Now a literal. `redundancy.duplicate-title` was a false positive. | 1355 | 0/0 |
| tests/web/cell-group-routes.test.js | critical | rewrite | `worktree.shared-tmp` and Q4. SQLite file at `tmpdir()/test-cell-<Date.now()>.db`, never removed; 11 of 14 assertions were only `body.ok === true`. Now an in-memory DB and per-route state assertions. | 1283 | 0/0 |
| tests/engine/outline-verifier.test.js | standard | rewrite | Q5. Same `process.cwd()` CLI path as atlas-verifier. | 1090 | 0/0 |
| tests/handlers/view-tools.test.js | standard | rewrite | Q5 and Q4. `Date.now()` temp directory; three export cases asserted only `existsSync`. Now PNG signature and dimensions (16x16, 33x33, 33x16). | 1019 | 0/3 |
| tests/cli/transforms.test.js | critical | rewrite | Q5. `Date.now()` temp directory, now `mkdtemp`. | 1001 | 1/1 |
| tests/engine/cell-manager.test.js | standard | rewrite | Q4. Four `not.toThrow()` checks and several `toBeDefined` asserted nothing about the grid. Now assert cell counts (100, 55, 130, 1056) and the restored shape type. | 992 | 0/3 |
| tests/web/shape-group-clone.test.js | critical | rewrite | `worktree.shared-tmp`. `Date.now()` DB file; `afterAll` called `info.close?.()`, which does not exist on the object `startWebServer` returns, so the HTTP and websocket servers were never closed. Now closes both and removes its temp directory. | 937 | 0/0 |
| tests/web/draw-routes.test.js | critical | rewrite | Same DB file hazard and hollow checks (`toBeDefined`, ok-only). Now asserts the created rect, moved coordinates, shape count after clone and delete. | 888 | 0/0 |
| tests/cli/sprite.test.js | critical | rewrite | Q4. Three `resize` cases asserted only that stdout was truthy. Now read the radius from the live project (5, 4, 6). | 887 | 2/2 |
| tests/engine/shape.test.js | standard | rewrite | Q4. `shape.id` `toBeDefined`; now matches `/^s\d+$/`. | 851 | 1/2 |
| tests/engine/shape-registry.test.js | standard | rewrite | Q4. `toBeDefined` then a type check; now one `toMatchObject` on type, params and colour. | 851 | 0/1 |
| tests/engine/reference.test.js | standard | rewrite | `worktree.shared-tmp`. Fixed and `Date.now()` names directly in tmpdir; now one `mkdtemp` directory, removed in `afterAll`. | 721 | 0/0 |
| tests/cli/export-aseprite.test.js | critical | rewrite | Worktree-hostile. Destination was `process.cwd()/assets/claude-sprites/tmp-export-test`, so the CLI child wrote into the tracked `assets/` of the checkout and cleanup removed files there. The child now runs in a private temp cwd. Not found by the scan. | 715 | 1/2 |
| tests/cli/clone-cell.test.js | critical | rewrite | Q5. `Date.now()` temp directory, now `mkdtemp`. | 672 | 1/1 |
| tests/cli/reference.test.js | critical | rewrite | `worktree.shared-tmp`. Fixed "bad path" name in the shared tmpdir could be created by another run and flip the case. Now one `mkdtemp` directory holds the image and the missing path. | 671 | 1/1 |
| tests/web/http.test.js | standard | rewrite | Q4. Two tests asserted only `typeof state.broadcast === 'function'` and `toBeDefined()`. Replaced by a test that connects a real `ws` client and receives a broadcast, and a listening-address lifecycle test. | 566 | 0/3 |
| tests/db/session.test.js | critical | rewrite | `worktree.shared-tmp`. DB path was `tmpdir()/test-${Date.now()}.db`, shared by every worktree, never removed. Now a per-test `mkdtemp` directory removed in `afterEach`. Protected (tests/db), rewrite only. The `/tmp/myproject` hits are data strings, not used paths. | 510 | 1/1 |
| tests/handlers/reference-tools.test.js | standard | rewrite | `worktree.shared-tmp`. Fixed `missing-ref.png` and `Date.now()` image name in the shared tmpdir. `redundancy.duplicate-title` was a false positive (different handler). | 429 | 0/0 |

### Case-level proposals (two removals applied, two reverted; section 7)

| File (file-level verdict) | Tier | Verdict | Why (finding rule and evidence) | Agent tokens | Churn |
|---|---|---|---|---|---|
| tests/cli/view-scale.test.js (keep) | critical | keep | Proposal downgraded after the independent proof found no direct covering assertion for the explicit `--sheet true` input. The proposed removal of case `view --sheet renders the whole sheet to a PNG path` rested on the bare-flag case `bare --sheet followed by another flag parses as boolean true`, which covers the bare form and not the explicit `true` argument. The case is restored exactly as it was on main, in its original position, so the file is unchanged. The file stays as sole owner of CLI flag parsing and `--out`. | file 698; the two reverted proposals were estimated at about 250 together, nothing saved | 3/4 |
| tests/handlers/view-tools.test.js (rewrite above) | standard | rewrite | The png case `renders png format when format=png` was strengthened and kept. It was the only exercise of the `format: 'png'` path of `handleViewCell` and asserted only `existsSync`, so the removal proposal was reverted. The case is back in its original position and now asserts the PNG signature and a 16x16 image for cell 0,0 through the file's `pngDims` helper, so a missing or wrong-size image fails it. | see the view-scale row | 0/3 |
| tests/web/http.test.js (rewrite above) | standard | merge | One test case removed (applied): `starts on a given port and returns port info` (`info.port > 0`) is covered by the lifecycle test (listening address equals `info.port`) and the `/health` fetch test. | not estimated | 0/3 |
| tests/engine/environment-wasteland.test.js (keep) | standard | merge | One assertion removed (applied): the `sha(...)` assertion on `{kind:'terrain'}` repeats the golden `terrain` hash owned by `tests/engine/environment-pixel-scale.test.js` ("default output is byte-identical"). The 24-frame and `animations` checks stay. `no-direct-assertions` was a false positive (88 asserts). | file 4407 | 0/1 |

### Untiered file rewritten (protected, rewrite only)

| File | Tier | Verdict | Why (finding rule and evidence) | Agent tokens | Churn |
|---|---|---|---|---|---|
| tests/cli/ui-software.test.js | none | rewrite | Worktree and platform hazard. 17 dangling-link cases failed with EPERM on Windows for file symlinks. The file now probes for a junction fallback and a link capability at load, runs the cases through the probed link type, and skips them with a stated reason when no link can be created. It has no tier (no code subject), so it is not among the 212 counted; the row records the edit. Protected, rewrite only. Details in section 7. | not estimated | not scanned |

### Flagged files that were read and kept

| File | Tier | Verdict | Why (finding rule and evidence) | Agent tokens | Churn |
|---|---|---|---|---|---|
| tests/engine/ui.test.js | standard | keep | `shim.title-marker` x6 describes current behaviour (fallback glyph, Phaser font metadata). 62 tests, 361 assertions. In the scripts/test-ui.mjs owner list. Largest tiered file; splitting by owner is an advisory item, not a verdict. | 15938 | 1/11 |
| tests/web/progressive-project.test.js | critical | keep | `shim.title-marker` x6: "legacy sockets" are clients without `?project=progressive-v1`, still served by `server/web/http.js`. Three "legacy alias" tests (lines 387, 496, 640) exercise `SessionDB.migrateShapeGroupAlias` in server/db. Owner decision in section 3. Protected. | 11737 | 0/0 |
| tests/web-ui/workbench.test.js | standard | keep | `redundancy.shared-subject` only; distinct behaviour from the other web-ui files. | 10098 | 0/3 |
| tests/web-ui/native-frame-consumers.test.js | standard | keep | `shim.title-marker` x3: unversioned cell data, a live path in `AnimationPreview`. Protected. | 8894 | 0/0 |
| tests/web/project-import-api.test.js | critical | keep | No findings; opened for protection. mkdtemp, port 0, 105 assertions. Slowest file in the web area (5.3 s in one run). Protected. | 7533 | 0/0 |
| tests/web-ui/native-frame-raster.test.js | standard | keep | `shim.title-marker` x6: "fallback" is the canonical non-worker raster path. Real pixel assertions. Protected. | 6033 | 0/0 |
| tests/engine/animation-composition.test.js | standard | keep | `worktree.absolute-path` is a deliberate negative input (an absolute Windows-style part path must be refused). | 4957 | 0/0 |
| tests/web-ui/cell-nav.test.js | standard | keep | `shim.title-marker` x3: the no-`IntersectionObserver` path, current behaviour. | 4472 | 0/2 |
| tests/cli/project-build.test.js | critical | keep | `shim.title-marker` x2 judged on code: `outputOwner` still writes the version-1 absolute marker across drives, and empty unused `ops` input is tolerated. | 4199 | 1/7 |
| tests/cli/generated-ui-build.test.js | standard | keep | Real byte and offset assertions; shares a subject with engine/ui at a different layer. In the test-ui owner list. | 3379 | 0/1 |
| tests/web/workbench-api.test.js | critical | keep | `shim.title-marker`: "without legacy grid caps" asserts large grids import and an unsafe integer is refused. Current behaviour. | 3085 | 0/3 |
| tests/engine/construction-replay.test.js | standard | keep | Spies on `renderCellRaw` are a causal negative control, restored in `finally`; not mock-only. | 2811 | 0/0 |
| tests/engine/image-trace.test.js | standard | keep | `vi.mock('node:fs')` injects ENOSPC at a real boundary. Fragile on the exact write count (`calls === 4`). | 2238 | 0/0 |
| tests/engine/verify-review-metrics.test.js | standard | keep | Pins the default verifier report to a stored literal; proves the opt-in review adds nothing to it. | 2116 | 0/0 |
| tests/engine/surface-raster.test.js, character-recipe.test.js, non-square.test.js, shared-validation-work.test.js (all tests/engine/) | standard | keep | `shim.title-marker` hits name current behaviour (flood erase, 128-frame limit, `cellSize` shorthand still read by `fromJSON`, the V1 `toJSON` loader). non-square owns cell height; project.test.js owns width. | 905 to 2371 each | 0/0 to 1/3 |
| tests/engine/environment-wasteland.test.js (see removal above), environment-overlay-edge, character-seat-corner, environment-transition, layer-allocation (all tests/engine/) | standard | keep | False positives: `duplicate-title` on different features; `no-direct-assertions` where the assertions sit in helpers or loops. | 244 to 1398 each | 0/0 to 1/1 |
| 25 files in tests/engine/, `redundancy.shared-subject` only | standard | keep | Weak evidence alone. Opened and compared: each owns a distinct behaviour (surface-lighting, -model, -normals, -state; raster, canvas-renderer, surface-raster; humanoid-face, insectoid-face; character alignment, anatomy, sides, gear, nonhuman; atlas-timeline, engine-loader-fixtures; palette, transforms, view-scale, and others). | 37087 total | 6/19 total |
| tests/cli/batch-parity, tween, destination, surface-authoring, build-replay (all tests/cli/); tests/handlers/publication, and ten more handler tests | critical or standard | keep | Opened. Concrete state assertions, sole owners of their behaviour, hub-subject noise on draw.js. `view-out` "temp-path behavior is unchanged" has no other owner. | 414 to 1414 each | 0/0 to 5/6 |
| tests/web-ui/ hit-test, layer-hit, erase-layer, redraw-scheduler, view-visibility, app-bulk-groups, app-catalog-loading, animation, frame-timing, surface-panel; tests/web/ retained-group-routes, frame-timing | standard or critical | keep | Shared subject only. Opened and compared: distinct seams (route versus handler, browser editor versus server validation). | 345 to 5418 each | 0/0 to 0/4 |
| 13 root tests/native-*.test.js files (large, layers, mannequin, diagonal, eyes, eye-polarity, joints, recipe, wardrobe, gear, garment-corners, report, walk) and tests/reference-grid.test.js, tests/storyboard-panels.test.js | standard or low | keep | Opened. CPU-only generator property tests with concrete geometry assertions. `native-eye-polarity` carries three SHA-256 goldens beside independent positional assertions. | 584 to 3823 each | 0/0 to 4/0 |

## 2. Files with no tier (risk-map gaps, no verdict)

32 of 244 files have no tier, so by the rubric they get no verdict and none was tagged or judged. Two causes:

Twenty files have a subject under `server/build/**` or `scripts/**`, which `.testing/risk.yml` has no area for:

- tests/engine (6): ui-components, ui-interaction, ui-layout, ui-phaser-runtime, ui-theme, build-preview. The five ui files plus ui.test.js hold the most expensive tests in the project (about 48,000 tokens across the five untiered ones).
- tests/cli (14): build-manifest, build-publication, creature-build, environment-build, font-proof, generator-build, generator-input, generator-report, image-trace, managed-runtime (scripts/ and server/build), native-build, project-set, tileset-preview, ui-build.

Twelve files have no resolvable code subject at all, so a new area would not tier them; the scan asks for an `@risk` or `@subject` tag:

- tests/cli (10): atlas-proof, construction-replay, managed-invocation, native-compatibility-receipt, owned-child-process, owned-cli, preflight, restart, ui-software, view-png-real-server. They drive the CLI or a subprocess.
- tests/db/sqlite-import.test.js: loads better-sqlite3 directly.
- tests/web/project-import-shutdown.test.js: forks `tests/fixtures/import-owned-server.js`.

What the owner needs to decide:

1. A tier for `server/build/**` and `scripts/**`. The audit suggests standard; critical only if build-output ownership counts as data loss. One area entry tiers the 20 files above.
2. For the 12 subject-less files, either an `@risk` tag per file or an `@subject` tag naming the code each one guards (for example server/web/** or server/import/** for project-import-shutdown).
3. Whether the `examples/**` first match should still tier character-walk as low once server/build/** is mapped (it has two subjects and takes the first area silently).

Many of these files are protected (named in the native workflow run step or the test-ui owner list) and are only rewritten, never demoted or removed, whatever tier they get.

## 3. Project-level actions

The scan reported 13 project findings: 5 `wiring.drift`, 5 `redundancy.hub-subject`, 3 `frequency.*`.

- **Missing risk areas (wiring).** The 32 untiered files above come from `server/build/**` and `scripts/**` having no area, plus files with no subject. This is the main wiring action.
- **`wiring.drift` for assets, examples, recipes, site, skills.** `.testing/risk.yml` now has an area for each (`assets/**`, `examples/**`, `recipes/**`, `site/**`, `skills/**`), but a rescan on the final tree still reports all five as "matches no risk-map area". The areas do take effect for test files (examples-based tests are tiered low). The rule's directory matching looks inconsistent with the glob form; see tool friction in section 5. The owner should confirm the five tiers (they are marked "confirm" in the map).
- **Critical areas with no tests.** The scan raised none. `server/db/**` is the only critical area and has 7 test files in tests/db.
- **Hub subjects (no action).** server/engine/project.js (46 test files), server/db/session.js (34), server/web/http.js (32), server/build/project-build.js (22), server/handlers/draw.js (18). These look like shared facades, not duplication; no file was judged on this alone. They are the reason a change to one of them touches many tests (section 6).
- **Hooks and scripts.** No hook finding. `package.json` has `test` (`vitest run`), `test:watch`, `test:ui`, `test:ui:native` and `test:atlas-phaser`, no `pretest` and no hook that reruns the suite. Hook directories (.githooks, .husky) do not exist.
- **Lane tooling.** The risk map defines edit, merge, scheduled and release lanes, but no script or include glob reads `@lane`. The four `@lane scheduled` tags change nothing at run time until a lane filter exists.
- **Owner decision on a legacy shim.** `tests/web/progressive-project.test.js` lines 387, 496 and 640 protect `SessionDB.migrateShapeGroupAlias` in server/db (groups stored under a cell alias). With no backward-compatibility obligation, if alias-owned stored groups need no support, the migration code and those three tests should be removed together in a product change. Until then they protect current rename and copy behaviour on critical code and stay.
- **Residual hazards recorded, not changed.** `tests/cli/generator-input.test.js` has wall-clock bounds (`< 3000`, `< 1500`, `< 500` ms) that can fail under CPU load; `tests/cli/project-set.test.js` builds `sprite-set-moved-` plus `Date.now()` in the shared tmpdir (both protected and untiered, so no rewrite without a tier decision). `tests/db/group-direction`, `group-fps` and `sessions-list` build DB files in the shared tmpdir with `Date.now()` plus a random suffix (collision-safe; cleanup not checked; protected).

### CI observations

Source: `.github/workflows/native-compatibility.yml` and `.github/workflows/pages.yml`, read in full for triggers and steps. Configured workflows do not prove Actions is enabled or that jobs ran; owner Actions policy is not known from the evidence, and nothing here enables or dispatches a workflow.

- **The workflow runs a named list, not the full suite.** The test step of the native job names the `tests/db` directory (7 files) and 26 more test files: 33 of 244 files (about 14 percent). The workflow has no step that runs the rest. Whole-suite coverage exists only through local `npm test`.
- **Trigger and matrix.** Native compatibility runs on `workflow_dispatch`, on release publication, and on pull request and push to main with a path filter. The matrix is Node 24 and 26 on ubuntu-24.04, windows-2025 and macos-15: 6 jobs per trigger, `max-parallel: 2`, 15 minute timeout each, `cancel-in-progress` already set. The filters include `tests/engine/**` and `tests/db/**`, so edits to those test folders (including this audit's) start the matrix. No draft-pull-request condition was seen.
- **Not in CI at all.** The 16 root `tests/native-*.test.js` files, and the scripts `test:ui`, `test:ui:native` and `test:atlas-phaser` (browser and TypeScript checks; the first also runs the 11 owner files listed in `scripts/test-ui.mjs`). No workflow calls `npm test`, `vitest run` on the full suite, or these scripts.
- **Pages workflow.** `pages.yml` builds the site and runs `node site/test.mjs`, then deploys to Pages on main. It is a publication trigger and must be preserved as is.
- **Timeouts.** A static search finds 32 test files that pass an explicit per-test timeout of 10 s or more (a five or six digit argument) and 2 that use `testTimeout` or a `timeout` option (overlap not checked), so about 33 files carry raised timeouts. The evidence shows the timeouts exist, not when they were raised. The default 5 s limit is real: `tests/native-large.test.js` hit it (6.07 s) under coverage overhead in one run.
- **Platform acceptance.** The risk map declares ubuntu, windows and macos for the scheduled and release lanes. Preserve Windows acceptance. A non-blocking Linux observer on pull requests and weekly or release full runs are options in section 6; they are subject to owner policy and to the required-check settings, which this audit could not see.

## 4. Totals

- Estimated tokens in files marked delete or merge: 0. No file-level delete or merge verdict was issued. The two applied case-level removals (one test case in tests/web/http.test.js, one assertion in tests/engine/environment-wasteland.test.js) were not estimated. The two reverted proposals had been estimated at about 250 tokens together, and nothing was saved from them.
- Files demoted out of the edit lane: 0. No file had `Lane: edit`. Four files moved from no lane to `scheduled`.
- Verdict counts (212 tiered files): keep 186, rewrite 22, demote 4, merge 0, delete 0, quarantine 0. No verdict (untiered): 32. The two `merge` rows (one removed test case in http, one removed assertion in environment-wasteland) do not change the file-level counts, and the two reverted proposals (view-scale keep, view-tools rewrite) are already counted in keep and rewrite.

## 5. What this audit could not measure

- **Wait time per file.** The scan does not run tests. The only timings are the whole-suite runs (below) and one-off per-file durations from single runs under load in the web area (slowest: project-import-api 5.3 s, native-recipe 5.0 s, native-large 3.5 s, web-ui/workbench 3.1 s, progressive-project 2.6 s). Cost ranking therefore uses agent tokens only.
- **CI minutes.** Configured only; no run history was read.
- **Statistical flakiness.** One baseline and one final run each; no repeated runs and no CI history, so no quarantine verdict was possible or issued. A first coverage-mode run (not the plain baseline) had one timeout (native-large at 6.07 s against the default 5 s limit); it passed with a 60 s limit.
- **Mutation evidence.** None was run on the rewritten assertions. They were judged by reading: each now reads project or DB state that a no-op would leave unchanged. The junction fallback in `ui-software.test.js` was not proven against a mutated publisher.
- **Static scan limits** seen during the audit, reported as tool friction:
  - `shim.title-marker` matched "legacy", "fallback" and "compat" in titles of current behaviour in nearly every case (all 15 hits in the engine group, 12 of 13 in the web group, about 10 of 14 in the cli group). No hit led to a shim verdict.
  - `worktree.shared-tmp` fired on data strings such as `'/tmp/assets'` and missed `Date.now()` file names under tmpdir and writes under `process.cwd()`; the scan also did not flag `process.cwd()` used to find repo scripts.
  - `worktree.fixed-db-file` fired on `join(<mkdtemp dir>, 'child.db')`, which is safe.
  - `redundancy.shared-subject` flagged 25 of 90 engine files without a signal for behavioural overlap and ranks them above the files that needed edits.
  - `no-direct-assertions` does not say which test triggered it.
  - Risk-map assignment is first-match on one area and does not report an unmapped second subject.
  - The report cannot show cases skipped through `ctx.skip(reason)`, and does not say which files a workflow run step names (a `paths:` list is a trigger, not ownership).
  - `wiring.drift` still lists five directories that now have areas (section 3).
- **Evidence inconsistencies.** The cli part counts "18 opened keeps" but its rows total 19, and 9 rewrites plus 19 plus 37 unopened equals the 65 tiered cli and handler files. This document uses 19. The audit brief spoke of "four removed test cases"; the evidence showed three test cases and one assertion line. Two of the three cases were then restored (section 1), so one test case and one assertion line remain removed.

## 6. Architecture advisory

This section is advice on structure, separate from the file verdicts. Product architecture was not changed. Costs and savings below are estimates unless a measurement is named.

### What the evidence shows

- **One suite, one lane in practice.** Everything runs together through `vitest run`; 244 files take about 172 s of wall time at `--maxWorkers=2` (about 268 s of summed test time) on the machine used. The risk map defines four lanes, but nothing reads a lane tag, and CI covers 33 files.
- **Dependency fanout.** Five hub modules are imported by 18 to 46 test files each (section 3). Change to one of them can legitimately affect many tests; they are facades, and splitting them was not evaluated.
- **Repeated setup.** The `Date.now()` and shared-tmp fixtures found were setup duplication with a worktree hazard, now fixed in 11 files. Per-file setup cost was not measured.
- **Pipeline diversity and verification ownership.** The UI toolchain is verified in several places: the five untiered engine ui files plus `tests/engine/ui.test.js` (about 64,000 tokens together, the largest cluster), `tests/cli/ui-software.test.js`, `ui-build`, `generated-ui-build`, the `test:ui` script (which also runs a TypeScript consumer check) and `test:ui:native`. The audit read the producer-side tests and kept them; whether the browser and native scripts duplicate an assertion made in the vitest files was not traced.
- **Process boundaries.** Fixed shared paths were the main isolation problem and are fixed. The fixes make parallel worktree runs safe; they were not measured to change run time.

### Alternatives

Rankings compare the five options against each other (1 is best, 5 is worst). Time is the cost to do it now and the lag it adds later.

**Option 1. Record only: keep this audit's changes, add the missing risk areas, stop.**

- Time (rank 1): about 15 minutes for the map areas (estimate); no later lag.
- Risk (rank 1): lowest. The change is a config file; a wrong tier only changes labels.
- Complexity (rank 1): none added.
- Best practice (rank 4): tags that nothing reads drift away from the code.
- Maintainability (rank 4): the `@lane` tags remain decoration until tooling exists.
- Replacement coverage: nothing removed.

**Option 2. Measure first: one timed JSON-reporter run per OS to get per-file wall time, then decide.**

- Time (rank 2): about an hour (estimate) including the three OS runs; adds no lag to the suite.
- Risk (rank 1, tied): read-only.
- Complexity (rank 2): a throwaway script; the data replaces guesses.
- Best practice (rank 1): the architecture reference asks for measured slow files before ranking.
- Maintainability (rank 1): nothing to maintain.
- Replacement coverage: nothing removed. Output closes the "wait time per file" gap in section 5.

**Option 3. Make lanes real: add a merge-lane script (for example `test:merge`) that excludes `@lane scheduled` files, and keep `npm test` as the full run.**

- Time (rank 3): about 1 to 2 hours (estimate). Local runs shed the 4 demoted files, roughly 4 to 5 s under load (estimate from the one-run durations; about 2 percent of suite time), so the speed gain is small.
- Risk (rank 3): a filter bug could silently skip a test. Mitigated by keeping the full run in `npm test`.
- Complexity (rank 3): one script that reads one comment tag.
- Best practice (rank 2): matches the lane model in `.testing/risk.yml`.
- Maintainability (rank 3): another place to keep in sync with the tags.
- Replacement coverage: the four demoted files still run in `npm test` and any scheduled run.

**Option 4. Add CI breadth: a non-blocking Linux job that runs the full suite on pull requests, and a weekly or release full run across three OS. Keep the existing native job, Windows acceptance and the Pages workflow unchanged.**

- Time (rank 5): about 2 to 4 hours to write and tune (estimate); adds CI minutes, which are unmeasured. The full suite is about 3 minutes on one machine, which sets the floor per OS.
- Risk (rank 4): adds a new failing signal; the 16 root native tests and other uncovered files could expose failures never run in CI. Needs owner approval of Actions policy and required-check settings.
- Complexity (rank 4): a second workflow and its triggers.
- Best practice (rank 1, tied with option 2): closes the gap that 211 of 244 files never run in CI, which is the largest finding.
- Maintainability (rank 5): more workflow to keep current.
- Replacement coverage: only adds coverage.

**Option 5. Shared test temp helper: one `tests/support` helper that creates a private temp directory, plus a check that new tests use it.**

- Time (rank 4): about 1 to 2 hours (estimate) to add and adopt in the files that still build tmpdir paths by hand.
- Risk (rank 2): touches protected files if adopted widely; adopt only where rewrites are already allowed.
- Complexity (rank 2): one small helper.
- Best practice (rank 3): prevents the hazard class the scan could not detect.
- Maintainability (rank 2): fewer hand-built paths; one place to fix.
- Replacement coverage: no assertion changes.

Suggested order if the owner agrees: option 1 now, option 2 next, then 3 and 4 with the measured numbers. The audit did not split `tests/engine/ui.test.js` by owner; that might make affected-only runs cheaper, but without a timing for the file and a run-selection setup it is an unmeasured hypothesis.

## 7. What was changed

Branch `test/audit-risk-map-and-safe-verdicts` against main contains 28 modified test files (195 insertions, 96 deletions), one new file `.testing/risk.yml`, and this document. `package.json` and `package-lock.json` are unchanged (`git diff` on them is empty). The coverage comparison used `@vitest/coverage-v8@4.1.3` installed with `--no-save`, so it is in `node_modules` only.

### Risk map

`.testing/risk.yml` (new): `phase: dev`; consumers named for awareness (plugin installs from the marketplace, projects that read the exported atlas) with a note that no backward compatibility is expected; all weights 1; four lanes (edit: affected files on agent edit; merge: critical and standard before push; scheduled: all, on cron, three OS; release: all with clean install, on tag, three OS); and 13 areas. `server/db/**` is critical. `assets/**`, `examples/**` are low. `recipes/**`, `server/authoring`, `commands`, `engine`, `handlers`, `import`, `io`, `web`, `site/**` and `skills/**` are standard. The tiers come from the scan's draft and the file header still says "confirm or edit, then commit it". There is no area for `server/build/**` or `scripts/**`.

### Lane tags written

`// @lane scheduled` as the first line of `tests/engine/character-walk.test.js`, `tests/native-arm-swing.test.js`, `tests/native-costume.test.js` and `tests/native-pressure-suit.test.js`. The scan reads them (Lane shows `scheduled` on a rescan). Line endings were preserved (the root and web files are CRLF in the working tree).

### Files rewritten (22) and other edits

- tests/db/session.test.js: per-test `mkdtemp` DB directory, removed after each test.
- tests/engine/reference.test.js and tests/cli/reference.test.js and tests/handlers/reference-tools.test.js: one `mkdtemp` directory for the image and the missing path.
- tests/engine/atlas-verifier.test.js and tests/engine/outline-verifier.test.js: CLI path from `import.meta.url`, not `process.cwd()`.
- tests/engine/cell-manager.test.js, cell.test.js, shape.test.js, shape-registry.test.js: real assertions replace `not.toThrow()` and `toBeDefined`.
- tests/engine/environment-edge-shade.test.js: literal alias in place of string surgery.
- tests/cli/export-aseprite.test.js: CLI child runs in a private temp cwd so the checkout is no longer written.
- tests/cli/batch.test.js, clone-cell.test.js, transforms.test.js and tests/handlers/view-tools.test.js: `mkdtemp` in place of `Date.now()` names; view-tools also asserts PNG signature and dimensions.
- tests/cli/sprite.test.js: resize cases assert the resulting radius.
- tests/handlers/highlight-shadow.test.js: direction cases assert pixel positions.
- tests/web/cell-group-routes.test.js, draw-routes.test.js, shape-group-clone.test.js: in-memory DB, private temp directory, state assertions; shape-group-clone now closes both servers.
- tests/web/http.test.js: broadcast-over-websocket and listening-address tests replace two shape-only tests.
- Not in the 22: tests/cli/ui-software.test.js (below), the four tag-only files, tests/engine/environment-wasteland.test.js (an assertion removal only). tests/cli/view-scale.test.js is unchanged against main after its case was restored.

### Removed test cases and the coverage comparison

Four removals were proposed: three test cases and one assertion line (rows in section 1). Two test cases were later restored (view-scale as it was, view-tools strengthened), so one test case and one assertion line remain removed. The comparison below was run with all four removals applied; restoring tests cannot lower coverage, so its result stands for the remaining two. The method ran the full suite with v8 coverage before and after, with identical flags (`--maxWorkers=2 --testTimeout=60000 --hookTimeout=60000`), and compared coverage per source file on statements, lines, branches and functions. A first baseline at the default 5 s timeout failed only on native-large (a timeout) and wrote no coverage, so it was discarded.

| | Before | After |
|---|---|---|
| Test files | 244 | 244 |
| Tests | 3227 (3224 passed, 3 skipped) | 3224 (3221 passed, 3 skipped) |
| Lines covered | 15766 of 16542 | 15766 of 16542 |
| Statements covered | 25515 of 27706 | 25515 of 27706 |
| Branches covered | 17598 of 20115 | 17598 of 20115 |
| Functions covered | 3640 of 3890 | 3640 of 3890 |

Result: 0 of 208 source files lost any covered line, statement, branch or function. Each covering test was also run alone and passed. The independent verifier reproduced the before-and-after coverage comparison across 208 source files and found no loss. Neither of the two files with a remaining removal is protected.

### Windows symlink handling in tests/cli/ui-software.test.js

The 17 dangling-link cases failed on unmodified main on Windows with EPERM because a default account may not create file symlinks. After the change the file does this, at load time:

1. A probe creates a temporary directory under `.tmp` (anchored to the file with `import.meta.url`, not the process cwd) and tries to create a dangling link, first of type `file`, then of type `junction`. A junction is an ordinary directory link on Windows that does not need the symlink privilege and that `lstat` reports as a link.
2. Only EPERM, EACCES, ENOSYS and ENOTSUP move the probe on to the next type; any other error is thrown. The probe directory is always removed. The result is `linkType`: `file`, `junction`, or `null` if neither could be created.
3. If `linkType` is `null`, or the environment variable `UI_SOFTWARE_NO_LINKS=1` is set (the old opt-out, kept), a reason string is built.
4. The 17 cases run through `test.for`. When a reason exists the case calls `skip(reason)` and ends; otherwise it creates the dangling link with the probed `linkType` and asserts the publisher throws an ownership, link or regular-file error and writes nothing.

So on this Windows machine the 17 cases run through the junction fallback; with no link capability they skip with the reason shown in the verbose report. The audit notes record 20 passed, 0 skipped here (17 of 17 failed before), and 17 skipped with the reason when `UI_SOFTWARE_NO_LINKS=1`. The fixtures in the file's other tests were also moved from `resolve('.tmp')` to the same file-anchored path. This edit was made to an untiered, protected file as a rewrite only.

### Protected-file rule

Files named in the test step of `.github/workflows/native-compatibility.yml` (the `tests/db` directory and the 26 listed files) and in the owner list of `scripts/test-ui.mjs` (11 files) received rewrites only: no demote, merge, removal or lane tag. `scripts/test-ui-native.mjs` names no test file. The `paths:` triggers in the workflow protect nothing, since they are triggers and not owner lists; an early pass wrongly treated all of tests/engine, tests/io and tests/db as protected and was corrected. Three protected files were edited, all as rewrites: `tests/db/session.test.js`, `tests/engine/atlas-verifier.test.js` and `tests/cli/ui-software.test.js`. No other edited file is on either list, and the two applied removals touched no protected file.

### Full-suite result next to the baseline

Command: `npx vitest run --maxWorkers=2`, the same on both trees, one run each, same machine.

| | Unmodified main | Final tree |
|---|---|---|
| Test files | 244 (1 failed, 243 passed) | 244 (244 passed) |
| Tests | 3227 | 3224 |
| Passed | 3207 | 3221 |
| Failed | 17 | 0 |
| Skipped | 3 | 3 |
| Duration | 173.7 s (vitest), 174.9 s wall | 171.9 s (vitest), 172 s wall |

No file failed with a timeout on the final tree, so no file needed a lone rerun. The 17 baseline failures were all `first publication rejects dangling ownership link ...` cases in `tests/cli/ui-software.test.js`. The tree of that run had 3 fewer tests than main because of the three removed cases; the passed count rises by 14 (17 fixed, 3 removed). Two of those cases were restored afterwards, so the current tree has one fewer test than main. The verifier's back-to-back timing (main 212.1 s, branch 205.7 s and 210.9 s) is in the summary: the branch is in line with main, and the 173.7 s baseline reflects a quieter moment.
