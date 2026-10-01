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
safe integer. `pixelScale` is 1 (default) or 2; see [Pixel scale](#pixel-scale). Terrain defaults to all six materials and four variants; a subset
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
Indoors render floor, back wall, occupants/props, then front wall. Outdoors render
floor clipped to the reported door rectangle, front wall, then roof. Omit the
cutaway back wall and full interior floor, which can extend past the varied roof
silhouettes. The 48px doorway remains
open in both modes. `environment-report.json` supplies the footprint, interior,
door rectangle, and wall collision rectangles in cell coordinates.

Add `style: "cottage"`, `"workshop"`, `"kitchen"`, or `"barn"` to a habitat
environment for four distinct authored buildings. The cottage combines an
asymmetric pitched roof with a greenhouse; the workshop uses a low service roof,
extractor and solar equipment; the kitchen has a glazed barrel roof and awning;
the barn has a tall gambrel roof, timber braces and restrained portal equipment.
Each style includes coordinated interior flooring and wall details. All share
the reported 320×256 cell and navigation geometry, with a 48px ground doorway
and an open recess sized for the native adult cast. The report records `style`.
Omitting `style` preserves the original pressure-vessel recipe and report.
Style is supported only for `kind: "habitat"`; other values are rejected.

### Habitat modules

Four further styles draw the same rooms as the buildings above with space-habitat exteriors:

| Style | Rooms of | Silhouette |
|---|---|---|
| `capsule` | `cottage` | Low barrel hull with a glass crop tower on one shoulder |
| `vault` | `barn` | Vaulted hangar between two banded seed silos |
| `gantry` | `workshop` | Flat service hall with a pressure tank and a lattice crane |
| `dome` | `kitchen` | Half-round glass dome on a docking ring |

Only the `habitat_roof` layer is a new exterior: the floor is byte-identical to the base style. The back wall and front wall are the
base style's plus a little module trim in the same shared kit (a riveted seam along the foot of the back wall, hazard chevrons on
the south wall's door jambs), all of it named with the module prefix, and the report's
layout (footprint, interior, door, walls) is unchanged, so navigation, collision and interiors are unaffected. The roof layer can
rise above the reported footprint (the crane, tower and silos do), so check draw order and clearance against the cell's reported
`bounds`, not the footprint. All four share one hull trim: a riveted pressure seam at the eaves (the dome's docking ring
is its seam), hazard chevrons on both door jambs, a roof vent or port, and the kit palette and ink outline of the base styles.
The capsule, vault and gantry read in grayscale as a dark roof over a light wall with mid-value structure between. The capsule and vault
roofs use one shared kit roof ramp, a dark clay (`roofLit #9a6a50`, `roofBase #7a4c3c`, `roofShade #573738`: the lit edge is warmer, the shade
cooler and redder), so their roof to wall contrast is at least 2.0:1 by WCAG luminance and the roof's mean luminance stays under 0.10
(measured: capsule about 3.0:1, vault about 2.9:1). The gantry keeps its slate hall (at least 1.6:1, cool against the warm capsule and vault); the dome stays a light glass shell. Light comes from the top left, curved forms use flat planes with hard
edges, and nothing is dithered.

Furniture uses 64×64 cells: `bed`, `kitchen`, `workbench`, `planter`, `stool`, and
`locker`. Each report frame includes its collision rectangle and ground anchor
`{ "x": 32, "y": 62 }`. The two final rows are transparent. Use the ground anchor
for world placement and depth sorting; use the reported foot rectangle for
collision, so the tops of taller props can overlap the player naturally.

### Pixel scale

`pixelScale: 1 | 2` (default 1) lets a game draw terrain, habitats and furniture at the same 2x as its characters
without changing any layout number. With `pixelScale: 2` the recipe is redrawn on a grid of half the size and the atlas is
emitted at that source size; the game draws it at scale 2.

| Kind | Source cell (atlas) | Screen cell (drawn at 2x) |
|---|---|---|
| `habitat` | 160×128 | 320×256 |
| `furniture` | 32×32 | 64×64 |
| `terrain` | 16×16 | 32×32 |

Everything the game consumes is still reported in screen units: the habitat `layout` (footprint, interior, door, walls),
furniture `collision` and `ground`, and every frame's `bounds`. So collision, navigation and saves read identical numbers at
either scale. The report adds `pixelScale`, `screenCellSize`, and per frame `sourceBounds` (and `sourceGround` for furniture,
the pivot in source pixels). The atlas JSON records `meta.pixelScale` (and the build manifest `pixelScale`) so a game can assert
the scale it draws at; a recipe that omits `pixelScale` writes none of these and is byte-identical to before.
Terrain transitions do not support it yet and reject the option.

This is a redraw, not a resample. Shapes are filled on the half grid by pixel cover (a screen pixel belongs to the source
pixel that contains it), so rectangles that tile still tile, and hand-set trim is authored in source pixels: line weight is one
source pixel (two screen pixels). Details finer than a source pixel are simplified by the world rules instead of shrunk: the
seam band is a lit row, a base row and a dark row with two-pixel rivets; hazard chevrons are four-pixel bars two rows tall; ports
are round discs one pixel thick per ring; window frames and outlines are one pixel; furniture stitching, utensils, spanners
and graph traces are reduced to what fits; terrain flecks are at least two source pixels and stay off the border. At
`pixelScale: 2` every habitat style and layer, every furniture piece and every terrain tile has hard alpha, no isolated
single pixels (8-connected, tiles measured as repeating), no dither and only the colors of the full-size art. The legacy
pressure-vessel habitat (no `style`) is drawn at half size by the same fill rule but has not been hand-tuned.

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
