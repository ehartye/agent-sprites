# Bitmap UI recipes

Build `font.json` and `skin.json` through the checked managed CLI. Each selects the
`ui` inline source, exclusively of `ops`, `generator`, `character`, and `environment`.
Themes are `moss-brass` (default) and `wasteland`. `name`, `kind`, `theme`, and optional
font-only `characters` and `face` (`regular`, `compact`, `display`) are the complete recipe fields; unknown fields fail.

Sheets are packed near-square (`packGrid`: the squarest sheet within 1024 px wide, then the fewest padding cells). Cells that pad
the last row are unnamed and empty; every frame name is independent of the layout, so a rebuild never renames anything. UI builds
verify the sheet shape (`atlas-shape` error above 3:1; `agent-sprites verify --max-aspect 3` checks any atlas, `maxAspect` in a
build config overrides the UI default). A 166-cell skin used to come out 48x1992 (the only even divisor was 2); it is now 312x336.

Use `face: "compact"` for secondary hints, captions and inventory descriptions.
It has authored four-column, six-row letters in 6×10 cells, baseline 7, line height
10, advance 5 and space advance 3. Punctuation/symbols retain up to five columns;
accents and descenders have reserved rows. It supports the same repertoire and
tones as the default `face: "regular"`. Build it as a separate font atlas, then
compose both faces at integer 2×: ordinary lettering is 14 pixels high and compact
lettering 12. Do not downscale the regular font to fake smaller type. Use matching
advance/space metrics in semantic layouts. Keep important actions in the regular
face and quiet supporting text in compact; use ink on light panels, cream on dark.

Use `kind: "logo"` for a title logotype: one frame named `logo`, stacked capital lettering at 4x (`text`, default
`"FALLOW
VALLEY"`, letters and digits only; one line per `
`), a lit gold-to-copper gradient, brass and dark outlines, a hard
drop shadow, a striped sun behind and a horizon of wheat. Wasteland theme colours; about 167x111 for the default text. It is
one atlas frame, so draw it as one image at the layer's integer scale (`ui-phaser.json` is `{kind:'logo', frame, size, bounds}`).
The wasteland skin also has `banner_boss`, a nine-slice plate (insets 8, padding 10x8) with copper frame and gold corner studs, for boss-name and event banners.

Use `face: "display"` for logos, banners, boss names and other big type that must still obey one integer scale per layer.
It is the regular lettering redrawn at twice the size: each 5x7 mask is smoothed with the EPX (Scale2x) rule so curves and
diagonals get real pixel steps, lit like a bevel (highlight on top edges, shade on bottom edges), outlined, and given a one pixel
drop shadow. Cells are 12x24, baseline 19, line height 24, advance 12, space advance 8. It covers every glyph of the regular
face (pass `characters` to build a smaller atlas), and every tone is a ready-made ramp, never a tint: `gold` shades toward
copper, `cream` toward brass, `muted` toward the backing, and `ink` is dark with a light outline for light panels. Draw it with
`BitmapText` at scale 1 like the other faces, and only in short strings; its width is the only reason to prefer regular.

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
positive integer scale; 2× or larger is recommended for screen text. Source 1×
labels can follow an integer-scaled game camera. No kerning or platform shaping
is applied. Normalize copy to the supported repertoire and check `missingGlyphs`.

Both builds own `ui-report.json` and `ui-runtime.mjs` alongside the usual PNG,
Aseprite atlas, editable project, operations, contact sheet and verification.
Font builds also own `ui-boot.mjs`, exporting `imageDataUrl`, `atlas`, and `report`;
this embeds the verified font for loading/failure screens without a font fetch.

## Phaser

Every UI build also writes `ui-phaser.json`, ready for Phaser 4 without an adapter.

Font: `{version, kind:'font', face, image, atlas, lineHeight, baseline, size, spaceAdvance, fallback, symbols, glyphs, tones}`.
`glyphs` lists every supported character (no space). `tones.cream|muted|gold|ink` are each a
`Phaser.Types.GameObjects.BitmapText.BitmapFontData`, exactly the shape `ParseXMLBitmapFont` produces (`font, size, lineHeight, retroFont:false, chars[charCode]` with `u0,v0,u1,v1` texture coordinates (v flipped: `1 - y/height`; Phaser's renderer reads them from the glyph) and
`x,y,width,height` = that tone's glyph cell in the font PNG, `yOffset 0`, `xAdvance` = glyph advance). `ui-boot.mjs` also exports the same object as `phaser`, for loading/error screens with no fetch. Register one font per tone
over the already-loaded PNG, then use a normal `BitmapText` at an integer scale:

```js
this.load.image('ui-font', 'assets/ui-font/ui-font.png'); this.load.json('ui-font-px', 'assets/ui-font/ui-phaser.json');
// create(): for (const [tone, data] of Object.entries(px.tones)) this.cache.bitmapFont.add(`ui-font-${tone}`, {data, texture: 'ui-font', frame: null});
// this.add.bitmapText(x, y, 'ui-font-cream', 'Hello', px.size);   // keep the scale integer
```

Skin: `{version, kind:'skin', image, atlas, cell, frames[alias]}`; each frame has `frame` (atlas frame name), `padding`, `minWidth`,
`minHeight`, `bounds` (painted pixel bounds, inclusive, as in the report; every report frame has an entry), optional `textTone`, `tile`, `content`, `icon`, `color`, `hollow`, and `nineSlice:{leftWidth,rightWidth,topHeight,bottomHeight}`
(absent for icons and tiled scrims) matching `this.add.nineslice(x, y, texture, frame, width, height, leftWidth, rightWidth, topHeight, bottomHeight)`.
Phaser stretches nine-slice edges, so size panels in whole source pixels and place them at integer positions under an integer camera zoom.

```js
import {createBitmapFont, getFrame, drawNineSlice} from './ui-runtime.mjs';, getFrame, drawNineSlice} from './ui-runtime.mjs';
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

## `wasteland` theme and the HUD set

`theme: "wasteland"` swaps the palette to the Fallow Valley ramps (night backing, dust brass, oxide teal, rust
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
