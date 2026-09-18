# High-Detail Characters & Environments

Field guide for pushing past small game sprites into showcase-quality characters
(32×48+) and full environment cells (96×96+). Everything here was proven on the
Fallow Valley showcase ([recipes](../../../recipes/fallow-valley/)) — a 32×48 character (88 ops)
and a 128×96 environment (764 ops), both rebuilt idempotently from generator
scripts.

## Detail tiers — when to use what

| Tier | Cell size | Shapes/cell | Lighting | Workflow |
|---|---|---|---|---|
| **Game sprite** | 16×16–16×32 | 5–20 | `highlight`/`shadow`/`sphere-shade` auto tools work well | CLI or small batch; clone + tween across frames |
| **Showcase character** | 32×48–64×64 | 50–100 | **Hand-placed 1px seam lights**; auto tools only on large simple forms | Generator script → batch; iterate via `view --scale 8` |
| **Environment cell** | 96×96–128×96+ | 300–1000+ | Hand-placed; dither rows for gradients | Generator script mandatory; iterate via `view --scale 6` |

Pick the tier by on-screen size, not ambition: art viewed at 2–3× game zoom
never needs more than the game-sprite tier. Reach for showcase/environment tiers
for key art, title screens, portraits, cutscene panels, and marketing shots.

## Rules that only start mattering at high detail

**Auto-lighting blobs read as noise once shapes get dense.** The highlight/shadow
tools place arc clusters sized to the target — on a 14px-wide torso surrounded by
40 other shapes, those clusters collide and read as random patches. Above ~30
shapes per cell, switch to hand-placed seams: a 1px light line down the lit edge,
a 1px dark line down the shadow edge, per material. (The auto tools stay excellent
on big simple forms — a ball, a single wall face.)

**Selective outlines, dark-of-local-color, never black.** A figure sinks into a
same-value background (our scarecrow vanished into its field). Outline just the
silhouette edges that touch similar values, using a darker step of the *shape's
own* color ramp — full black outlines flatten the Fallout/SNES look.

**Saturation is a budget.** Desaturated palettes (db-32's olives/greys/rusts)
carry the scene; reserve the 1–2 saturated colors for what must draw the eye.
Every saturated pixel competes with your focal point.

**Silhouette first, story props second.** Block the figure as flat filled shapes
and check the read at `--scale 8` before any interior detail. Then add the
narrative props (the things that make a character *specific*) as small named
shapes on top — they survive edits because they're addressable.

## Environment recipes

**Paint in depth bands, back to front:** sky → far silhouettes → ground bands →
structures → props → foreground detail → atmosphere dots. z-order = draw order,
so a generator that walks the scene back-to-front needs no z bookkeeping.

**Dithered gradients: one single-phase checker row per band boundary,** placed on
the first row of the lower band. Two stacked rows (or opposite phases on adjacent
rows) merge into a solid stripe and the gradient dies:

```js
const dither = (y, x0, x1, color, phase = 0) => {
  for (let x = x0 + phase; x <= x1; x += 2) pt(x, y, color);
};
```

**Per-plank / per-shingle wobble sells construction.** A wall is a base rect +
seam lines every 3–4px + *irregular* lighter plank rects (regular alternation
reads as an awning). Same for shingle courses, fence posts, furrow rows — loop
in the generator, vary in the loop.

**Round produce: sparse ribs.** Segment lines every 2px turn a pumpkin into a
striped barrel. Three ribs maximum, none on anything under r3, and shorten side
ribs so they don't touch the outline.

**Figure-ground at scene scale:** any figure standing on the ground plane needs
either an outline (above) or a ground-shadow ellipse — ideally both. Fallout-style
dithered shadow: a dark ellipse with a second, smaller, darker one inside.

## Generator-script discipline (both tiers)

- **Lead the ops array with `{"command": "clear", "cell": ...}`** — the build
  becomes idempotent and every iteration is just re-run → view. (`clear` is
  batchable; see the tool reference.)
- Name every shape, auto-suffix in loops (`plank_seam_12`); enroll character
  shapes in a shape-group as you draw for later move/recolor.
- Keep the QA loop tight: regenerate → `batch` → `view --cell 0,0 --scale 6..8
  --out qa.png` → read the PNG. Judge nothing at 1×.
- Iterate in the generator, not the session: the emitted `build.json` is the
  reviewable artifact; the session is disposable.

## High-stakes calls need iterative user check-ins

Most sprite work is cheap to redo; these calls are not, and they are the user's
to make. Before acting on any of them, show current output and get a direction
check — then move in small confirmed steps:

- **Art-direction pivots** — changing the style contract, palette, perspective,
  or fidelity target mid-project
- **Replacing working assets** — swapping a shipped sprite set, pipeline, or
  rendering approach for a new one
- **Paid generation runs** — any image-model spend beyond a first exploratory
  batch, and any model choice or upgrade
- **Destructive conversions** — re-running converters or batch rebuilds that
  overwrite curated outputs

The cadence that works: produce one batch → render QA views → present with an
honest assessment (what worked, what failed, what it costs to continue) → wait
for direction → apply → next batch. Never chain generate → convert → integrate →
ship in one unreviewed pass. The user's eye is part of the QA loop, and a
check-in is cheaper than regenerating trust.

## Studying prior art before you draw

Ten minutes of looking beats an hour of guessing. Pull actual sprite sheets of
the games you're homaging (The Spriters Resource has most of them), view them at
3–4× zoom, and write down a *style contract* — 4–6 sentences naming construction
rules, outline policy, ramp depth, and a saturation budget — before the first
draw op. Every disagreement between your render and your reference then resolves
against the contract instead of by taste-drift.
