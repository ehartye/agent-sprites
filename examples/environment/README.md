# Editable terrain and pressure habitats

An `environment` build source expands into ordinary named shapes. Every shape can
be moved or recolored after loading the generated project; rebuild the recipe to
return to its deterministic source. No external raster artwork is required.

```json
{
  "version": 1,
  "output": "./terrain-output",
  "environment": {
    "name": "farm-terrain",
    "kind": "terrain",
    "seed": 7,
    "materials": ["moss", "regolith", "basalt", "packed-earth", "alloy", "cork"],
    "variants": 4
  }
}
```

`kind` is `terrain`, `terrain-transition`, `habitat`, or `furniture`. `seed` defaults to 7 and must be a
safe integer. Terrain defaults to all six materials and four variants; a subset
can request 1–4 variants. Unknown fields are rejected. `materials` applies only
to `terrain`; `variants` also applies to `terrain-transition`, with any positive
safe count whose sheet arithmetic remains exactly representable (default four).
Available memory and renderer limits bound actual builds. Palette, proportions, and named material parts share a
warm cream, teal, bronze and cork construction style with 40×56 characters.

Terrain cells are 32×32, with aliases such as `moss_0` and `packed-earth_3`.
Opposite edge pixels match, including across variants of the same material.
Natural surfaces use sparse low contrast clusters, while alloy and cork retain
their panel or board seams. Mix variants across a map to break up repetitions.

The habitat contains four aligned 320×256 layers: `habitat_floor`, `habitat_back`,
`habitat_front`, and `habitat_roof`. Use the same top-left map origin for each.
Render floor, back wall, occupants/props, then front wall. Show the opaque roof
for the exterior and hide it when the player enters. The 48px doorway remains
open in both modes. `environment-report.json` supplies the footprint, interior,
door rectangle, and wall collision rectangles in cell coordinates.

Furniture uses 64×64 cells: `bed`, `kitchen`, `workbench`, `planter`, `stool`, and
`locker`. Each report frame includes its collision rectangle and ground anchor
`{ "x": 32, "y": 62 }`. The two final rows are transparent. Use the ground anchor
for world placement and depth sorting; use the reported foot rectangle for
collision, so the tops of taller props can overlap the player naturally.

## Organic path transitions

Use `environment: {name: "paths", kind: "terrain-transition", seed: 7, variants: 4}`
to export 188 full 32×32 tiles: packed earth on moss, with rounded inner/outer
corners, irregular shoulders and restrained clusters. These are ordinary named
editable row shapes; the game selects tiles and does not draw the art itself.
Existing `terrain` recipes retain their exact behavior.

Aliases are `path_<mask>_<variant>`. Eight neighbors use clockwise bits starting
north: N=1, NE=2, E=4, SE=8, S=16, SW=32, W=64, NW=128. Clear each diagonal bit
unless both adjacent cardinal bits are present. The resulting 47 valid masks
include isolated tiles, caps, straight edges, convex corners, concave corners,
and filled centers. `environment-report.json` records every mask/variant alias
and the bit convention. Draw a tile only for occupied path cells. Place the
atlas over moss terrain; empty edge pixels contain the matching moss base.

Different variants and compatible neighborhoods share identical boundary
pixels. All 1,024 neighborhoods of two horizontally or vertically adjacent path
cells are covered by seam tests, including all sixteen variant pairings.
Corner shoulders occupy several pixels; avoid clipping these cells back to a
rectangle, which would erase the authored transition. Use staggered map cells
to interrupt long straight runs as well as varying the tile artwork.

Place trees using their complete visible cell or opaque bounds, not just trunk
coordinates. Reserve that envelope against building roofs, walls, door
approaches, and paths, then depth-sort by the trunk's ground anchor.
