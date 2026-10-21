# Agent Sprites showcase implementation plan

> Use h-superpowers:subagent-driven-development for the independent artwork task and its spec/quality reviews. Continue site integration in this session. The user authorized implementation and GitHub Pages publication.

**Goal:** Four carefully composed animated scenes at the README head and a public GitHub Pages field guide with eight marquee feature demonstrations. The user narrowed the site from every feature to the top eight during preparation.

**Architecture:** Commit portable static source under `site/`; assemble `site/dist/` from it, the actual command catalog, shared browser renderer and checked example exports. Serve no privileged API from Pages. Browser experiments are explicitly local demonstrations; disk, session and server workflows provide real runnable requests and downloadable files.

**Tech stack:** Native ES modules, CSS, Canvas, agent-sprites editable generators/builds/atlas-proof, GitHub Pages Actions. No framework or remote runtime dependency.

## Visual contract

An illustrated field guide: warm paper, midnight ink, electric blue with coral and leaf-green accents. Pixel display lettering paired with readable editorial text and monospace annotations. The signature is a large four-part animated diorama mosaic with numbered specimen captions; restrained dividers, generous margins and a working laboratory below. No generic gradient cards. Layout must work at 360px and 1440px, preserve nearest-neighbor artwork, provide keyboard focus and reduced-motion behavior.

## Task 1 — Four animated dioramas

Create `examples/showcase/` with reusable native pixel shape helpers, four generator/config/proof inputs, a build driver and explanatory README. Publish reviewed scene GIFs, posters, sprite sheets, atlases and editable project JSON under `site/assets/scenes/` (the site builder also consumes these committed assets). Required scenes: rainy night station, sunlit glasshouse, ember workshop, floating shrine. Use a coherent 176×112 or 192×128 source pixel grid; 24–40 frames per seamless loop; purposeful independent motion, readable focal subjects, depth, hue-shifted lighting and limited colors. Every scene must be editable named agent-sprites shapes, never just an imported flattened bitmap.

- [x] Create the four generators and isolated build configurations; declare all helper inputs.
- [x] Run each build through `node scripts/run-managed.js build <config> --json` and atlas proof through the same checked launcher. No owner session edits.
- [x] Inspect posters and full contact sheets, refine composition and motion, and report actual GIF timing/quantization results.
- [x] Commit only artwork source and reviewed portable scene assets.

## Task 2 — Eight marquee examples and static build

The eight editorial chapters are: editable shapes/ASCII, reusable composition, independently timed animation, character builders, world/UI recipes, surface lighting, construction replay, and game-ready exports. The complete command catalog remains a secondary expandable reference rather than the main presentation.

Create `site/build.mjs`, `site/feature-guide.mjs`, `site/test.mjs`, and `site/README.md`. Generate `commands.json` from `server/commands/catalog.js`, including every ID exactly once; do not maintain a stale handwritten command copy. Feature guide covers all nine build source kinds (ops, generator, character, native, creature, environment, UI, tileset and animation) plus replay, tracing, atlas proof, normal/light channels, ASCII, palettes, shape/layer editing, export/verification, app icons, project sets/incremental provenance, review/handoff and engine integration. Copy shared browser raster modules and linked portable example source trees into the deployment artifact. Never ship machine paths or mutable owner databases.

- [x] Build a capability manifest with explicit example paths, coverage IDs and runtime labels.
- [x] Add static checks for exact command coverage, all nine source kinds, link existence, relative deployment paths and forbidden private paths.
- [x] Run `node site/build.mjs` then `node site/test.mjs`; both must exit zero and show actual coverage counts.

## Task 3 — Responsive field guide and interactive laboratory

Create `site/index.html`, `site/style.css`, `site/app.js`, `site/labs.js`. Hero displays all four loops using exported atlas frames with pause, selection and download controls. Include interactive shared-renderer experiments for primitives/patterns, named shape edits and undo, surfaces/channels, seeded composition, exact timing, ASCII patches, plus visual example galleries for every recipe family and complete workflow/command reference. Search and category filters show empty state and count; requests are readable/copyable and correctly distinguish query parameters from POST JSON. No static-page control may claim it wrote a server file or changed a session.

- [x] Implement the HTML, CSS and actual interactive examples with persistent selected state, copy feedback and accessible controls.
- [x] Start an owned local static server; verify HTTP 200.
- [x] Inspect desktop and mobile in the available browser tool; exercise filters, tabs, scene controls, downloads, experiments, reset/undo and reduced-motion behavior. Fix console/network errors and overflow.

## Task 4 — README, publication and documentation

Modify README head to include the four actual scene GIFs and the demo link. Add `.github/workflows/pages.yml` with static artifact build/check and official Pages deploy actions; grant only contents read/pages write/id-token write. Keep source/deploy paths portable. Document build/preview instructions in `site/README.md`; document the project design/architecture in a fresh coordinated wiki operation after the implementation is concrete.

- [x] Run site checks, relevant existing tests and independent spec then quality review.
- [ ] Fetch/rebase latest, commit exact owned paths, create a reviewable PR and squash merge via normal GitHub flow. No commits to main checkout.
- [ ] Configure Pages if absent, observe the successful Actions deployment, verify the live URL and representative assets/interactions.
- [ ] Coordinate a fresh wiki window for any discover/ingest/catalog publication. Preserve foreign work and report actual canonical scope/closure/sync.

Completion requires four visually reviewed animated scenes, honest examples covering the command catalog and build families, a working public Pages URL, and a clean owned Git scope. Existing native-compatibility timeouts are not an all-platform success claim.
