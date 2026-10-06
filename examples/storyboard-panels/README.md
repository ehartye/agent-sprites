# Storyboard panel blocking

Render a story-owned panel manifest with existing managed named-shape batch,
export, verify and view commands. No image service or new CLI API is required.
The images establish subjects, settings and beginning/action/result staging;
they are rough blocking art, not final gameplay sprites or production boards.

Run the loaded plugin's sprite-setup check first, then pass its absolute launcher:

```powershell
node examples/storyboard-panels/generate.mjs examples/storyboard-panels/panels.json --out .local/storyboard-art --launcher C:/absolute/plugin/scripts/run-managed.js
if ($LASTEXITCODE -ne 0) { throw 'Storyboard rendering failed' }
```

Copy this example into the game project when adopting it. Keep generated assets
outside the plugin cache. `--out` controls every generated file; for a story
project use its explicit storyboard art directory.

Input is a nonempty JSON array of `{id, scene, stage, kind, caption?}`. IDs are
unique filename-safe strings. Each scene has exactly three distinct stages.
Numeric stages 1, 2, 3 sort in that order; three string labels keep manifest
order. Do not mix stage labels and numbers in one scene. Captions are preserved
in the output manifest and are not interpreted or baked into artwork.

Kinds: farm, engineering, space, relay, settlement, assembly, robot, shipyard,
orchard, inspection, evacuation, relocation, teleport, animals, network, meal,
dock, bridge, correspondence, system, robot-build, whole-grown, pressure,
fertilizer.
These are composition recipes, not inferred canon. A scene may use different
kinds across its three panels. Pod recipes show fixed planted destinations;
the network result draws all six links between four nodes without imposing a
route or range restriction. Do not infer story facts from the recipe imagery.

Use `whole-grown` for a coherent ship growing among planted ground; `orchard`
depicts fruit trees. `robot-build` shows parts, calibration, and service beside
people. `pressure` keeps civilian cultures visible and depicts demand, witnesses,
and an exit without an approval tick or surrendered control. `fertilizer` keeps
animal care, food bowls, samples, and comparison beds distinct without ranking
sample quality. `dock`, `bridge`, `correspondence`, and `system` provide principal
actions that a generic relay tower cannot depict. Choose kinds per panel when a
scene changes settings or activity.

Each panel writes `<id>.png` at 768×432, nearest-neighbor scaled from a 256×144
cell. `_sources/` stores replayable named operations, the original 3-cell sheet,
atlas, verification report and contact sheet per scene. `panels.manifest.json`
preserves input fields, cell mapping, paths and hashes. Structural verification
and distinct stage hashes are automatic; visual inspection remains `pending`
until a reviewer has seen every PNG. Review all panels together with the story's
captions; a generic kind recipe cannot prove it illustrates every narrated
detail. No animation or in-engine integration is claimed.

Rendering starts a separate live sprite session per scene. Pick an unused
`SPRITE_PORT` if a user is actively editing another session; ports share saved
storage but isolate active HTTP sessions. Failed commands stop immediately;
partial outputs may remain and must not be treated as a completed run.
