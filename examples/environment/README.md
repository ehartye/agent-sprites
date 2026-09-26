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

`kind` is `terrain`, `habitat`, or `furniture`. `seed` defaults to 7 and must be a
safe integer. Terrain defaults to all six materials and four variants; a subset
can request 1–4 variants. Unknown fields are rejected. `materials` and `variants`
apply only to terrain. Palette, proportions, and named material parts share a
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
