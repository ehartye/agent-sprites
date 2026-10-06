# Bitmap UI recipes

Build `font.json` and `skin.json` through the checked managed CLI. Each selects the
`ui` inline source, exclusively of `ops`, `generator`, `character`, and `environment`.
Themes are `moss-brass` (default) and `wasteland`. `name`, `kind`, `theme`, and optional
font-only `characters` and `face` are the complete recipe fields; unknown fields fail.

Use `face: "compact"` for secondary hints, captions and inventory descriptions.
It has authored four-column, six-row letters in 6×10 cells, baseline 7, line height
10, advance 5 and space advance 3. Punctuation/symbols retain up to five columns;
accents and descenders have reserved rows. It supports the same repertoire and
tones as the default `face: "regular"`. Build it as a separate font atlas, then
compose both faces at integer 2×: ordinary lettering is 14 pixels high and compact
lettering 12. Do not downscale the regular font to fake smaller type. Use matching
advance/space metrics in semantic layouts. Keep important actions in the regular
face and quiet supporting text in compact; use ink on light panels, cream on dark.

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

## `wasteland` theme and the HUD set

`theme: "wasteland"` swaps the palette to the Fallow Valley ramps (night backing, dust brass, oxide teal, rust
copper, harvest gold; `report.colors` lists every colour) and adds the frames a survival or farming HUD needs.
`moss-brass` output is unchanged byte for byte. Fonts take the theme palette and keep the same glyph frames.

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

Panels, buttons, slots (`slot_normal`, `slot_selected` are the hotbar), tooltips and message skins are the same
frames as `moss-brass`, painted in the new palette.
