# Test audit: risk map, verdicts and safe fixes

Scope: all 244 vitest test files at commit f97fd8b (main), audited with the agent-tests test-audit skill (plugin version 0.7.0) and vitest 4.1.3. Phase `dev`, no backward-compatibility obligation (owner decision recorded in `.testing/risk.yml`). The audit read evidence from the static scan and then opened the flagged files; it never measured per-file wait time or CI minutes.

A follow-up pass on main at commit 05ed473 judged the 32 files the first audit could not judge because they had no risk tier (section 2), and recorded how the native admission classifier treats `site/**` and `examples/**` (section 3). By then main had 245 test files: the 245th, `tests/cli/native-admission.test.js`, was added between the two commits. It is tiered standard by the scan, was not opened by either pass and has no verdict; every count below is over the 244 audited files. Where a statement below describes the first audit only, it says so.

## Summary

- No file is untiered any more (section 2). The first audit tiered 212 of 244 files and gave those 212 these verdicts: keep 186 (88 of them kept unopened), rewrite 22, demote 4, merge 0, delete 0, quarantine 0. The follow-up pass tiered the other 32 and judged them: keep 25 (10 of them kept unopened), rewrite 7, demote 0, merge 0, delete 0, quarantine 0, no proposals. Six of the 7 rewrites are new in the follow-up; the seventh, `tests/cli/ui-software.test.js`, was rewritten in the first audit while it had no tier, and its row is now counted. Over all 244 audited files: keep 211 (98 kept unopened), rewrite 29, demote 4, merge 0, delete 0, quarantine 0. These are file-level counts; the two `merge` rows in section 1 (one removed test case and one removed assertion) leave their files at keep and rewrite.
- The 32 files were the ones the first audit could not judge. 20 of them had a code subject under `server/build/**` or `scripts/**`, which the risk map did not cover; two new standard areas in `.testing/risk.yml` tier them without a tag. The other 12 had no code subject and received a `@subject` or `@risk standard` tag at the top of the file (a comment line, no test code).
- No file is marked delete or merge, so estimated tokens in delete/merge files is zero, in both passes. The follow-up removed nothing, so no coverage comparison was needed for it. In the first audit, four test-level removals were proposed. Two were applied (one test case and one assertion line) after a coverage comparison showed no source file lost a covered line, statement, branch or function (section 7). Two were reverted: an independent proof found no direct covering assertion for their input, so one case was restored as it was and the other was restored and strengthened.
- No file had an `edit` lane before this audit, so no file was demoted out of the edit lane. Four files now carry `@lane scheduled`; the tag only records the decision because no script or include glob reads it yet. Three of the four are still low tier. `tests/engine/character-walk.test.js` became standard when `server/build/**` was mapped (section 1).
- The rewrites fix real hazards: shared temp paths and `Date.now()` file names (11 files in the first audit, 12 with the follow-up), writes into the checkout (1), the process working directory used to locate repo scripts (2 in the first audit, 5 with the follow-up), a wall-clock bound a loaded machine could miss (1, follow-up), and assertions that could not fail (about 10 files in the first audit, 11 with the follow-up).
- First audit, full suite on unmodified main: 1 failed file, 17 failed tests, 3207 passed, 3 skipped of 3227 tests, 173.7 s. Full suite on the final tree as it stood when that run was taken: 0 failed files, 244 passed, 3221 passed, 3 skipped of 3224 tests, 171.9 s. The 17 failures were the dangling-link cases in `tests/cli/ui-software.test.js`, which Windows refused (EPERM) for file symlinks. That run still had three test cases removed; two of them were restored afterwards, so the current tree has 3226 tests (3227 minus the one remaining removed case). That figure is arithmetic, and the two restored files were run alone, not the full suite.
- Both runs used `npx vitest run --maxWorkers=2` on the same machine. Nothing else was controlled (background load, cache), so the 1.8 s gap in wall time is not a speed result. The independent verifier later ran unmodified main and the audit branch back to back on the same machine: main 212.1 s, branch 205.7 s and 210.9 s. The wall time of the audit branch was in line with unmodified main. The earlier baseline of 173.7 s was taken at a quieter moment, so timing varies with machine load.
- Follow-up runs (same command, main at 05ed473, 245 files): baseline 245 files with 1 failed, 3231 tests (3228 passed, 3 skipped), 222.5 s; final tree the same counts, 205.9 s. The one failed file is `tests/cli/native-admission.test.js`, which fails to load on a CRLF checkout; that is not caused by the audit and the fix is on a separate branch that merges first, so it is expected here. The follow-up added, removed and skipped no test case, so the totals match exactly; the wall-time gap is not a speed result (section 7).

This document describes two branches. `test/audit-risk-map-and-safe-verdicts` (first audit): 28 edited test files, the new risk map `.testing/risk.yml` and this document, with `package.json` and `package-lock.json` unchanged. `test/audit-untiered-files` (follow-up): 14 edited test files (12 in tests/cli, one each in tests/db and tests/web), two added areas in `.testing/risk.yml`, and this document, again with the package files unchanged. Details in section 7.

## 1. Verdict table

Ordered by review priority: low-tier files that still run on every local run come first (cheap to change, lowest value per run), then rewrites by agent tokens (descending), then case-level proposals, then flagged files that were read and kept, by agent tokens (descending). The 32 formerly untiered files from the follow-up have their own group after the case-level proposals (rewrites, then keeps, each by agent tokens, descending). Cost columns are separate and no combined score is shown, because the `weights` in `.testing/risk.yml` are all 1. Churn is edits that touched the test without the code it covers, over all edits that modified it.

