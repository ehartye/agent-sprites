# Pure bitmap text and pixel geometry

The exported `ui-runtime.mjs` contains pure font normalization, line-width,
wrapping, measurement, placement and nine-slice helpers. They require no image, Canvas, browser globals
or native display objects. The existing Canvas `createBitmapFont` uses the same
calculations and retains its `{width, height, lines}` results and scale-2 defaults.

```js
import {normalizeBitmapFont, bitmapLineWidth, wrapBitmapText, measureBitmapText}
  from './ui-runtime.mjs';

const font = normalizeBitmapFont({report, atlas}); // raw UI report + atlas
// Or: normalizeBitmapFont({phaser});              // ui-phaser.json font
const width = bitmapLineWidth(font, 'A label');
const wrapped = wrapBitmapText(font, 'Long copy', 120);
const measured = measureBitmapText(font, 'Long copy', {maxWidth: 120});
```

Normalize once per loaded font. The returned data is copied and deeply frozen:
`lineHeight`, `baseline`, `cell`, `fallback`, `toneNames`, and `glyphs`. Each glyph
has `advance`, reported source-cell `inkBounds: {known, rect}`, and per-tone
`frames` with atlas `source` rectangles and independent trim `offset` values.
All declared tones are retained. A missing legacy cell/baseline is `null`; missing
ink metadata is `{known: false, rect: null}`. A known blank glyph has `known: true`
and a null rectangle. Texture dimensions do not establish ink or source-cell size.
Changing original metadata does not change the normalized copy; recreate it when
loading a changed font. Normalization consumes metadata, not image pixels.
The Canvas font also snapshots metadata for drawing and missing-glyph checks;
its image remains caller-owned.

Pure helpers default to scale 1. `bitmapLineWidth` accepts `{scale, trailingAdvance}`.
Wrapping and measurement accept `{scale, policy}`; measurement additionally accepts
`maxWidth`. Scale must be a positive integer. Width may be nonnegative or `Infinity`;
an overwide single glyph stays overwide. Canvas retains its positive-integer width
guard. Omitted `maxWidth` measures hard lines without collapsing spaces.

| Policy field | Default | Allowed values |
| --- | --- | --- |
| `newline` | `normalize` | `normalize` (CR/CRLF to LF), `lf-only` |
| `tab` | `four-spaces` | `four-spaces`, `literal` |
| `nullish` | `stringify` | `stringify`, `empty` |
| `empty` | `line` | `line`, `none` (no lines for empty input) |
| `trailingAdvance` | `0` | `0`, `1` source pixel; clamp width to zero before scaling |
| `lastLine` | `line` | `line`, `cell` (rejects unknown cell metadata) |
| `lineSpacing` | `0` | Nonnegative integer source pixels between lines |
| `spaces` | `trim` | `trim`, `terminal` (retain one terminal separator when wrapping) |

Unknown fields or values reject. Wrapped words collapse runs of spaces and split
overlong words by Unicode code point; explicit blank lines remain. These policies
describe calculations, not game names or themes.

`wrapBitmapText` returns `{sourceLines, resolvedLines}`. Both are newly allocated;
source lines retain unsupported characters while resolved lines use the exported
fallback. Normalized control characters follow the selected policy. Source input
is not mutated. `measureBitmapText` adds `width`, `height`, `advanceWidth` and
`paintedBounds: {known, rect}`. `width` follows the trailing policy; `advanceWidth`
retains full advances. Painted bounds use source-cell ink positions once, without
adding trim offsets again or inferring ink from a trailing-advance subtraction.
Any glyph with unknown ink makes the aggregate painted bounds unknown.

The existing minimal-repertoire `resolveFontText` contract is unchanged.

## Caller-owned text metrics

For a headless face or a renderer with its own font resources, pass only
`{lineHeight, advanceOf}` to `textMetricsLineWidth`, `wrapTextMetrics` and
`measureTextMetrics`. Line height must be positive and finite. `advanceOf` receives
one Unicode code point as a string and returns a finite, nonnegative advance.
The metrics and callback must remain stable and pure during each call; repeated
code points may reuse a validated advance. No font tones or atlas frames are needed.

