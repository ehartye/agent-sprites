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

Check the sources without building: `agent-sprites build sprite-project.json --check` parses every `.pxl` file,
prints each row of the wrong width (file, line, tile, expected and actual) and each unknown palette character, writes
no output and exits 1 on any problem, so it runs fast in CI. `agent-sprites build-set projects.json --check` does the
same for tileset projects and reports `source-invalid` reasons with file and line.

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
- `@shade <prefix> n=N w=N [e=N] [s=N] [color=#hex]` expands to the nine edge-occlusion tiles `<prefix>_<mask>` for ground
  beside something tall. Light is top left, so a caster to the north (mask bit N=1) paints `n` rows along the top, one to
  the west (W=64) paints `w` columns down the left, one to the east (E=4) a thin `e`-column contact line, and a caster
  at the north-west only (NW=128) a chamfered corner block. Masks: 1 4 5 64 65 68 69 128 132 (a diagonal is dropped
  when N or W is set). `s=N` adds the south contact line: ground directly north of a wall gets `N` rows along its
  bottom edge (S=16) so the wall base reads seated rather than floating, plus corner blocks for a wall at the
  south-west (SW=32, `w` wide) and, with `e`, the south-east (SE=8, `e` wide); a diagonal is dropped when either
  adjacent side is set. The set grows to 25 masks (33 with `e`) and `tileset-report.json` lists them under
  `autotiles.<prefix>.masks`; without `s=` it stays the nine masks. Use one set per height class (a low fence, a wall, a roof) and pick by neighbour.
