# Editable normals, materials and lighting

Use the absolute matching managed launcher resolved from the loaded skill, after
the setup/version check. In the commands below, `sprite.js` means
`node "<this-plugin-root>/scripts/run-managed.js"`. Preserve the existing server
port and session; ports share the default database. Add `--session SESSION_ID`
to pin each authoring, query, batch and export request. Stop on command failure.

## Author a shape surface

Inspect the current project and choose its actual named shape. Save this as
`surface.json` in the asset source folder:

```json
{
  "normal": {"mode": "bevel", "width": 2, "depth": 1},
  "material": {"solid": true},
  "lamps": [{"name": "warm-key", "x": 5, "y": 4, "radius": 32,
             "power": 1, "z": 4, "color": "#ffd7a3"}]
}
```

```text
sprite.js surface read --cell 0,0 --shape panel --session SESSION_ID
sprite.js surface set --cell 0,0 --shape panel --file surface.json --session SESSION_ID
sprite.js surface clear --cell 0,0 --shape panel --session SESSION_ID
```

Setting replaces that shape's complete surface object; include any material or
lamps that should remain. Clearing removes the object. Each successful change is
one cell undo entry. Geometry, name and ID remain editable. Use `--shape-id ID`
instead of `--shape NAME` for an unnamed shape. Names and IDs are separate typed
selectors, so a shape named like another shape's ID cannot redirect the edit.

Normals derive from this shape's actual painted alpha mask, including holes,
patterns and clipping. Each four-connected blob gets its own dome. Luminance
uses this shape's painted RGB; choose a shape containing the intended shading.

| Normal object | Meaning |
|---|---|
| `{"mode":"flat","vector":[0,0,1]}` | Finite nonzero direction, normalized; z must be nonnegative. Omitted vector is flat. |
| `{"mode":"bevel","width":2,"depth":1}` | Edge slopes over the given width, flat interior. |
| `{"mode":"dome","depth":2}` | Connected painted regions bulge independently. |
| `{"mode":"luma","depth":3}` | Painted brightness becomes height. |
| `{"mode":"grid","x":4,"y":3,"rows":["789","456","123"]}` | Explicit global origin and equal-width direction rows. |

Grid digits follow the numpad: 8 up, 2 down, 4 left, 6 right, corners diagonal,
5 toward the viewer. Soft `qwe/asd/zxc` use the same compass positions with z=2
instead of 1. `0`, dot and space are flat. Pixels outside the grid are flat.
Surface flags are `solid`, `wall` and `unlit` booleans. Lamps require unique
nonempty names within their shape, integer global x/y and visible opaque hex
colors. Radius and power are positive; z is nonnegative. Defaults are radius 32,
power 1, z 8 and white. A visible transparent point can carry a lamp without
painting art; hiding a shape disables its attached lamps.

## Enable a cell's lighting

Save an explicit policy as `lighting.json`:

```json
{
  "palettePolicy": "rgb",
  "cell": 2,
  "smooth": false,
  "block": 0.4,
  "shape": "round",
  "ambient": 0.15,
  "ambientColor": "#ffffff",
  "sky": 0,
  "skyColor": "#ffffff",
  "skyReach": 24,
  "skyDir": [0,-1],
  "relief": 1
}
```

```text
sprite.js lighting set --cell 0,0 --file lighting.json --session SESSION_ID
sprite.js lighting read --cell 0,0 --session SESSION_ID
sprite.js lighting clear --cell 0,0 --session SESSION_ID
```

`rgb` multiplies painted RGB by the computed light, permitting off-palette
colors. `nearest` selects the nearest declared opaque palette RGB, with stable
palette-order ties. It requires at least one opaque candidate. Both retain alpha
and leave unlit pixels unchanged. The policy is required whenever lighting is
enabled. Clearing lighting restores painted color rendering while retaining
normals, materials and attached lamps.

`cell` sets grid size from 1 through 64; `smooth` interpolates between grid
centers. Round propagation uses eight neighbors and prevents diagonal corner
cutting; diamond uses four. Radius controls open-space reach. Solid coverage
attenuates intensity by fractional `block` loss per eight pixels of thickness,
including half of each endpoint cell; it transmits no more than ordinary air.
Block 0 has no extra loss; block 1 fully blocks positive solid thickness.
Wall coverage stops direct sky seeding but allows propagated light through.
Sky seeds open columns until the first solid or wall. Ambient is directionless;
colored sources combine by maximum per RGB channel.