```js
import {textMetricsLineWidth, wrapTextMetrics, measureTextMetrics}
  from './ui-runtime.mjs';

// Space2grow's Face seam also works with its headless fixtures.
const metrics = {lineHeight: face.line, advanceOf: codePoint => face.advanceOf(codePoint)};
const width = textMetricsLineWidth(metrics, 'A label');
const {sourceLines} = wrapTextMetrics(metrics, 'Long copy', 120);
const measured = measureTextMetrics(metrics, 'Long copy', {maxWidth: 120, leading: 0.5});
```

All values use the caller's declared units, including fractional metrics and
leading. These APIs accept no scale or resolution and never round. Width consumes
raw `String(line)` without text normalization or trailing subtraction. Wrapping
and measurement use the policy table above, with `trailingAdvance: 1` subtracting
one caller unit and `lineSpacing` counting integer caller units. `lastLine: 'cell'`
rejects because abstract metrics have no cell metadata. Unknown options reject.
`leading` is finite and nonnegative and adds to `lineSpacing` between lines.

Wrapping defaults to `Infinity`. Measurement with omitted `maxWidth` retains hard
lines and their spaces; an explicit `Infinity` still invokes wrapping and its
space policy. Empty and nullish inputs follow the same explicit policies as bitmap
text. Wrapping returns only `{sourceLines}`; measurement returns
`{sourceLines, width, height, advanceWidth}`. Width follows the trailing policy;
advance width retains full advances. Source characters remain intact apart from
the selected normalization and wrapping policy. These results make no fallback,
ink, frame or drawing claims. Production adapters keep their real font resources
for drawing; a metrics-only face is not a normalized drawable bitmap font.

## Placement and nine-slice plans

```js
import {placeBitmapText, planNineSlice, iterateNineSliceTiles} from './ui-runtime.mjs';
const text = placeBitmapText(font, 'A label', 10, 20,
  {scale: 2, tone: 'cream', maxWidth: 120, maxHeight: 40, align: 'center'});
const skin = planNineSlice({frame, insets}, {x: 10, y: 20, width: 120, height: 40},
  {scale: 2});
for (const {source, destination} of iterateNineSliceTiles(skin)) {
  // Bind to the consumer's renderer; source uses atlas pixels.
}
```

Without a resolution descriptor, destination coordinates are integer pixels and
scale is a positive integer. Placement bounds are finite nonnegative integers;
omitted bounds use natural dimensions. Align is `left`, `center` or `right`;
center rounds down in destination pixels. The text plan retains measurement fields,
adds positioned `lines` and `draws`, and returns absolute `paintedBounds` plus
metric and known/unknown painted `overflow`. Each draw has its original character,
resolved character, row, tone, frame name, atlas `source` rectangle and `destination`.
Glyph trim offsets affect drawing once; reported source-cell ink defines paint
evidence independently. Unknown legacy ink stays unknown. Overflow never clips,
shrinks or ellipsizes text.

Nine-slice takes an atlas frame `{x, y, w, h}` and nonnegative integer insets
`{left, right, top, bottom}`. Insets refer to the cropped frame; a separate atlas
trim offset is not added again. The default destination has positive integer
extents, each a multiple of scale. A frozen plan has at most nine drawable regions;
the iterator lazily emits row/column/tile-Y/tile-X quads and crops partial source
tiles exactly instead of stretching them. Zero source regions are omitted.
No authored minimum is inferred: narrow destinations retain the legacy corner
arithmetic, including overlap or escape. The existing Canvas wrapper still enforces
its authored minimum, scale-2 default and positive-integer destination guards.
Canvas text drawing and nine-slice drawing consume these exact plans, preserving
their draw order, smoothing setting and text return shape.

## Explicit mixed-resolution projection

