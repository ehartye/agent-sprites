# Creatures: quadrupeds, insects, arachnids, birds, crawlers and heavy bipeds

A `creature` build source expands into ordinary named `rect` operations, so every frame stays
editable and rebuilds are deterministic. One creature per build; its JSON is the whole source.

```json
{
  "version": 1,
  "output": "./dist",
  "creature": { "name": "rad-scorpion", "plan": "arachnid", "size": "64x44", "palette": "toxic",
                "features": ["stinger", "pincers", "shell", "glow_patch"], "attack": ["stinger", "pincer"] }
}
```

Unknown fields, features a plan cannot wear, out-of-range proportions and frames that do not fit the
cell are rejected with the field named. See [sprite-project.json](sprite-project.json) for a livestock example.

## Fields

| Field | Meaning |
| --- | --- |
| `name` | Project and atlas name (`^[a-z][a-z0-9_-]*$`). |
| `plan` | `quadruped`, `insect` (six legs, tripod gait), `arachnid` (eight legs, tail, pincers), `bird` (small biped), `blob` (crawler) or `biped` (a heavy two-legged body: mutant brute, golem, guard machine; 24x24 or larger). |
| `size` | `small` 16x16, `medium` 32x24, `large` 48x32, or any `WxH` from 16x16 up to 160x128. |
| `palette` | A preset (`dust`, `earth`, `rust`, `oxide`, `concrete`, `ash`, `scrub`, `toxic`) or `{ preset, body, belly, accent, cloth, metal, glow, patch }` where each role is a material name, four `#RRGGBB` steps, or `{ ramp, steps }`. Presets and ramp steps only use colours from the art-direction ramps; explicit hex steps are your own responsibility. Ramps are the Fallow Valley art-direction ramps (dust, rust, oxide, concrete, scrub, harvest, toxic, glow, night). |
| `proportions` | Multipliers 0.4 to 2.5: `bodyLength`, `bodyHeight`, `legLength`, `legThickness`, `headSize`, `neckThickness`, `tailLength`. |
| `head` / `tail` / `paw` | Quadruped: head `canid`, `bovid`, `swine`, `caprine`, `equine`; tail `whip`, `tuft`, `club`, `stub`; paw `paw` or `hoof`. Biped: head `brute` (low skull, brow, underbite) or `helm` (metal dome with a visor slit); paw `fist` or `claw`. |
| `features` | Names or `{ type, ...options }`: `horns` (`style` curved, straight, ram, short), `tusks`, `tail`, `stinger`, `pincers`, `mandibles`, `shell`, `fur` (`count`), `spikes`, `glow_eyes`, `glow_patch`, `beard` (`glow: true`), `wool`, `saddle`, `pack`, `extra_eyes` (`count`), `extra_limbs`, `second_head`, `metal_feathers`, `comb`, `antennae`, `hump`, `wings`, and for bipeds `core` (a glowing chest reactor), `pauldrons` (shoulder plates) and `cannon` (an arm weapon). Each plan lists what it supports in its error message. Options are validated: `horns.style` (curved, straight, ram, short), `count` (integer 0 to 12) on `fur`, `spikes`, `extra_eyes`, `metal_feathers`, and `beard.glow` (boolean). |
| `views` | Subset of `front`, `back`, `right` (default all three); `left` is not listed, it mirrors `right` unless `"left": false`. |
| `animations` | Subset of `idle`, `walk`, `attack`, `hurt`, `down` (default all). `idleFrames` is 2 (breathing) or 4 (adds an idle twitch). |
| `attack` | One kind or two. Quadruped `bite`/`charge`, insect `bite`, arachnid `stinger`/`pincer`, bird `peck`, blob `slam`/`bite`, biped `slam` (both fists overhead, then down), `sweep` (a flat swing) and `blast` (the arm cannon fires, with a muzzle flash). A second, different kind exports as `attack2_<dir>` (report alias `attack2`). |
| `outline` | `selective` (default: lit top/left edges use the second darkest step) or `full`. |
| `fps` | Overrides for `idle` (3), `walk` (8), `attack` (10), `hurt` (6), `down` (1). |

## Frames, tags and gaits

Aliases are `idle_<dir>_<n>`, `walk_<dir>_<n>` (4 frames), `attack_<dir>_<n>` (4 frames: wind-up, strike,
impact, recover), `hurt_<dir>_0` and `down_0`. Tags are `idle_front`, `walk_right`, `attack_back`, `hurt_left`
and `down`. Walks are derived from a gait phase, not hand placed: quadruped lateral sequence (hind, fore, hind,
fore a quarter apart), insect tripod, arachnid alternating tetrapod, biped alternation with a head bob.
The hurt frame is a hit flash with the head thrown back; `down` is a creature on its back with crossed eyes.

## Report

`creature-report.json` (manifest key `creatureReport`) carries `cellSize`, `ground` (the cell's bottom
edge, where the feet stand), `groundAnchor` (cell centre x), a collision `footprint` rectangle in source pixels
(70% of the standing silhouette wide, 22% of the cell high, on the ground line) plus a `footprints` rectangle per
direction, `attacks`, `animations` (frames, fps, loop), `directions`, `aliases` patterns and per-frame `bounds`.
Walk frames carry `locomotion`, so `playback-runtime.mjs` (`createWalker`, `drawAtGround`) works unchanged with
`person`/`outfit` omitted. The pivot is bottom centre.

## Bipeds

`plan: "biped"` draws a hunched mutant brute or a guard machine from one set of proportions: a torso, two thick legs (cloth or metal),
two long arms and a small head, in front, back and right views, with a four-frame walk where the arms swing against the legs, the
three attacks above (frame 0 is the wind-up pose a game can hold as a telegraph, frame 2 the impact), a hurt flinch and a down pose
on its back. Use a boss-sized cell (`72x72`, `56x64`): the plan needs at least 24x24. `palette` roles work as for the other plans:
`body` is the skin or casing, `cloth` the trousers, `metal` the plates, `glow` the sores, eyes and core.

```json
{ "creature": { "name": "behemoth", "plan": "biped", "size": "72x72", "head": "brute", "paw": "fist",
  "features": ["hump", "spikes", "tusks", "glow_patch", "glow_eyes", "pauldrons"], "attack": ["slam", "sweep"] } }
```