- `@crop <name> from=<import>:<frame> [src=X,Y] [size=WxH] [x= y=] [outline|outline=#hex] [template] [unknown=error|drop|keep] [trim=#hex,...]`
  copies a region of a frame from ANOTHER built set, so an item icon is always the very art it shows (a wall icon cropped
  from the wall tile). Declare the other set in the config: `"imports": {"objects": "../../public/assets/objects/objects.atlas.json"}`
  (an Aseprite atlas beside its sheet; build-set must list that set first). The cropped pixels are matched back to your
  palette by colour (the later palette line wins when two share a fill), so `outline` and `@recolor` behave exactly as on a
  hand-drawn tile. `src` is the region's top left inside the source frame and `size` its extent (default: the rest of the
  frame); `x`/`y` place it in this cell (default: the same position). A colour that is not in the palette is an error
  (`unknown=error`), becomes transparent (`drop`, the source tile's own outline colours) or is kept as is (`keep`).
  `trim=#12201f,#26262a` removes pixels of those colours that touch transparency, which strips a tile's own silhouette
  outline before the icon gets its own. The imported atlas and sheet are build inputs, so rebuilding the source set makes
  this one stale.
- `@pips <prefix> count=N pip=WxH [gap=N] [x= y=] lit=<char|#hex> empty=<char|#hex> [outline|outline=#hex]` makes
  `<prefix>_0` .. `<prefix>_N`: a row of N pips with 0 to N lit from the left (a trough reserve, a battery, a stamina
  bar drawn over a prop). The row is centred unless `x=` places it; `lit=`/`empty=` are palette characters or hex, and
  `outline` fills the gaps between pips so the row reads as a dark strip. Use one directive per bar (`meter_trough_water`
  at `y=1`, `meter_trough_feed` at `y=4`).
- `@cracks <prefix> stages=N [seed=N] dark=<char|#hex> light=<char|#hex>` makes the transparent damage overlays
  `<prefix>_1` .. `<prefix>_N` for a siege or wear state. Each stage keeps the last stage's cracks and grows or adds
  more, so a wall visibly gets worse; a crack is a dark pixel with a light pixel at its lower right so it reads on any
  tile. Deterministic for a `seed`, hard alpha; draw the stage over the tile.
- `@autotile <kind> <material> as <prefix> [role=#hex ...] [face=N] [leaf=material] [ragged=N seed=N offset=X,Y]` expands to a full set.
  `ragged=N` (wall and roof, 1 to 4) crumbles the silhouette: up to N px are carved from the open north, east and west
  edges along a smooth, deterministic profile (`seed=` 0 to 255 picks it), hard alpha, with the new boundary outlined.
  The profile depends only on the position along the edge, so a run of tiles crumbles continuously across seams, and
  the base (south edge) stays flush so a ruin still stands on the ground and takes an `@shade ... s=` contact line.
  Joined sides are never carved. `offset=X,Y` (wall, floor and roof, 0 to 15 each) starts the material's pattern at
  another origin, so a ruined twin or a second variant does not repeat the intact wall's brick courses. Author the
  variants as separate sets (`wall_brick`, `ruin_brick` ragged=3 seed=2 offset=8,4, `ruin_brick_b` seed=5 offset=3,12) and
  choose per placed tile; the report lists the options under `autotiles.<prefix>.options`.

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
| `gate` | `<prefix>`, `<prefix>_open` | a fence-line gate in the material's fence style: a post each side and a leaf between them; open, the leaf stands edge-on against the west post |

Materials: `scrap wood brick concrete glass planks slab tile scrap-plate thatch sheet roof-tile`, and a second family in
the Fallow Valley building-tier ramps: `adobe` (mud brick) `rammed` (rammed earth) `timber` (vertical planks) `shingle`
`cinder` (16x8 blocks with rust rebar flecks) `flags` (flagstones) `plate` (riveted plate) `tread` (diamond tread plate)
`lapped` (lapped sheet roof) `ceramic` (seamless glaze) `panel` (tall panels with an accent light) `glasshouse`
(long panes with glints). Fence presets set a drawing as well as colours: `wattle` (woven stakes) `paling` (pickets)
`lowblock` (a low masonry course) `mesh` (wire between rails) `slimrail` (thin bright rails); the default `scrap`,
`wood` and friends keep the post-and-rails fence. Door leaves can use any preset's colours (`leaf=`); `leaf-adobe`
`leaf-timber` `leaf-masonry` `leaf-steel` `leaf-alloy` are colour-only presets made for it. Override any of
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

A very large tileset (a few thousand cells) no longer fails the build on the contact sheet size limit: the sheet switches to
compact cards that keep only the cell index (`contactSheet.compact` in the report), and past about 20,000 cells it shows the
first cells that fit and adds a `contact-sheet-truncated` warning. Every frame is still verified.

Always look at the result: open the contact sheet at 4x, then compose a small map from the sheet (walls around floor,
a fence run, crops beside props) and check that runs join and silhouettes read.

## Previewing composed maps

`agent-sprites tileset-preview <layout.json> --out <directory> [--scale N] [--night] [--json]` composes built frames into
contact sheets with the same neighbour-mask rules a game uses, so you can see a roofed room, a fence run or an icon board
without writing a compositor. It needs no server, reads the built atlases (and sheets), and writes one PNG per sheet at a
whole-number nearest-neighbour scale (`--scale`, default the layout's, else 4). See `preview-layout.json` in this folder.

```json
{ "version": 1, "atlases": { "tiles": "dist/tiles.atlas.json" }, "cell": 16, "background": "#c9a869", "scale": 4,
  "sheets": { "room": { "size": [9, 7], "layers": [
    { "at": [0, 0], "rows": ["#######", "#.....#", "###D###"],
      "glyphs": { "#": { "autotile": "wall_brick", "joins": "#D" }, "D": { "frame": "door_wood" } } },
    { "at": [8, 0], "frame": "campfire_0" } ] } } }
```

- `atlases` maps a name to a built Aseprite atlas (paths relative to the layout; the first is the default). A sheet has a
  `size` in cells, an optional `background` and `tint`, and `layers` stamped in order. Opaque pixels replace what is
  below (hard alpha); a sheet is opaque.
- A layer is one `frame` at `at: [x, y]` (cells), or text `rows` with a `glyphs` table: `.` and space are empty,
  `{ "frame": name }` stamps a frame, `{ "autotile": prefix }` stamps `<prefix>_<mask>` from the glyph's neighbours in the
  same layer. `mode` is `blob` (default: eight neighbours, a diagonal counts only when both adjacent sides do, the 47-mask
  convention) or `fence` (N=1 E=4 S=16 W=64). `joins` lists the glyphs that count as neighbours (default: itself), so
  walls can join a door. `atlas` on a layer or glyph picks another atlas (an icon board from the items set).
- `optional: true` turns a missing frame into a `missing-frame` warning instead of an error.
- `each: [{...}, ...]` on a sheet (put `${key}` in the sheet name) or a layer repeats it per item, replacing `${key}` in
  every string; a lone `"${x}"` becomes a number. `--night` (or `tint: "night"` or `{ "mul": [r, g, b], "add": [r, g, b] }`)
  applies the dusk multiply of the game's night pass before scaling.

## Validation

Every `.pxl` row must be exactly the cell (or `w=`) width and every tile or animation frame exactly the cell
(or `rows=`) height. A wrong width, too few rows, or an extra row fails the build with `file:line`, the tile or
animation name, and expected versus actual counts. To check the names a game asks for, list them in the build
config's `expectedFrames` (and animation names in `expectedTags`); the build fails with `missing-frame` for
each absent name. Frame names include animation frames, such as `campfire_0`.
