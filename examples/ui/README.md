# Bitmap UI recipes

Build `font.json` and `skin.json` through the checked managed CLI. Each selects the
`ui` inline source, exclusively of `ops`, `generator`, `character`, and `environment`.
The only supported theme is `moss-brass`. `name`, `kind`, `theme`, and optional
font-only `characters` are the complete recipe fields; unknown fields fail.

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
