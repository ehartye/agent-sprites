# Tileset recipe

Build a regular grid of equal cells from plain-text `.pxl` sources: hand-drawn tiles, recoloured variants,
animations and procedural auto-tile sets. The sheet is gapless and row-major, so **frame index equals cell index**,
which is what a game engine's tileset import expects. `tileset-report.json` carries the name-to-index table.

```json
{
  "version": 1,
  "output": "dist",
  "omit": ["project", "operations", "preview"],
  "tileset": { "name": "tiles", "cell": 16, "columns": 16, "sources": ["palette.pxl", "tiles.pxl"] }
}
```

`tileset` fields: `name`, `cell` (a size or `[width, height]`, default 16), `columns` (default `min(16, count)`),
`sources` (the `.pxl` files, in order, relative to the config) and an optional inline `palette`
(`{"g": "#6b7d3a"}` or `{"g": {"color": "#6b7d3a", "outline": "#2f3d22"}}`). Sources are tracked as build inputs
automatically. The last grid row may be padded with empty cells; the report lists `paddingCells` and the build does
not warn about them.

## The `.pxl` format

Blank lines and lines starting with `%` are ignored. Directives start with `@`. Art rows use one character per
pixel; `.` is transparent. `@` and `%` cannot be palette characters.

```
@palette
g #6b7d3a #2f3d22          % <char> <fill> [<outline>]

@tile sprout outline x=5 y=5 w=6 rows=7     % a 6x7 block placed at (5,5) in the cell
..l...
...

@tile tpl_seed template x=5 y=5 w=6 rows=6   % templates are only for @recolor; they never reach the sheet
@recolor seed_gold tpl_seed a=y             % same art, palette character a replaced by y
@copy wall_scrap wall_scrap_0               % a second name (its own cell) for an existing tile
@anim campfire fps=6 outline x=4 y=4 w=8 rows=6   % frames of 6 rows, separated by ---
@autotile wall brick as wall_brick          % 47 connection masks
```

- `@tile <name> [outline|outline=#hex] [template] [x= y= w= rows=]`. Without `x y w rows` the block is the whole
  cell. `outline` adds a 1px selective outline on transparent pixels that touch an opaque one (4-neighbour). The
  colour is the neighbouring palette entry's outline column, or a darkened fill; `outline=#hex` forces one colour.
  Art that reaches the cell edge gets no outline there, so tiles still seam.
- `@recolor <new> <source> A=B ...` swaps palette characters in a hand-drawn tile and redraws its outline.
- `@copy <new> <source>` duplicates a tile (used for legacy names).
- `@anim <name> [fps=N] [outline] ...` makes cells `<name>_0`, `<name>_1`, ... and a cell group, so the Aseprite atlas
  carries a frame tag `<name>` with its durations.
- `@shadow <name> w=N h=N [x= y=] [color=#hex]` draws one stepped contact-shadow silhouette (a lens that is widest in the
  middle rows), centred in the cell unless `x=`/`y=` place it. Hard alpha and one flat colour (default `#1b2040`): the
  game draws it at a single opacity (25-35%), so overlaps never double-darken and every edge stays on the pixel grid.
  Author one per size class (creatures, props); anything larger can nine-slice a small plate frame.
- `@shade <prefix> n=N w=N [e=N] [color=#hex]` expands to the nine edge-occlusion tiles `<prefix>_<mask>` for ground
  beside something tall. Light is top left, so a caster to the north (mask bit N=1) paints `n` rows along the top, one to
  the west (W=64) paints `w` columns down the left, one to the east (E=4) a thin `e`-column contact line, and a caster
  at the north-west only (NW=128) a chamfered corner block. Masks: 1 4 5 64 65 68 69 128 132 (a diagonal is dropped
  when N or W is set). Use one set per height class (a low fence, a wall, a roof) and pick by neighbour.
- `@autotile <kind> <material> as <prefix> [role=#hex ...] [face=N] [leaf=material]` expands to a full set.

Atlas note: the Aseprite atlas lists the grid frames first (numeric filenames equal to cell indices), then one run of
frames per animation tag, then the named aliases. Animation tag ranges therefore index atlas frames, not cells; the
report's `animations[name].frames` gives the cell indices if you want to drive a tilemap animation yourself. Trailing
` % comment` text is allowed after any directive or palette line. Sources may sit outside the config directory (a palette shared by several sets) and are tracked as inputs either way.

## Auto-tile sets

| kind | tiles | notes |
| --- | --- | --- |
| `wall` | 47 `<prefix>_<mask>` | outlined block with a lit top-left edge and a darker south face where the wall ends |
| `floor` | 47 | no outline, a soft dark edge on open sides |
| `roof` | 47 | like a wall with a shallow eave |
| `fence` | 16 `<prefix>_<mask>` | post plus rails toward the four edge neighbours |
| `door` | `<prefix>`, `<prefix>_open` | a wall segment with a door leaf (`leaf=wood` picks the leaf material) |

Materials: `scrap wood brick concrete glass planks slab tile scrap-plate thatch sheet roof-tile`. Override any of
the roles `a` (base) `b` (light) `c` (dark) `d` (accent) `s` (seam) `o` (outline) with `role=#rrggbb`.

Masks are clockwise from north: `N=1 NE=2 E=4 SE=8 S=16 SW=32 W=64 NW=128`. This is the **connection** convention: a
diagonal bit is kept only when both adjacent edge bits are set (the same rule as `terrain-transition`), giving 47
masks. The report lists each set's masks and frame indices under `autotiles`. The nearest-neighbour join is exact: a
tile's joined side has no edge, and every pattern repeats every 16 pixels.

```js
// mask for a wall at (x, y): which of the 8 neighbours are walls of the same set
const bits = [[0,-1,1],[1,-1,2],[1,0,4],[1,1,8],[0,1,16],[-1,1,32],[-1,0,64],[-1,-1,128]];
let m = 0; for (const [dx, dy, b] of bits) if (isWall(x + dx, y + dy)) m |= b;
for (const [corner, a, b] of [[2,1,4],[8,4,16],[32,16,64],[128,64,1]]) if (!(m & a) || !(m & b)) m &= ~corner;
const frame = `wall_brick_${m}`;
```

## Publishing

`omit` may list `project`, `operations`, `preview` and `contactSheet` to publish only the sheet, atlas, report,
manifest and verification (the editable project of a large tileset is megabytes). The ownership marker is still
written, and `build-set --check` treats omitted artifacts as intentionally absent.

Always look at the result: open the contact sheet at 4x, then compose a small map from the sheet (walls around floor,
a fence run, crops beside props) and check that runs join and silhouettes read.