```js
import {pixelResolution, projectPixelPoint, projectPixelRect,
  quantizePhysicalPoint, quantizePhysicalRect} from './ui-runtime.mjs';
const resolution = pixelResolution({
  id: 'app:menu/card', revision: 7,
  localToPhysical: {scale: 3, origin: {x: -0.25, y: 0.5}},
  physicalPixelsPerSourcePixel: 2,
});
const text = placeBitmapText(font, 'A label', 0.25, 1.5, {resolution});
const pointerLocal = projectPixelPoint(resolution, pointerPhysical, 'to-local');
```

The descriptor is copied and deeply frozen. Its namespaced `id` and nonnegative
integer `revision` identify a caller-owned context. Only a uniform positive finite
axis-aligned scale and finite translation are supported; rotation, shear,
nonuniform transforms and unknown options reject. Physical pixels per authored
source pixel (`P`) is a positive integer. The example has local-to-physical scale
`S = 3`, `P = 2`, and derived source-to-local scale `P / S = 2/3`: logical glyphs
can be fractional while their physical source pixels remain whole.

`projectPixelPoint(resolution, {x, y}, direction)` and
`projectPixelRect(resolution, {x, y, width, height}, direction)` default to
`to-physical`; `to-local` is the continuous inverse. Origins may be negative or
fractional; rectangle extents are finite and nonnegative. Neither direction
quantizes pointer, hit, focus or clip geometry.

Quantization is a separate physical-space operation. `quantizePhysicalPoint`
accepts `{grid: 1}` and snaps nearest, with ties toward positive infinity.
`quantizePhysicalRect` accepts `{grid: 1, mode: 'inside'}`; modes are `inside`
(ceil leading/floor trailing), `cover` (floor leading/ceil trailing), and `nearest`
(nearest edges, same tie rule). Inward collapse yields zero extents; originally
empty extents remain zero in every mode. Unknown options or modes reject.

Both planners accept `{resolution}` instead of `{scale}`; supplying both rejects.
Contextual requested origins and extents may be fractional. Calculations run in
physical pixels at `P`, then returned destinations project continuously back to
local space. Plans carry `resolution`, `context: {id, revision}`,
`requestedLayoutBounds`, snapped local `bounds`, `physicalBounds`, and the explicit
`quantization` policy. Draws/regions/iterator quads add `physicalDestination`;
atlas source rectangles retain their original source-pixel units. Contextual
text dimensions and line widths use local units. Its optional absent requested
extents are represented by `null`.

Text keeps `physicalAnchor` nearest on grid 1 independently of its inward fit
rectangle. Providing bounds does not move that anchor. Wrapping/alignment use the
fit rectangle's available extent; metric and painted overflow compare actual
placed geometry against that rectangle. The policy records nearest origin,
positive tie direction and inward bounds. An overwide glyph is still emitted.

Nine-slice origins use inside/ceil on physical grid 1. Available extents first fit
inward on grid 1, then floor to multiples of `P` **relative to that snapped origin**;
the origin is not snapped to an absolute grid `P`. The plan records `originMode`,
`originGrid`, `extentMode`, `extentGrid` and `extentOrigin`. Zero or inward-collapsed
contextual paint extents emit no regions. For nonempty narrow boxes, legacy corner
arithmetic can escape the allocation: `physicalPaintedBounds` and local
`paintedBounds` record the actual emitted union, while `overflow` records escape.
Text retains the same known/unknown ink evidence in both spaces. The tile iterator
works on the physical plan, retaining exact source-pixel crops even with fractional
context origins, and projects each emitted quad lazily.

Requested layout allocations and painted boxes do not define interaction regions.
Consumers own independent hit/focus/clip bounds, full targets, continuous input
mapping, stale-context rejection and native resources. Plans carry revisions;
they do not enforce a host's current revision. CSS sizing, DPR, camera rounding,
compositors and density selection remain distinct consumer concerns. Adapters must
feed the planned physical-grid geometry without assuming camera rounding corrects
it. Themes do not choose actions, focus or density. No shared widget runtime,
native rendering adoption, fitting or ellipsis policy is provided here.