Files kept unopened (tiered, no findings, no flags, no lane tag): 98 (engine, db, io, import 32; cli and handlers 46; web, web-ui and root 20). They are counted, not listed, except the 10 formerly untiered ones, which are named under "Formerly untiered files" below. The first audit counted 88; the follow-up added 9 in tests/cli and 1 in tests/engine.

### Demote (tag written, no test code changed)

| File | Tier | Verdict | Why (finding rule and evidence) | Agent tokens | Churn |
|---|---|---|---|---|---|
| tests/native-costume.test.js | low | demote | Q6, frequency. Tier low (examples/**), untagged, runs on every local `npm test`. About 1.4 s in one run under load. Assertions are real (mirrored profiles, exposed hands, config rejection). Tagged `@lane scheduled`. | 1158 | 0/0 |
| tests/native-arm-swing.test.js | low | demote | Q6. Same reasoning, about 0.7 s under load. Assertions are real (foreshortening, alternating sides, silhouette connectivity). Tagged `@lane scheduled`. | 1045 | 0/2 |
| tests/engine/character-walk.test.js | standard (low in the first audit) | demote | Q6. Builds a real project through `buildProject` with a 20 s timeout, sits in tests/engine/** which the native workflow path filter matches. Not named in the native job run step, so not protected. Tagged `@lane scheduled`. In the first audit the tier was low: its second subject server/build/project-build.js had no risk area, so the low tier came from the first-matching `examples/**` area alone. With `server/build/**` mapped in the follow-up the scan tiers it standard (area `server/build/**`). The tier no longer supports the demote; the build cost and the 20 s timeout do. The tag is unchanged and the owner should confirm it (section 2). | 829 | 1/1 |
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

### Formerly untiered files (follow-up pass, 32 files)

These are the 32 files that section 2 describes, in three groups: 7 rewrites (the first table), 15 flagged or opened files kept (the second table) and 10 files kept unopened (named below the tables). Totals for the 32: keep 25, rewrite 7, demote 0, merge 0, delete 0, quarantine 0. No file-level proposal was made, so none needs a coverage comparison. 20 of the 32 take standard from the new `server/build/**` and `scripts/**` areas; the other 12 carry a tag, written in this pass. Rows say "tag" where one was written. Protected files (named in the native job run step or in the owner list of `scripts/test-ui.mjs`) received rewrites, tags or recorded verdicts only.

#### Rewrite (7 files, all applied)

| File | Tier | Verdict | Why (finding rule and evidence) | Agent tokens | Churn |
|---|---|---|---|---|---|
| tests/cli/project-set.test.js | standard | rewrite | Q5, `worktree.shared-tmp`. Protected (native run step), rewrite only. The relocation case built `join(tmpdir(), 'sprite-set-moved-' + Date.now())`, a name two runs can share. Now `mkdtempSync`; assertions unchanged. `shim.title-marker` x2 judged on current behaviour (portable ownership and moved-tree provenance are live code paths, not a dead shim). Its symlink case already skips by capability with a stated reason. Tier from `server/build/**`. | 7361 | 0/4 |
| tests/cli/ui-software.test.js | standard (tag) | rewrite | Worktree and platform hazard, rewritten in the first audit while it had no tier. 17 dangling-link cases failed with EPERM on Windows for file symlinks; the file now probes for a junction fallback and a link capability at load, runs the cases through the probed link type, and skips them with a stated reason when no link can be created. Protected (owner list of `scripts/test-ui.mjs`), rewrite only. The follow-up re-read the header (still real byte and receipt assertions) and added `@subject server/build/ui-software.mjs`; no further change. Details in section 7. | 1793 | 1/2 |
| tests/cli/generator-input.test.js | standard | rewrite | Q5. Protected (native run step), rewrite only. The case "generator phase is reported before stdout arrives" asserted that cancel returned in under 500 ms against a generator that answers after 1000 ms, a bound a loaded runner can miss. The generator now answers after 10 s with a 5 s policy timeout and the bound is 3 s: a cancel that waited for the generator would end in "timed out" and fail the match on "canceled", and a loaded machine has six times the headroom. Two other wall-clock bounds (under 3000 and under 1500 ms) sit in `test.skipIf(win32)` cases and were not changed because they could not be run on the machine used. Tier from `server/build/**`. | 1534 | 0/0 |
| tests/cli/construction-replay.test.js | standard (tag) | rewrite | Q5. The repo script and the example directory were located with `resolve()` from the process working directory, so a run started elsewhere copies the wrong path or none. Now anchored with `import.meta.url`. Tags `@subject server/engine/construction-replay.js` and `@subject scripts/sprite.js`. Assertions unchanged and real; a sentinel server counts contacts, so "offline" is asserted, not assumed. | 1078 | 0/0 |
| tests/cli/managed-invocation.test.js | standard (tag) | rewrite | Q5. Protected, rewrite only. `copyFileSync(resolve('scripts/sprite.js'))` located the repo script from the process working directory; now anchored with `import.meta.url`. Tag `@subject scripts/sprite.js`. The `worktree.absolute-path` hit is a data value for a mismatch case, not a hazard. | 876 | 0/0 |
| tests/cli/atlas-proof.test.js | standard (tag) | rewrite | Q5. Same working-directory hazard for `scripts/sprite.js` and `examples/atlas-proof`; now anchored with `import.meta.url`. Tags `@subject server/engine/atlas-proof.js` and `@subject scripts/sprite.js`. Assertions unchanged and real (decoded GIF page count, exact pixel comparison, no output directory on a rejected option). `SPRITE_PORT=1` is a deliberate unreachable port for the "no live session" claim, not a fixed-port hazard. | 710 | 0/0 |
| tests/db/sqlite-import.test.js | standard (tag) | rewrite | Q1 and Q4. No code subject: it loads better-sqlite3 through `createRequire` and imports no repo module, so the scan gave no tier. It exercises the dependency, not repo code, so `@risk standard` was written rather than a guessed critical. `server/db/session.js` (critical) loads the same module and `tests/db/session.test.js` opens a real database, so the file is partly covered; it is protected (tests/db is named as a directory in the native run step), so no delete or merge is proposed. `expect(db).toBeDefined()` after `new Database(':memory:')` asserted nothing a throw would not show; now `toBeInstanceOf(Database)` and `db.open === true`. The first test is unchanged. | 189 | n/a |

#### Formerly untiered files that were read and kept (15 files)

| File | Tier | Verdict | Why (finding rule and evidence) | Agent tokens | Churn |
|---|---|---|---|---|---|
| tests/engine/ui-phaser-runtime.test.js | standard | keep | Q2: `shim.title-marker` on "mount cycles leave borrowed atlas bookkeeping and fallback frame unchanged" is current behaviour (asserts `frameTotal` 1, `firstFrame` `__BASE`, no fragments), not an old-format path. Q4: 59 tests, 296 assertions; a hand-written fake Phaser scene and ports (not `vi.mock`) with state assertions plus real `layoutUi` and `defineTheme`. The `not.toThrow()` calls are followed by `inspect()` state assertions. The header states the limit (no native pixels or real input). Largest of the group; splitting by owner for affected-only runs is advice, not a verdict. Protected (test-ui owner list). | 18240 | 0/0 |
| tests/engine/ui-layout.test.js | standard | keep | Q2: `shim.title-marker` on "flow contract: legacy horizontal pagination ..." has no legacy branch behind it in `server/build/ui-layout.mjs`; the test pins `pageCount` 2 and `contentClipBounds.height` 10. The shared subject with ui-theme is only the `normalizeBitmapFont` fixture import, not shared assertions. 59 tests, 309 assertions of concrete geometry; no mocks, no temp paths. Protected (test-ui owner list). | 14783 | 0/0 |
| tests/cli/preflight.test.js | standard (tag) | keep | Tag `@subject scripts/sprite.js`. Opened because it had no subject. Nine cases assert concrete behaviour (exit code, stderr text, exact request list, exact JSON error envelope), with `mkdtemp` and port 0 or a picked free port. The one wall-clock bound (under 7000 ms against an 8 s exec timeout) separates an early child failure from waiting for the timeout. Not a duplicate of managed-invocation: different inputs (missing dependencies, foreign health payloads, redirect, ignored shutdown). The new `redundancy.shared-subject` on the CLI entry is hub noise created by the tag. | 2509 | 0/1 |
| tests/cli/ui-build.test.js | standard | keep | Protected (run step and test-ui owner list). Churn 8/12 is the highest of the group, so it was opened: the history is one feature commit after another to the UI build (new emitted artifacts, components, final-byte certification), each touching UI modules other than the one the scan resolves as subject. Not brittleness. Real byte-equality and emitted-module import assertions; `mkdtemp`, no clock or port. | 2497 | 8/12 |
| tests/engine/ui-components.test.js | standard | keep | No findings. Opened because it was small and read together with ui-theme. Frozen immutable nodes, rejected malformed input and family composition, all asserted. Protected (test-ui owner list). | 1861 | 0/0 |
| tests/cli/environment-build.test.js | standard | keep | Churn 3/4 opened. Five commits, each a new environment recipe (habitats, terrain, wasteland), with exact frame counts and report fields. `mkdtemp`. | 1671 | 3/4 |
| tests/engine/ui-theme.test.js | standard | keep | `redundancy.shared-subject` only (weak). Owns theme validation and inheritance (frozen results, rejected NaN, Infinity and wrong-type inputs, alias cycles) through `defineTheme` with concrete values; no assertion duplicates ui-layout. The `font()` and `themeInput()` fixtures repeat in other ui files, which is fixture reuse and not coverage overlap. Protected. | 1485 | 0/0 |
| tests/cli/owned-child-process.test.js | standard (tag) | keep | Protected, recorded verdict. Tag `@risk standard`: the subject is the test-support helper `tests/support/owned-child-process.js`, which the subject resolver drops and no risk-map area covers. Three cases with exact assertions on shutdown ordering and on a foreign listener receiving no requests. | 1399 | n/a |
| tests/engine/build-preview.test.js | standard | keep | No findings; the only unprotected file of the engine group. JSDOM tests of animation direction order, script-markup escaping, unsafe cumulative holds, canvas-restore redraw (exact draw counts, one listener) and one-shot and pause timing with an injected clock. Deterministic (fake `requestAnimationFrame` and `performance.now`). | 1301 | 0/2 |
| tests/cli/native-build.test.js | standard | keep | `redundancy.shared-subject` only (project-build hub). Concrete manifest, report and marker file-list assertions; `mkdtemp`. | 1297 | 0/0 |
| tests/cli/view-png-real-server.test.js | standard (tag) | keep | Protected, recorded verdict. Tags `@subject server/index.js` and `@subject scripts/sprite.js`. Single owner of "PNG views work against the real server entry point" (route tests inject a mock state, so a missing tmpDir once shipped unnoticed). Asserts the private DB path, the PNG width field (32 for scale 4) and file existence. The sheet case asserts only that the file exists; the sheet path is covered by `tests/handlers/view-tools.test.js` (PNG signature and 33x33 dimensions). | 1006 | 2/2 |
| tests/cli/owned-cli.test.js | standard (tag) | keep | Protected, recorded verdict. Tag `@risk standard` (subject is `tests/support/owned-cli.js`, same reason as owned-child-process). Two cases: close ordering and a blocked late continuation, with exact launch-file contents. | 706 | n/a |
| tests/web/project-import-shutdown.test.js | standard (tags) | keep | Q1: no subject resolved (it forks `tests/fixtures/import-owned-server.js`), so tags `@subject server/import/project-import-jobs.js` (owns the import directory) and `@subject server/web/http.js` (installs `state.disposeImports`) were written. `worktree.fixed-db-file` is a false positive: the database is `join(<mkdtemp dir>, 'child.db')`, the port is 0, and TEMP, TMP and TMPDIR point at the same temp directory. Real server, real HTTP POST; asserts the import directory exists, a foreign sentinel survives shutdown, exit code 0 and the directory is gone. The 5 s startup wait inside a 10 s test timeout is a possible flake source on a loaded runner, unproven. Protected, rewrite or record only. | 502 | 0/0 |
| tests/cli/native-compatibility-receipt.test.js | standard (tags) | keep | Protected, recorded verdict. Tags `@subject .github/scripts/native-compatibility.mjs` and `@risk standard`: `.github/**` has no risk-map area, so the subject alone left the file untiered. Four parameterised outcomes with exact `nativeResult` and recorded-outcome assertions. Each run spawns Node with a 4 s timeout; it passed under load with no timeout evidence, so the bound was not changed. | 450 | 0/0 |
| tests/cli/restart.test.js | standard (tag) | keep | Tag `@subject scripts/sprite.js`. Opened because it had no subject. One case with a tight `^restarted$` assertion that only the respawn path prints. Picks a free port and shuts the server down in `afterAll`. Not covered elsewhere: preflight covers only the refusal paths of `restart`. | 415 | 1/1 |

Kept unopened (10; tiered by the new areas, no findings, no flags, no lane tag, no edit): tests/cli build-manifest, build-publication, creature-build, font-proof, generator-build, generator-report, image-trace, managed-runtime and tileset-preview; tests/engine/ui-interaction.test.js (31 tests, 163 assertions). Verdict keep for all ten. Four of the nine cli files (build-manifest, build-publication, generator-build, managed-runtime) and ui-interaction are protected and keep by default.

Candidates for delete or merge that were considered and kept: preflight against managed-invocation (both check health identity, but the inputs differ, so no covering assertion owns the other's input); `restart` against the refusal paths in preflight (different paths); the sheet case of view-png-real-server against the view-tools handler test (the real-server file is the only owner of the entry-point wiring and is protected). sqlite-import overlaps in intent with `tests/db/session.test.js` and the native job's dependency step, but it is protected and costs 189 tokens, so it stays.

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

## 2. Files with no tier (history; none remain)

No test file is untiered. Every one of the 244 audited files has a tier and a verdict (section 1). The 245th, `tests/cli/native-admission.test.js`, has a tier from the scan (standard) but no verdict. The rest of this section keeps the history of why 32 files had none after the first audit and what closed each cause.

At the first audit 32 of 244 files had no tier, so by the rubric they got no verdict and none was tagged or judged. Two causes:

Twenty files had a subject under `server/build/**` or `scripts/**`, which `.testing/risk.yml` had no area for:

- tests/engine (6): ui-components, ui-interaction, ui-layout, ui-phaser-runtime, ui-theme, build-preview. The five ui files plus ui.test.js hold the most expensive tests in the project (about 48,000 tokens across the five that were untiered).
- tests/cli (14): build-manifest, build-publication, creature-build, environment-build, font-proof, generator-build, generator-input, generator-report, image-trace, managed-runtime (scripts/ and server/build), native-build, project-set, tileset-preview, ui-build.

Twelve files had no resolvable code subject at all, so a new area would not tier them; the scan asks for an `@risk` or `@subject` tag:

- tests/cli (10): atlas-proof, construction-replay, managed-invocation, native-compatibility-receipt, owned-child-process, owned-cli, preflight, restart, ui-software, view-png-real-server. They drive the CLI or a subprocess.
- tests/db/sqlite-import.test.js: loads better-sqlite3 directly.
- tests/web/project-import-shutdown.test.js: forks `tests/fixtures/import-owned-server.js`.

The first audit asked the owner three questions. The follow-up answered them:

1. A tier for `server/build/**` and `scripts/**`. Both were added to `.testing/risk.yml` as standard (the owner had kept them out of the critical tier). The 20 files above take standard from these two areas; none needed a tag for the tier. Two of them, generator-input and project-set, were then rewritten for other reasons (section 1).
2. For the 12 subject-less files, a tag each. Nine carry `@subject` naming the code they guard (`scripts/sprite.js`, `server/build/ui-software.mjs`, `server/index.js`, `server/engine/atlas-proof.js`, `server/engine/construction-replay.js`, `.github/scripts/native-compatibility.mjs`, `server/import/project-import-jobs.js`, `server/web/http.js`). Four carry `@risk standard`: owned-child-process and owned-cli (their subjects are test-support helpers, which the subject resolver drops), native-compatibility-receipt (its subject is under `.github/`) and sqlite-import (it exercises a third-party module, so no repo owner fits; the nearest, `server/db/session.js`, is critical, but standard was chosen over a guess). native-compatibility-receipt carries both kinds. The tags are comment lines at the top of the file; line endings were preserved.
3. Whether `examples/**` should still tier `tests/engine/character-walk.test.js` as low. With `server/build/**` mapped, the scan tiers it standard (area `server/build/**`) although its first subject is under `examples/**`. Its `@lane scheduled` tag stays; the demote verdict now rests on cost, not tier (section 1). The owner should confirm it. The scan's rule for a test with several subjects is not stated; see section 5.

Two paths that tests guard are still not named by any area in `.testing/risk.yml`: `.github/**` and `tests/support/**`. Every test file has a tier regardless, because the three affected files carry an explicit `@risk standard` tag. Adding the two areas would let those tags be dropped and would tier any later test of those paths without a tag.

Many of these files are protected (named in the native workflow run step or the test-ui owner list) and are only rewritten, never demoted or removed, whatever tier they get.

## 3. Project-level actions

The scan reported 13 project findings: 5 `wiring.drift`, 5 `redundancy.hub-subject`, 3 `frequency.*`.

- **Missing risk areas (wiring).** The first audit found 32 untiered files, which came from `server/build/**` and `scripts/**` having no area, plus files with no subject. The follow-up added both areas as standard and tagged the 12 subject-less files, so none remains (section 2). Two paths with tests are still not named by an area: `.github/**` and `tests/support/**`; three test files carry an explicit `@risk standard` because of that.
- **`wiring.drift` for assets, examples, recipes, site, skills.** `.testing/risk.yml` now has an area for each (`assets/**`, `examples/**`, `recipes/**`, `site/**`, `skills/**`), but a rescan on the final tree still reports all five as "matches no risk-map area". The areas do take effect for test files (examples-based tests are tiered low). The rule's directory matching looks inconsistent with the glob form; see tool friction in section 5. The owner should confirm the five tiers (they are marked "confirm" in the map).
- **Critical areas with no tests.** The scan raised none. `server/db/**` is the only critical area and has 7 test files in tests/db.
- **Hub subjects (no action).** server/engine/project.js (46 test files), server/db/session.js (34), server/web/http.js (32), server/build/project-build.js (22), server/handlers/draw.js (18). These look like shared facades, not duplication; no file was judged on this alone. They are the reason a change to one of them touches many tests (section 6).
- **Hooks and scripts.** No hook finding. `package.json` has `test` (`vitest run`), `test:watch`, `test:ui`, `test:ui:native` and `test:atlas-phaser`, no `pretest` and no hook that reruns the suite. Hook directories (.githooks, .husky) do not exist.
- **Lane tooling.** The risk map defines edit, merge, scheduled and release lanes, but no script or include glob reads `@lane`. The four `@lane scheduled` tags change nothing at run time until a lane filter exists.
- **Owner decision on a legacy shim.** `tests/web/progressive-project.test.js` lines 387, 496 and 640 protect `SessionDB.migrateShapeGroupAlias` in server/db (groups stored under a cell alias). With no backward-compatibility obligation, if alias-owned stored groups need no support, the migration code and those three tests should be removed together in a product change. Until then they protect current rename and copy behaviour on critical code and stay.
- **Residual hazards recorded, not changed.** At the first audit `tests/cli/generator-input.test.js` had wall-clock bounds (`< 3000`, `< 1500`, `< 500` ms) that can fail under CPU load and `tests/cli/project-set.test.js` built `sprite-set-moved-` plus `Date.now()` in the shared tmpdir; both were protected and untiered, so no rewrite was made without a tier decision. The follow-up rewrote project-set and the 500 ms bound in generator-input (section 1). The `< 3000` and `< 1500` bounds remain: they sit in `test.skipIf(win32)` cases that could not be run on the machine used. `tests/db/group-direction`, `group-fps` and `sessions-list` build DB files in the shared tmpdir with `Date.now()` plus a random suffix (collision-safe; cleanup not checked; protected).

### CI observations

Source: `.github/workflows/native-compatibility.yml` and `.github/workflows/pages.yml`, read in full for triggers and steps. Configured workflows do not prove Actions is enabled or that jobs ran; owner Actions policy is not known from the evidence, and nothing here enables or dispatches a workflow.

- **The workflow runs a named list, not the full suite.** The test step of the native job names the `tests/db` directory (7 files) and 26 more test files: 33 of 244 files (about 14 percent). The workflow has no step that runs the rest. Whole-suite coverage exists only through local `npm test`.
- **Trigger and matrix.** Native compatibility runs on `workflow_dispatch`, on release publication, and on pull request and push to main with a path filter. The matrix is Node 24 and 26 on ubuntu-24.04, windows-2025 and macos-15: 6 jobs per trigger, `max-parallel: 2`, 15 minute timeout each, `cancel-in-progress` already set. The filters include `tests/engine/**` and `tests/db/**`, so edits to those test folders (including this audit's) start the matrix. No draft-pull-request condition was seen.
- **Not in CI at all.** The 16 root `tests/native-*.test.js` files, and the scripts `test:ui`, `test:ui:native` and `test:atlas-phaser` (browser and TypeScript checks; the first also runs the 11 owner files listed in `scripts/test-ui.mjs`). No workflow calls `npm test`, `vitest run` on the full suite, or these scripts.
- **Pages workflow.** `pages.yml` builds the site and runs `node site/test.mjs`, then deploys to Pages on main. It is a publication trigger and must be preserved as is.
- **Timeouts.** A static search finds 32 test files that pass an explicit per-test timeout of 10 s or more (a five or six digit argument) and 2 that use `testTimeout` or a `timeout` option (overlap not checked), so about 33 files carry raised timeouts. The evidence shows the timeouts exist, not when they were raised. The default 5 s limit is real: `tests/native-large.test.js` hit it (6.07 s) under coverage overhead in one run.
- **Platform acceptance.** The risk map declares ubuntu, windows and macos for the scheduled and release lanes. Preserve Windows acceptance. A non-blocking Linux observer on pull requests and weekly or release full runs are options in section 6; they are subject to owner policy and to the required-check settings, which this audit could not see.

### Native admission (applied after the first audit; `site/**` rule added in the follow-up)

The native compatibility workflow no longer starts its six-job matrix for every change. A cheap `admit` job runs `scripts/native-admission.mjs classify` on the change set and the matrix `needs` it:

| Class | Examples | Runs |
|---|---|---|
| `native` | anything under `.github/`, `.claude-plugin/`, `scripts/`, `server/` or `tests/`, `vitest.config.js`, `package*.json` beyond version fields | the six-job matrix |
| `unknown` | a path no rule names (for example `examples/**`), a path that cannot be read, an empty change set | the six-job matrix, because unknown widens |
| `identity-only` | only the version fields of `package.json`, `package-lock.json` (both places), `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` | the cheap `Version identity` job, which checks the four versions agree |
| `documentation-only` | root `*.md`, `docs/**`, `skills/**` and `recipes/**` Markdown, `LICENSE`, and everything under `site/**` | only `admit` |

The table describes the behaviour after the follow-up change to `scripts/native-admission.mjs`, which merges before this document. Before it, `site/**` was `unknown` and so started the matrix. A change set that mixes `site/**` with a native path stays `native`. `examples/**` stays `unknown`. The same change pins `scripts/native-admission.mjs` to LF in `.gitattributes`: on a default Windows checkout the script had CRLF line endings and `tests/cli/native-admission.test.js` failed to load (a syntax error), which is the one failed file in the baseline run in section 7. The classifier gates only the native matrix; the Pages workflow has its own triggers.

Every release and every manual dispatch runs the matrix without consulting the classifier. The native job's steps are unchanged. The classifier runs from the pull request's own checkout, so a pull request that edits it decides its own admission; any change under `scripts/` is classified native by the version on `main` at review time, but the version in the pull request decides. `main` has no required status checks, so a skipped matrix cannot block a pull request.

## 4. Totals

- Estimated tokens in files marked delete or merge: 0, over all 244 audited files. No file-level delete or merge verdict was issued in either pass, so the coverage comparison was not needed for the follow-up and none was run. In the first audit, the two applied case-level removals (one test case in tests/web/http.test.js, one assertion in tests/engine/environment-wasteland.test.js) were not estimated. The two reverted proposals had been estimated at about 250 tokens together, and nothing was saved from them.
- Files demoted out of the edit lane: 0. No file had `Lane: edit`. Four files moved from no lane to `scheduled` (all in the first audit; the follow-up wrote no lane tag).
- Verdict counts, first audit (212 tiered files): keep 186, rewrite 22, demote 4, merge 0, delete 0, quarantine 0. No verdict (untiered): 32.
- Verdict counts, follow-up (the 32 formerly untiered files): keep 25 (10 kept unopened), rewrite 7, demote 0, merge 0, delete 0, quarantine 0. No verdict (untiered): 0. Of the 7 rewrites, 6 are new and 1 (ui-software) is the first audit's rewrite, counted now that the file has a tier. No file-level proposal.
- Verdict counts, all 244 audited files: keep 211 (98 kept unopened), rewrite 29, demote 4, merge 0, delete 0, quarantine 0. No verdict (untiered): 0. Files with a tier from the scan but no verdict: 1 (`tests/cli/native-admission.test.js`, added after the first audit). The two `merge` rows (one removed test case in http, one removed assertion in environment-wasteland) do not change the file-level counts, and the two reverted proposals (view-scale keep, view-tools rewrite) are already counted in keep and rewrite.

## 5. What this audit could not measure

- **Wait time per file.** The scan does not run tests. The only timings are the whole-suite runs (below) and one-off per-file durations from single runs under load in the web area (slowest: project-import-api 5.3 s, native-recipe 5.0 s, native-large 3.5 s, web-ui/workbench 3.1 s, progressive-project 2.6 s). Cost ranking therefore uses agent tokens only.
- **CI minutes.** Configured only; no run history was read.
- **Statistical flakiness.** One baseline and one final run each in each pass; no repeated runs and no CI history, so no quarantine verdict was possible or issued. A first coverage-mode run (not the plain baseline) had one timeout (native-large at 6.07 s against the default 5 s limit); it passed with a 60 s limit.
- **Mutation evidence.** None was run on the rewritten assertions. They were judged by reading: each now reads project or DB state that a no-op would leave unchanged. The junction fallback in `ui-software.test.js` was not proven against a mutated publisher.
- **Static scan limits** seen during the audit, reported as tool friction:
  - `shim.title-marker` matched "legacy", "fallback" and "compat" in titles of current behaviour in nearly every case (all 15 hits in the engine group, 12 of 13 in the web group, about 10 of 14 in the cli group). No hit led to a shim verdict.
  - `worktree.shared-tmp` fired on data strings such as `'/tmp/assets'` and missed `Date.now()` file names under tmpdir and writes under `process.cwd()`; the scan also did not flag `process.cwd()` used to find repo scripts.
  - `worktree.fixed-db-file` fired on `join(<mkdtemp dir>, 'child.db')`, which is safe.
  - `redundancy.shared-subject` flagged 25 of 90 engine files without a signal for behavioural overlap and ranks them above the files that needed edits.
  - `no-direct-assertions` does not say which test triggered it.
  - Risk-map assignment was read as first-match on one area, with no report of an unmapped second subject. The follow-up contradicts that reading: `tests/engine/character-walk.test.js` has subjects under `examples/**` (listed first, low) and `server/build/**` (standard), `examples/**` comes before `server/build/**` in the map, and the scan still assigns `server/build/**` and standard. The rule for a test with several subjects (highest tier, last area, or something else) is not stated and was not verified.
  - A `@subject scripts/sprite.js` tag, the honest subject of a test that drives the CLI, creates `redundancy.shared-subject` findings across the six cli files that carry it. They are hub noise: each file drives a different command.
  - `@subject` is dropped for test-support files, so a test of a support helper cannot name its subject and `@risk` is the only route. A CI evidence script under `.github` gets no tier from `@subject` alone, because the map has no `.github/**` area.
  - The scan did not flag `resolve('scripts/sprite.js')` (working directory used to locate repo scripts), the `Date.now()` name in project-set or the wall-clock bound in generator-input; all three came from reading.
  - For a dependency smoke test such as sqlite-import the report says only "no code subjects"; it does not name the repo files that load the same dependency, so the tier choice looks arbitrary.
  - The report cannot show cases skipped through `ctx.skip(reason)`, and does not say which files a workflow run step names (a `paths:` list is a trigger, not ownership).
  - `wiring.drift` still lists five directories that now have areas (section 3).
- **Evidence inconsistencies.** The cli part counts "18 opened keeps" but its rows total 19, and 9 rewrites plus 19 plus 37 unopened equals the 65 tiered cli and handler files. This document uses 19. The audit brief spoke of "four removed test cases"; the evidence showed three test cases and one assertion line. Two of the three cases were then restored (section 1), so one test case and one assertion line remain removed.
  Follow-up pass: the part notes disagreed in three places, resolved here from the rows and from the files. The tests/cli part counts 19 keeps among its 24 files and includes ui-software, which this document counts once, as a rewrite from the first audit (cli: 18 keeps, 6 rewrites). The tests/engine, db and web part counts "keep 6" among 8 files, but its rows give 7 keeps (6 engine files and project-import-shutdown) and 1 rewrite. The follow-up brief said keep 25 and rewrite 6 (31 files) for 32 files; with ui-software counted as a rewrite, the 32 are keep 25 and rewrite 7. The baseline run in section 7 was started from the audit worktree itself (not a separate checkout of unmodified main) while other agents were editing and running tests in it, so it may include some of the follow-up test edits; those edits change no test count and the run's one failure has an independent cause. The deletion and merge counts are 0 either way.

## 6. Architecture advisory

This section is advice on structure, separate from the file verdicts. Product architecture was not changed. Costs and savings below are estimates unless a measurement is named.

### What the evidence shows

- **One suite, one lane in practice.** Everything runs together through `vitest run`; 244 files took about 172 s of wall time at `--maxWorkers=2` (about 268 s of summed test time) on the machine used in the first audit; the follow-up run of 245 files took about 206 s (about 223 s in its baseline). The risk map defines four lanes, but nothing reads a lane tag, and CI covers 33 files.
- **Dependency fanout.** Five hub modules are imported by 18 to 46 test files each (section 3). Change to one of them can legitimately affect many tests; they are facades, and splitting them was not evaluated.
- **Repeated setup.** The `Date.now()` and shared-tmp fixtures found were setup duplication with a worktree hazard, now fixed in 11 files. Per-file setup cost was not measured.
- **Pipeline diversity and verification ownership.** The UI toolchain is verified in several places: the five engine ui files (untiered at the first audit, standard since the follow-up) plus `tests/engine/ui.test.js` (about 64,000 tokens together, the largest cluster), `tests/cli/ui-software.test.js`, `ui-build`, `generated-ui-build`, the `test:ui` script (which also runs a TypeScript consumer check) and `test:ui:native`. The audit read the producer-side tests and kept them; whether the browser and native scripts duplicate an assertion made in the vitest files was not traced.
- **Process boundaries.** Fixed shared paths were the main isolation problem and are fixed. The fixes make parallel worktree runs safe; they were not measured to change run time.

### Alternatives

Rankings compare the five options against each other (1 is best, 5 is worst). Time is the cost to do it now and the lag it adds later.

**Option 1. Record only: keep this audit's changes, add the missing risk areas, stop.**

- Time (rank 1): about 15 minutes for the map areas (estimate); no later lag. The follow-up already did this for `server/build/**` and `scripts/**`; `.github/**` and `tests/support/**` remain.
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

The first audit (branch `test/audit-risk-map-and-safe-verdicts`) and the follow-up (branch `test/audit-untiered-files`) are described in turn. The first audit's branch against main contains 28 modified test files (195 insertions, 96 deletions), one new file `.testing/risk.yml`, and this document. `package.json` and `package-lock.json` are unchanged (`git diff` on them is empty). The coverage comparison used `@vitest/coverage-v8@4.1.3` installed with `--no-save`, so it is in `node_modules` only.

### Risk map

`.testing/risk.yml` (new): `phase: dev`; consumers named for awareness (plugin installs from the marketplace, projects that read the exported atlas) with a note that no backward compatibility is expected; all weights 1; four lanes (edit: affected files on agent edit; merge: critical and standard before push; scheduled: all, on cron, three OS; release: all with clean install, on tag, three OS); and 13 areas. `server/db/**` is critical. `assets/**`, `examples/**` are low. `recipes/**`, `server/authoring`, `commands`, `engine`, `handlers`, `import`, `io`, `web`, `site/**` and `skills/**` are standard. The tiers come from the scan's draft and the file header still says "confirm or edit, then commit it". There was no area for `server/build/**` or `scripts/**`; the follow-up added both (below).

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

### Follow-up pass: formerly untiered files (branch `test/audit-untiered-files`)

Against main at 05ed473 this branch changes `.testing/risk.yml`, 14 test files and this document. `package.json` and `package-lock.json` are unchanged and no dependency was added. No test file was added, deleted or moved, and no test case or assertion was removed, so no coverage comparison was needed.

- Risk map: two areas added, both standard, in the map's sorted order: `scripts/**` (after `recipes/**`) and `server/build/**` (after `server/authoring/**`). Each carries a `why` saying the owner kept the path out of the critical tier in the first audit. The map now has 15 areas. It still names nothing for `.github/**` or `tests/support/**`.
- Tags only, no test code changed (8 files): native-compatibility-receipt, owned-child-process, owned-cli, preflight, restart, ui-software and view-png-real-server in tests/cli, and tests/web/project-import-shutdown. Tags are comment lines at the top of the file; the working-tree line endings were kept.
- Tag and code (4 files): tests/cli/atlas-proof, construction-replay and managed-invocation (repo script and example paths from `import.meta.url` instead of the process working directory), and tests/db/sqlite-import (`@risk standard`; `toBeDefined` replaced by `toBeInstanceOf(Database)` and `db.open === true`).
- Code only (2 files): tests/cli/project-set (`mkdtempSync` in place of a `Date.now()` name) and tests/cli/generator-input (the cancel-before-stdout case now uses a 10 s generator, a 5 s policy timeout and a 3 s bound, in place of 1 s, 1.5 s and 0.5 s).
- Checks on the edited files before the full run: the 12 tests/cli files alone passed (94 passed, 3 skipped, 37.9 s) and the 8 tests/engine, tests/db and tests/web files passed (256 tests, 6.1 s), both with `--maxWorkers=2`. The 3 skips are two win32-only cases in generator-input and the project-set symlink case, which skips by capability. No mutation run was made; the generator-input change was judged by reading.

### Protected-file rule

Files named in the test step of `.github/workflows/native-compatibility.yml` (the `tests/db` directory and the 26 listed files) and in the owner list of `scripts/test-ui.mjs` (11 files) received rewrites only: no demote, merge, removal or lane tag. `scripts/test-ui-native.mjs` names no test file. The `paths:` triggers in the workflow protect nothing, since they are triggers and not owner lists; an early pass wrongly treated all of tests/engine, tests/io and tests/db as protected and was corrected. Three protected files were edited, all as rewrites: `tests/db/session.test.js`, `tests/engine/atlas-verifier.test.js` and `tests/cli/ui-software.test.js`. No other edited file is on either list, and the two applied removals touched no protected file.

In the follow-up, protected files received rewrites or tags only. Rewritten: tests/cli/generator-input, managed-invocation and project-set, and tests/db/sqlite-import. Tagged only: native-compatibility-receipt, owned-child-process, owned-cli, ui-software, view-png-real-server and tests/web/project-import-shutdown. No file was demoted, merged, removed or given a lane tag, and every verdict recorded for a protected file is keep or rewrite.

### Full-suite result next to the baseline (first audit)

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

### Full-suite result next to the baseline (follow-up)

Command: `npx vitest run --maxWorkers=2`, the same in both runs, one run each. The baseline is main at 05ed473, run from the audit worktree at the start of the follow-up while other agents were running tests on the same machine; it may therefore include some of the follow-up's test edits, which change no test count (section 5). The final run is the last tree of this branch (all 14 test edits, the two risk-map areas and this document), with no other test run started by the audit.

| | Baseline (main 05ed473) | Final tree |
|---|---|---|
| Test files | 245 (1 failed, 244 passed) | 245 (1 failed, 244 passed) |
| Tests | 3231 (3228 passed, 3 skipped) | 3231 (3228 passed, 3 skipped) |
| Failed tests | 0 | 0 |
| Failed files | 1 | 1 |
| Duration | 222.5 s (vitest), 223.8 s wall | 205.9 s (vitest), 207 s wall |

The one failed file is the same in both runs, `tests/cli/native-admission.test.js`: it fails to load with a syntax error (0 tests run) because `scripts/native-admission.mjs` has CRLF endings on a default Windows checkout. It is not caused by this audit. The fix, an LF pin for that script in `.gitattributes`, is on a separate branch that merges first; this branch does not carry it, so the same load failure is expected here and was observed. After the pin merges the file's 13 tests (per the scan) should run, which would make 245 passed files and 3244 tests; that is arithmetic, not a run. The follow-up added, removed and skipped no test case, and the counts match the baseline exactly. The 16.6 s gap in wall time is not a speed result: the baseline overlapped with other agents' test runs and this run did not, and the first audit showed run-to-run swings of 30 s or more on this machine.
