# Bitmap UI recipes

For renderer-independent normalization, wrapping and measurement, see the
[pure bitmap text metrics API](text-metrics.md).

Build `font.json` and `skin.json` through the checked managed CLI. Each selects the
`ui` inline source, exclusively of `ops`, `generator`, `character`, and `environment`.
Themes are `moss-brass` (default) and `wasteland`. `name`, `kind`, `theme`, an optional
[`colors` override](#colour-roles-colors), and optional font-only `characters` and `face`
(`regular`, `compact`, `display`) are the complete recipe fields; unknown fields fail.
`proof.surfaces` is not a recipe field: it belongs at the top level of the build config
(see [font proof surfaces](#font-proof-surfaces-proofsurfaces)).

Sheets are packed near-square (`packGrid`: the squarest sheet within 1024 px wide, then the fewest padding cells). Cells that pad
the last row are unnamed and empty; every frame name is independent of the layout, so a rebuild never renames anything. UI builds
verify the sheet shape (`atlas-shape` error above 3:1; `agent-sprites verify --max-aspect 3` checks any atlas, `maxAspect` in a
build config overrides the UI default). A 166-cell skin used to come out 48x1992 (the only even divisor was 2); it is now 312x336.

Use `face: "compact"` for secondary hints, captions and inventory descriptions.
It has authored four-column, six-row letters in 6×10 cells, baseline 7, line height
10, advance 5 and space advance 3. Punctuation/symbols retain up to five columns;
accents and descenders have reserved rows. It supports the same repertoire and
tones as the default `face: "regular"`. Build it as a separate font atlas, then
compose both faces at a physical footprint of 2 pixels per source pixel: ordinary lettering is 14 pixels high and compact
lettering 12. Do not downscale the regular font to fake smaller type. Use matching
advance/space metrics in semantic layouts. Keep important actions in the regular
face and quiet supporting text in compact; use ink on light panels, cream on dark.

Use `kind: "logo"` for a title logotype: one frame named `logo`, stacked capital lettering at 4x (`text`, default
`"PIXEL\nSTUDIO"`, letters and digits only; use `\n` to separate lines), a lit gold-to-copper gradient, brass and dark outlines, a hard
drop shadow, a striped sun behind and a horizon of wheat. Wasteland theme colours; about 167x111 for the default text. It is
one atlas frame, so draw it as one image with whole physical pixels per source pixel (`ui-phaser.json` is `{kind:'logo', frame, size, bounds}`).
The wasteland skin also has `banner_boss`, a nine-slice plate (insets 8, padding 10x8) with copper frame and gold corner studs, for boss-name and event banners.

Use `face: "display"` for logos, banners, boss names and other big type with whole physical pixels per source pixel.
It is the regular lettering redrawn at twice the size: each 5x7 mask is smoothed with the EPX (Scale2x) rule so curves and
diagonals get real pixel steps, lit like a bevel (highlight on top edges, shade on bottom edges), outlined, and given a one pixel
drop shadow. Cells are 12x24, baseline 19, line height 24, advance 12, space advance 8. It covers every glyph of the regular
face (pass `characters` to build a smaller atlas), and every tone is a ready-made ramp, never a tint: `gold` shades toward
copper, `cream` toward brass, `muted` toward the backing, and `ink` is dark with a light outline for light panels. Draw it with
`BitmapText` at the selected source-pixel footprint, without enlarging the regular face to imitate it, and only in short strings; its width is the only reason to prefer regular.

The original 5-column font provides 8×12 cells, baseline 9, line height 12, advance
6 and space advance 4. Lowercase descenders and common accents have reserved rows.
Default coverage includes printable ASCII, curly quotes, ellipsis, em dash, minus,
multiplication, direction/return arrows and the book, menu, sun, plant and star
symbols. Unsupported requested characters fail the build. Space has metrics but
no empty frame. `?` and space are always included in custom subsets. The recipe
chooses a column count dividing the glyph count so there are no empty padding
cells. Grid dimensions have no policy caps; allocation remains subject to actual
memory and renderer capabilities.

Every glyph has exported `cream`, `muted`, `gold`, and `ink` frames. The report's
`glyphs[character]` contains `advance`, pixel `bounds`, and `frames[tone]`. Use a
positive integer physical footprint `P`; 2 pixels or larger per source pixel is
recommended for screen text. An aligned whole-camera path can use integer local
scales. Native contextual UI uses local scale `P / S`, where `S` is its exact
uniform local-to-physical camera scale; `P = 2`, `S = 3` gives valid local scale
`2/3`. Declare the complete mapping, including physical origin, with
[`pixelResolution`](text-metrics.md#explicit-mixed-resolution-projection).
Quantize paint through the released placement helpers and project it back to
local units; do not round continuous pointer, semantic hit, focus or clip geometry.
No kerning or platform shaping
is applied. For native text renderers, pass display copy through `resolveFontText`
with the font report or `ui-phaser.json` font metadata; it preserves supported
characters and replaces each unsupported Unicode code point with the exported
fallback. Keep the original text for storage and game semantics. The portable
compositor already draws unsupported characters with that fallback; use
`missingGlyphs` to inspect which literal characters are unsupported.

Both builds preserve `ui-report.json`, `ui-runtime.mjs` and the independent
[`ui-action-group.mjs`](action-group.md) alongside the usual PNG,
Aseprite atlas, editable project, operations, contact sheet and verification.
Font builds also own `ui-boot.mjs`, exporting `imageDataUrl`, `atlas`, and `report`;
this embeds the verified font for loading/failure screens without a font fetch.

## Shared native components

Use the [current native component contract](native-components.md) for common dialogs,
menus, forms, lists, reading views, notices, HUDs, themes and bounded extensions.
It exports stock constructors/families, `defineTheme`, `layoutUi`,
`createUiInteraction` and `createPhaserUi` through browser-safe `ui-index.mjs`.
Games keep authored models/content, action authority, immutable assets, resolution
mappings and application-specific extension renderers. The shared owner supplies
stock layout, controller behavior, native painting and owned resource lifetimes;
extensions use the game's narrow native facade and the host's ownership scope.
The producer ships with a generic native fixture; each game accepts its own pin through its own native checks.

Current UI builds additionally publish the complete software closure, preserving
historical art/metadata aliases including `uiRuntime` and `uiActionGroup`.
Node-only `server/build/ui-software.mjs` also exports `publishUiSoftware({output})`
for publication without an art build. Pin all **16 payloads plus one manifest**:
`ui-runtime`, `ui-action-group`, `ui-theme`, `ui-components`, `ui-layout`,
`ui-interaction`, `ui-phaser-runtime` and `ui-index`, each as `.mjs` and `.d.mts`,
plus `ui-software-manifest.json`. Browsers import `ui-index.mjs`, not the publisher.
Keep the complete bundle outside `public/` for bundled imports; preserve its bytes
with path-specific Git attributes. Record the accepted producer source/commit and
version, verify the exact inventory, byte counts, SHA-256 hashes and producer
identity, and reverify delivered bytes. Manifest consistency alone cannot
authenticate origin. Default builds verify the committed pin without a producer
installation; explicit upgrades replace the complete bundle and provenance
together. Software upgrades neither regenerate art nor relabel historical receipts.

Do not keep a copied sync script for this bundle. Export and check it with the command instead:

```text
agent-sprites ui-runtime-export --out ui-software
agent-sprites ui-runtime-export --out ui-software --verify
```

`--out DIR` writes the 16 files plus `ui-software-manifest.json` with LF line endings and needs no open project. It refuses
(exit 1, naming the files) a directory that already holds any of those 17 names. `--verify` writes nothing: it rebuilds the
bundle in memory, compares the SHA-256 of every file and the manifest with the files in `DIR`, and exits 1 naming each file
that differs or is missing (exit 0 prints `UI runtime current: 17 files match the producer.`). `--json` prints the result as
JSON; unknown options are rejected. A game pins the exported bytes, then runs `--verify` against its pinned directory after a
producer update; replace the bundle deliberately by exporting into a fresh directory.

## Bundlers and public assets

Exporting a UI build into a game's `public/` directory is valid: the PNG, atlas,
reports and generated modules stay together. Treat those files as URL-served
assets. In [Vite](https://vite.dev/guide/assets#the-public-directory), public files
are copied unchanged and should not be imported as bundled source modules.
Such imports can produce notices or fail. Load public JSON through Phaser's
loader/cache (or `fetch`), and include the deployment base in asset URLs, as below.

For independent historical core helpers, commit one complete, unchanged copy of
the producer's canonical `server/build/ui-runtime.mjs` Git blob outside `public/`,
for example at `src/vendor/agent-sprites/ui-runtime.mjs`. Record producer commit,
version, source path and SHA-256 beside it. Preserve the blob bytes with a
path-specific `.gitattributes` entry such as
`src/vendor/agent-sprites/ui-runtime.mjs -text`; checkout line-ending conversion
must not change its recorded digest. Import that committed source copy normally.

The default game build verifies the committed pin and digest without requiring a
managed install or sibling producer checkout. An explicit software upgrade uses
a clean producer revision, reads that revision's Git blob as bytes, and replaces
the vendor module and provenance together. Do not automatically recopy a runtime
from historical public art after an image build: it may predate the pinned helpers.
Old font/skin exports keep their existing bytes and provenance; upgrading software
does not require rebuilding or relabeling them. Every face and skin uses the same
helper module; keep one vendor copy without hand edits or copied helper logic.
Action-group allocation uses a separate fixed module and receipt. Pin the canonical
`server/build/ui-action-group.mjs` Git blob independently; adopting it leaves the
existing core module, core receipt and historical art untouched. Its manifest key
is `uiActionGroup`; it is not imported or re-exported by `ui-runtime.mjs`.
Pure text metrics, placement, resolution projection, `resolveFontText`, `pixelFit`
and `getOpaqueBounds` need no Canvas context. Games bind compatible results to
native Phaser display objects; using these helpers does not require the portable
compositor or the shared framework. These individual helper pins do not replace
the complete shared software pin described above.

## Phaser

Every UI build also writes `ui-phaser.json`, ready for Phaser 4 without an adapter.

Font: `{version, kind:'font', face, image, atlas, lineHeight, baseline, size, spaceAdvance, fallback, symbols, glyphs, tones}`.
`glyphs` lists every supported character (no space). `tones.cream|muted|gold|ink` are each a
`Phaser.Types.GameObjects.BitmapText.BitmapFontData`, exactly the shape `ParseXMLBitmapFont` produces (`font, size, lineHeight, retroFont:false, chars[charCode]` with `u0,v0,u1,v1` texture coordinates (v flipped: `1 - y/height`; Phaser's renderer reads them from the glyph) and
`x,y,width,height` = that tone's glyph cell in the font PNG, `yOffset 0`, `xAdvance` = glyph advance). `ui-boot.mjs` also exports the same object as `phaser`, for loading/error screens with no fetch. Register one font per tone
over the already-loaded PNG. This example uses the aligned whole-camera path:

```js
import {resolveFontText} from './vendor/agent-sprites/ui-runtime.mjs'; // from src/
// preload(): public/assets/... is served at <base>/assets/...
const assets = `${import.meta.env.BASE_URL}assets/`;
this.load.image('ui-font', `${assets}ui-font/ui-font.png`);
this.load.json('ui-font-px', `${assets}ui-font/ui-phaser.json`);
// create(): read loaded metadata, rather than importing public JSON as source
const px = this.cache.json.get('ui-font-px');
for (const [tone, data] of Object.entries(px.tones)) {
  this.cache.bitmapFont.add(`ui-font-${tone}`, {data, texture: 'ui-font', frame: null});
}
this.add.bitmapText(x, y, 'ui-font-cream', resolveFontText(px, 'Hello 🦋'), px.size);
// Aligned whole-camera path: integer local scale; butterfly uses exported ?.
```

Skin: `{version, kind:'skin', image, atlas, cell, frames[alias]}`; each frame has `frame` (atlas frame name), `padding`, `minWidth`,
`minHeight`, `bounds` (painted pixel bounds, inclusive, as in the report; every report frame has an entry), optional `textTone`, `tile`, `content`, `icon`, `color`, `hollow`, and `nineSlice:{leftWidth,rightWidth,topHeight,bottomHeight}`
(absent for icons and tiled scrims) matching `this.add.nineslice(x, y, texture, frame, width, height, leftWidth, rightWidth, topHeight, bottomHeight)`.
Phaser stretches native NineSlice edges. For an aligned whole-camera path, size
panels in whole source pixels and place them at aligned integer local positions
under a whole camera zoom. For contextual tiling without stretched art, use
`planNineSlice` and `iterateNineSliceTiles` with the same explicit resolution as
text. Bind each emitted piece using its actual atlas cut dimensions and trim
metadata, rather than assuming `sourceSize` equals the cropped frame.
Create untrimmed synthetic piece frames when splitting an atlas cut.

Native TileSprite buffers must have integer authored-source dimensions:
`physicalDestination.width / P` and `physicalDestination.height / P`. Set the
object scale to `P / S`, tile scale to 1 and tile offsets to zero. Do not give
TileSprite fractional local buffer dimensions: integer Canvas buffers can truncate
them. Reuse pieces by row, column and node type, since zero regions can disappear.
The game retains minimum-size, padding and overflow policy.

For this contextual fractional-local path on Phaser 4.2.1 Canvas, set
`roundPixels = false` on the consuming UI camera. Its Canvas
[`batchSprite` path](https://github.com/phaserjs/phaser/blob/v4.2.1/src/renderer/canvas/CanvasRenderer.js#L862-L877)
otherwise rounds local origins and expands draw extents by 0.5;
[BitmapText](https://github.com/phaserjs/phaser/blob/v4.2.1/src/gameobjects/bitmaptext/static/BitmapTextCanvasRenderer.js#L161-L165)
also rounds local glyph origins. Those operations can alter already-quantized physical
paint. This is a scoped native binding setting, not a global rounding rule.
Verify the pinned renderer source and actual framebuffer pixels again on engine
upgrades; aligned whole-camera paths retain their own rounding policy.

Keep painted faces separate from full semantic action targets (at least 44 CSS
pixels on phone controls), focus and clipping. Convert CSS/DPR/camera coordinates
once and inverse-project input continuously. The game-owned binding keeps a prior
snapshot of effective mapping values: `S`, physical origin and `P`, including
viewport and pane-scroll contributions. Compare those values against the prior
snapshot; a revision counter alone cannot detect a changed mapping. On any change,
advance the context revision, invalidate plans and cancel held activation before
publishing the new mapping or footprint. Accept a plan or held activation only
when its context identity and revision match the current context. Retain the active
scroll-drag transport when canceling held activation. Native objects, input, action
families, controls and disposal stay game-owned; pure helper plans carry context
metadata but neither manage lifecycle nor enforce the binding's current values.

```js
// preload(): use the same deployment-base URL prefix as the font
this.load.atlas('ui-skin', `${assets}ui-skin/ui-skin.png`,
                          `${assets}ui-skin/ui-skin.atlas.json`);
this.load.json('ui-skin-px', `${assets}ui-skin/ui-phaser.json`);
this.load.json('ui-skin-report', `${assets}ui-skin/ui-report.json`);
// create(): aliases and layout metadata are already exported for Phaser
const skin = this.cache.json.get('ui-skin-px');
const panel = skin.frames.panel_dark;
const n = panel.nineSlice;
this.add.nineslice(x, y, 'ui-skin', panel.frame, width, height,
                  n.leftWidth, n.rightWidth, n.topHeight, n.bottomHeight);
const content = skin.frames.progress_fill.content; // local {x, y, w, h} crop rectangle
```

Use `ui-phaser.json`'s `frames[alias].content` for bar crops; use the loaded report
when other report metadata is needed. Neither requires a static JSON source import.

## Portable compositor

For a Canvas consumer, the same runtime also draws glyphs and skin parts directly:

```js
import {createBitmapFont, getFrame, drawNineSlice} from './ui-runtime.mjs';
const font = createBitmapFont({image, atlas, report});
font.measure('A little room', {scale: 2}); // {width, height, lines: string[]}
font.wrap('Long copy here', 160, {scale: 2}); // string[], splits long words
font.draw(ctx, 'A little room', 10, 20, {scale: 2, tone: 'cream', maxWidth: 160});
font.missingGlyphs('Hello 🦋'); // ['🦋']; draw uses the exported ? fallback
drawNineSlice(ctx, skin, 'button_normal', 10, 60, 160, 40, {scale: 2});
const frame = getFrame(skin.atlas, 'icon_leaf'); // {x,y,w,h} source rectangle
```

Draw origins are top-left integer pixels. Font `align` is `left`, `center`, or
`right` within `maxWidth`, or within the longest line when omitted. `measure` and
`draw` return the same metrics; `wrap` preserves explicit newlines, collapses word
spacing and splits long unbroken words. A single glyph may exceed an impossibly
narrow wrapping width. Tabs normalize to four spaces. The runtime uses only
`drawImage`, disables smoothing and rejects fractional scales/positions.

Skins include dark/light panels; normal, hover, pressed, disabled and focus
buttons; normal/selected inventory slots; tooltip, keycap, checkboxes, divider,
dithered scrim; progress track/fill; and leaf/book/bag/settings/help/arrows/close/sun/star icons.
Icons have cream aliases and `_ink` variants for light surfaces. Progress frames
publish `content: {x:0,y:11,w:24,h:2}` relative to their atlas rectangle for cropped
integer-pixel bars, without requiring consumers to infer their painted bounds.
`report.skins[alias]` supplies `insets`, `padding`, `minWidth`, `minHeight`, and
icon/tile flags. Nine-slice dimensions must be multiples of scale and at least
the reported minimum times scale. Corners are fixed and edges/centers tile in
integer source pixels; the compositor does not stretch art. Icons should use
their atlas rectangle directly, not nine-slice. Keep semantic DOM controls for
focus, keyboard, screen readers and native file selection; the game owns layout
and state, while all visible control artwork and text come from these atlases.

## Colour roles (`colors`)

A recipe may carry `colors`, a map from role name to `#rrggbb`, merged partially over the base theme (`moss-brass` or
`wasteland`). The 16 roles are `ink deep edge cream muted gold moss light shadow orbitalInk instrumentTeal wornCopper
seedGold mint paper specimenWell`. Role names, the frame set (tied to the base theme) and font geometry do not change, and
glyph frame names change only with `frameNames` (below); only colours move. Font tones, role-based skin frames and the logo follow the roles.

```json
{
  "version": 1,
  "output": "dist/font",
  "scale": 2,
  "ui": {"name": "ui-font", "kind": "font", "theme": "moss-brass", "colors": {"gold": "#f2c14e", "cream": "#f4efe1"}},
  "expectedFrames": ["glyph_0041_cream", "glyph_0067_ink", "glyph_2197_gold"]
}
```

`agent-sprites build font.json --json` publishes it. `ui-report.json` keeps `report.colors` as a flat map of all 16 resolved
roles and adds `report.colorOverrides` (here `["cream","gold"]`) only when `colors` is given; without `colors` the output is
byte-identical to before.

Validation fails the build with a message naming the role: an unknown role (`Unknown UI colour role: glod. Roles: ink, deep,
...`), a value that is not `#rrggbb` (`UI colour gold must be a #rrggbb value.`), and a collapsed pair, because `cream`,
`muted`, `gold` and `ink` must be pairwise distinct (`UI colours cream and ink must differ; both are #172f35.`). There is no
contrast gate: judge legibility with the font proof below.

**Pads, HUD and symbols keep fixed colours.** The `pad_*` controller prompts, the `hud_*` icons and the `sym_*` icons draw
their own literal colours that are not roles, so `colors` never recolours them; they are byte-identical with and without an
override. Plan the palette so the fixed pad, HUD and symbol colours still sit well on the surfaces you choose.

## Display ramps (`displayRamps`)

A `face: "display"` font paints each tone as a five-colour ramp: highlight on top edges, the face, shade on bottom edges, an
outline, and a separate drop shadow. `displayRamps` overrides steps per tone. It is a map of tone (`cream`, `muted`, `gold`,
`ink`) to any of `highlight`, `shade`, `outline` and `shadow`, each `#rrggbb`. The face stays the tone's `colors` role, so
change the face with `colors`. A step you omit keeps the colour derived from the resolved `colors`, and `shadow` defaults to
the resolved outline.

```json
{
  "version": 1,
  "output": "dist/display",
  "scale": 2,
  "ui": {
    "name": "ui-display", "kind": "font", "face": "display", "characters": "AB!",
    "displayRamps": {"gold": {"highlight": "#fff0b0", "shade": "#a0661a", "outline": "#2a1608", "shadow": "#000000"}}
  }
}
```

`agent-sprites build display.json --json` publishes it. The drop shadow is the ring cell below or to the right of a lit cell
(its up, left or up-left neighbour is lit); the rest of the one-pixel ring is the outline. `ui-report.json` gains
`report.displayRamps`, listing `highlight`, `face`, `shade`, `outline` and `shadow` for each of the four tones, and only when
the option is given; without it the output is byte-identical to before.

Derived defaults, from the resolved 16 roles (a mix is a percentage of the second colour blended into the face):

| Tone | Highlight | Shade | Outline |
| --- | --- | --- | --- |
| `ink` | face toward `specimenWell` 70% | face toward `shadow` 40% | `light` |
| `gold` | face toward white 55% | face toward `wornCopper` 60% | `shadow` |
| `cream` | face toward white 60% | face toward `edge` 55% | `shadow` |
| `muted` | face toward white 45% | face toward `shadow` 50% | `shadow` |

Validation fails the build with a message naming the field: `displayRamps applies only to fonts with face display.` (any
other font, skin or logo), `Unknown displayRamps tone: <tone>`, `Unknown displayRamps step: displayRamps.<tone>.<step>` and
`displayRamps.<tone>.<step> must be a #rrggbb value.` There is no contrast gate; judge legibility with the font proof. The
tone pixel check below accepts exactly the declared ramp, so a pixel outside it still fails with `UI font tone pixels
differ: <tone>`.

## Glyph frame names (`frameNames`)

Font recipes (regular, compact and display) name each glyph frame `glyph_<hex4>_<tone>`, for example `glyph_0021_cream`.
`frameNames` is a template string that renames them. Tokens: `{tone}`, `{dec}` (decimal code point), `{hex}` (lower-case hex,
unpadded) and `{hex4}` (hex padded to four digits). The template must contain `{tone}` and one code token, and its literal
text may use only letters, digits, underscore, dot and hyphen. An unknown token, an unmatched brace, an unsafe character, or
an empty or non-string value fails the build with a message naming `frameNames`, as does a template that gives two frames
one name. `glyph_{hex4}_{tone}` reproduces the default.

```json
{
  "version": 1,
  "output": "dist/names",
  "scale": 2,
  "ui": {"name": "ui-font", "kind": "font", "characters": "AB!", "frameNames": "glyph-{tone}-{dec}"},
  "expectedFrames": ["glyph-cream-33", "glyph-ink-65", "glyph-gold-66"]
}
```

`agent-sprites build names.json --json` publishes it; `!` becomes `glyph-cream-33`. The names appear in
`report.frames[].alias`, `report.glyphs[char].frames[tone]` and the atlas frame `filename`. `ui-phaser.json` for a font is
keyed by code point and holds no frame names. Look names up through the report and never parse them. Skin frames (`sym_*`,
`pad_*`, `hud_*`) keep their names, and skin and logo recipes reject `frameNames`.

## Font proof surfaces (`proof.surfaces`)

`font-proof.png` paints `ink` glyphs on `colors.paper` and every other tone on `colors.deep`. To prove tones on the
backgrounds a game really draws them on, add `proof.surfaces` at the **top level of the build config** (beside `ui`, not
inside it, because the recipe rejects unknown fields): a map of tone name to `#rrggbb`.

```json
{
  "version": 1,
  "output": "dist/font",
  "scale": 2,
  "ui": {"name": "ui-font", "kind": "font", "theme": "moss-brass"},
  "proof": {"surfaces": {"muted": "#2a3a44", "gold": "#1b2a30"}}
}
```

With it, `font-proof.json` gains `pairings`, one entry per tone: `{tone, surface, declared, contrast}` (`declared` is false for
a tone that kept its default surface; `contrast` is the WCAG ratio of the tone colour on that surface, informational only).
Omitting `proof.surfaces` leaves `font-proof.png` and `font-proof.json` unchanged and adds no `pairings`. A malformed value
(`proof.surfaces.muted must be a #rrggbb hex color, got "blue".`), an unknown tone or an unknown `proof` field fails the build
with a message naming it.

## Font tone failures

Every glyph frame must use only its tone's colours (a display ramp for `face: "display"`). A frame that does not fails the
build before publication, and the previous output is kept. The message keeps the prefix `UI font tone pixels differ: <tone>`,
then gives the mismatch total and at most 8 samples (one per glyph, tone and colour found; `samples (k of m)` when more were
found):

```text
UI font tone pixels differ: cream; 448 mismatching pixels; samples (3): glyph "?" cell glyph_003f_cream tone cream at (2,4) found #ff00ff, allowed #f7f8f1 #eceddb #acbaad #10242d; glyph "A" cell glyph_0041_cream tone cream at (2,4) found #ff00ff, allowed #f7f8f1 #eceddb #acbaad #10242d; glyph "B" cell glyph_0042_cream tone cream at (1,4) found #ff00ff, allowed #f7f8f1 #eceddb #acbaad #10242d
```

The cell is the frame alias, `(x,y)` is the pixel in the frame, and `allowed` is the tone's colour ramp.

## `wasteland` theme and the HUD set

`theme: "wasteland"` swaps the palette to the built-in wasteland ramps (night backing, dust brass, oxide teal, rust
copper, harvest gold; `report.colors` lists every colour) and adds the frames a survival or farming HUD needs.
Fonts take the theme palette and keep the same glyph frames. The artwork of every `moss-brass` frame is unchanged (0.70.0
repacked the sheets, so the PNG bytes are not).

Additional skin frames (wasteland only):

- `meter_track` and `meter_fill_<tone>` for `hunger thirst health stamina warn danger rad`: four-pixel bars. Both
  publish `content: {x:0,y:10,w:24,h:4}`. Draw the track across the bar width, then draw the fill's content rect
  cropped to `fraction * width`. `progress_*` remain the thin two-pixel bars.
- `minimap_frame`: a hollow nine-slice (`hollow: true`, insets 5). Only the border is painted, so the map shows
  through the middle.
- `tab_normal`, `tab_selected`: nine-slice inventory tabs.
- `hud_<name>`: 12x12 colour icons centred in the 24x24 cell (`icon: true, color: true`). Use `getOpaqueBounds` and
  `drawPixelFit`, or the 12px region at `(6,6)`. Names: `hunger thirst health stamina weight clock exposure
  radiation weather_clear weather_heat weather_dust weather_rain weather_acid-rain weather_rad-storm weather_night`.
  Green is reserved for radiation, violet for toxins and orange for heat.
- `sym_<name>`: colour symbol icons in the same 12x12 box (`icon: true, color: true`), outlined and bevelled with one light
  direction: `skull wheat bolt sun moon star check cross lock`. The heart is `hud_health` and the drop is `hud_thirst`;
  `hud_stamina` is also a bolt and `hud_weather_night` a moon, for those two meanings.

## Symbols in text

Every font (all faces, all themes) draws game symbols inline so they take the tone like any letter, and a message can say
"Health ♥ 3". `report.symbols` maps a name to its character: `heart ♥ (U+2665)`, `skull ☠ (U+2620)`, `check ✓ (U+2713)`,
`star ★ (U+2605)`, `moon ☾ (U+263E)`, `bolt ⚡ (U+26A1)`, `sun ☼ (U+263C)`, `cross ✕ (U+2715)`, the arrows `↑ ↓ ← →`, and
three in the private-use area because Unicode has no single BMP character for them: `drop U+E000`, `wheat U+E001`,
`lock U+E002`. They stay in the BMP because Phaser's BitmapText walks UTF-16 code units, so an astral emoji could not be drawn.
Read the name from `symbols` (`report.symbols.heart`, and `symbols` in `ui-phaser.json`) instead of hard-coding the code point.

- `pad_<family>_<id>`: controller-button prompts for hint rows beside small text (`icon: true, color: true`),
  colour pixel art at most 13 px tall, centred in the cell; read the painted `bounds`. Families `xbox ps switch deck`.
  Ids: face buttons by position `south east west north` (Xbox/Deck A green, B red, X blue, Y yellow; PlayStation
  cross, circle, square, triangle shapes; Switch dark discs, south=B east=A west=Y north=X), `lb rb` (flat pills; LB/RB,
  L1/R1, L/R), `lt rt` (taller, curved; LT/RT, L2/R2, ZL/ZR), `back start` (view/menu, create/options, minus/plus),
  `ls rs` (stick), `lsb rsb` (stick pressed: gold ring, light cap), `dpad`, `dpad_up dpad_down dpad_left dpad_right`
  and `dpad_ud dpad_lr` (arms highlighted). Deck adds back-grips `l4 r4 l5 r5`. 88 frames; the full list is exported
  as `PAD_ALIAS_NAMES` from `server/authoring/ui-pad.js`. Sizes: face and system discs 11x11, stick 13x13, d-pad 13x13,
  bumper 19x9, trigger 15x13, PlayStation create/options 15x9, grips 11x13.
- `cursor_tile` (16x16 gold corner brackets, hollow centre) and `cursor_aim` (11x11 crosshair, hollow centre pixel),
  both with a dark outline.

Panels, buttons, slots (`slot_normal`, `slot_selected` are the hotbar), tooltips and message skins are the same
frames as `moss-brass`, painted in the new palette.