`skyDir` points toward the sky source in image coordinates, with +y down.
Normal relief uses `max(0, 1 + relief*(max(0,N·L)-Lz))` per source so flat
normals match unmodeled art, including z=0 lamps; relief 0 ignores normals.
The exact zero-distance direction is [0,0,1]. This is an offline 2D lighting
model; the export does not install a game engine's runtime lighting system.

## Move, compose and review

Shape movement carries attached lamp/grid origins. Flips and 90/180/270-degree
clockwise rotations also turn flat vectors and grid directions; lamp height is
unchanged. Whole-cell transforms include sky direction. Layer movement and
reusable parts retain surface metadata. Whole-cell copying carries cell lighting
and independently cloned metadata. Derived normal modes regenerate from the
transformed mask; explicit grids retain their authored pixel dimensions.

Animated composition retains each source's normal/material/lamp metadata.
Set optional `animation.lighting` for the parent scene's bake. Source cell
lighting is not baked into copied geometry; the parent applies its own lighting
once, preserving future editability.

In the browser's Lighting tab, choose the current cell and shape, edit a normal
preset or full surface JSON, material flags and attached lamps, then save.
Cell lighting has its own save/disable actions and palette policy. Review color,
normal and light-map channels from the shared server. Preview is read-only;
save failures preserve drafts and session/cell changes invalidate old responses.
Flat overpainting clears earlier normals and material flags where it covers;
partial-alpha coverage blends auxiliary channels. Erasers affect the same
isolated content in all channels, preserving neighboring child surfaces and
their backgrounds. Display canvases have normal alpha quantization; raw channel
arrays and normal PNG exports preserve encoded direction bytes.

For saved channels on disk, use the existing guarded view command:

```text
sprite.js view --cell 0,0 --channel normal --out review/normal.png --session SESSION_ID
sprite.js view --cell 0,0 --channel light --out review/light.png --session SESSION_ID
```

`--channel color|normal|light` also works with `view --sheet` or `view --stack`.
The browser preview route is `GET /api/cell/surface-preview?cell=0,0&channel=normal`
with the same `X-Sprite-Session` header when calling HTTP directly.

## Export matching color and normal atlases

```text
sprite.js export --dest public/art --trim true --session SESSION_ID
sprite.js export --dest public/art --normal true --session SESSION_ID
```

Authored visible normals automatically add `<name>.normal.png` and
`<name>.normal.atlas.json`; `--normal true` includes a flat normal map when none
was authored, and `--normal false` explicitly omits the pair. Build config
`normal: true|false` has the same meaning. Browser on-disk export offers
Auto/Include/Omit. Trim requires a transparent project background.

Normal packing copies the color atlas's rectangles, source-size offsets, empty
frame pixel, aliases, durations, directions and pivots. It never independently
trims normals. Internal axes are +x right, +y down, +z toward the viewer;
export RGB encodes x,-y,z with flat [128,128,255] and the exact source alpha.
Color metadata records baked cell lighting and its palette policies. Normal
metadata identifies its color companion and encoding; light is not baked into
the normal image. Verify both atlases and inspect frame alignment before engine
integration. The [editable example](../../../examples/surface-lighting/README.md)
includes a three-pose moving lamp, trimmed paired atlases and construction replay.

Batch edits use `{"command":"surface","cell":"0,0","shape":"panel",
"surface":{...}}` or `{"command":"lighting","cell":"0,0","lighting":{...}}`;
null clears. Reads use `sub:"read"` and return retained results in the batch
report. A draw operation may include `surface` for a single canonical primitive.
The same existing server validates CLI, batch, build and browser requests.

Validation rejects unknown fields and unsafe work before surface allocations:
4,194,304 pixels per surface, 64 total attached lamps, 65,536 grid characters,
and 64 million aggregate raster/normal/lighting/palette work pixels. Animated
composition and replay also enforce their enclosing budgets. Excess requests
fail explicitly. Larger work requires a deliberate source/layout change.
