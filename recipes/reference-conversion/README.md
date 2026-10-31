# Reference conversion recipe

Convert a supplied reference image to a native pixel grid, prove the result met
its stated contract, then trace it into editable shapes. This is a recipe, not a
command: `sprite.js trace` stays lossless and takes no grid, palette or
colour-count option. The recipe only adds a measurement, `check.mjs`, that
decodes the converted PNG and refuses a result that breaks the contract.

Why measure: an encoder option is a request, not evidence. A PNG encoder asked
for 32 to 128 colours may write a 256-entry palette, so count the decoded pixels.

## 1. State the contract

Write these down before converting; the check refuses any that are missing.

| Term | Meaning |
| --- | --- |
| Native grid | The artwork size in grid pixels, `WxH` (for example `32x32`). Whole numbers only. |
| Cell | Image pixels per grid pixel in the delivered PNG. `1` for a native-size PNG; a whole number above 1 for a nearest-neighbour preview. Never fractional. |
| Palette policy | Which colours may appear: a decoded-colour budget (`--max-colors`) counted over visible pixels, the palette method (for example median cut) is stated by the author in the report and is not machine-checked. |
| Dither | `none`, `ordered` or `diffusion`. Recorded in the report, not verified. |
| Alpha | `opaque` (every pixel alpha 255), `binary` (alpha 0 or 255 only) or `straight` (partial alpha allowed). |

## 2. Convert

Produce the converted PNG with any tool, keeping the reference unchanged and
saving the converted file under a different name (preserve both). Resample to the
native grid with a nearest-neighbour or area filter, reduce to the palette policy,
and apply the stated dither and alpha. Do not trust the encoder's palette setting
to enforce the budget.

## 3. Check the decoded pixels

The check reads the PNG as 8-bit RGBA at its delivered size and prints a JSON
report (`sha256`, size, `decodedColours`, transparent and semitransparent pixel
counts, `problems`). It exits 0 when the contract holds, 1 when it is broken and
2 on bad usage. It refuses a colour count above the budget, an image that is not a
whole number of cells for the stated grid (a fractional grid), grid cells that are
not one flat colour, an alpha policy the pixels break, and any unstated term. RGB
under alpha 0 is invisible and not counted, matching trace.
Only the colour budget, grid and alpha policy are machine-checked. Known limits: with a
cell size of 1 the check cannot tell whether the grid is genuine, and dither is
recorded, not verified.

It loads `sharp` from the managed release for this plugin version, so run it with
the plugin root resolved as in [CLI setup](../../skills/sprite-editing/references/cli-setup.md):

```text
node "<plugin-root>/recipes/reference-conversion/check.mjs" converted.png --grid 32x32 --max-colors 64 --alpha binary --dither none
```

If the managed release is missing it stops with the `sprite-setup` instruction.
In a development checkout with installed dependencies it falls back to the
checkout's `sharp`.

Fixtures for trying the check live in `tests/fixtures/reference-conversion/` and
are 8x8, 16x16 and 10x10 PNGs. Run from the repository root:

```text
# 48 colours, budget 64: exit 0
node recipes/reference-conversion/check.mjs tests/fixtures/reference-conversion/within-budget-48.png --grid 8x8 --max-colors 64 --alpha opaque --dither none

# 100 colours, budget 64: exit 1, "100 decoded colours exceed the budget of 64"
node recipes/reference-conversion/check.mjs tests/fixtures/reference-conversion/over-budget-100.png --grid 16x16 --max-colors 64 --alpha opaque --dither none

# 10x10 pixels at 4 px per cell on a 2x2 grid: exit 1, fractional grid
node recipes/reference-conversion/check.mjs tests/fixtures/reference-conversion/fractional-grid.png --grid 2x2 --cell 4 --max-colors 64 --alpha opaque --dither none

# no --alpha: exit 1, "alpha policy is unstated"
node recipes/reference-conversion/check.mjs tests/fixtures/reference-conversion/within-budget-48.png --grid 8x8 --max-colors 64 --dither none
```

## 4. Trace the converted PNG

Only a converted PNG that passed the check goes on to trace. Use a new output
directory; the reference and the converted file are never modified:

```text
sprite.js trace converted.png --out converted-baseline --name converted --json
```

Keep the check report next to the baseline as the record of the grid, palette,
dither and alpha contract and the hash of the file that was traced.

| Fixture | Pixels | Decoded colours | Used to show |
| --- | --- | --- | --- |
| `within-budget-48.png` | 8x8 | 48 | passes a budget of 64 |
| `over-budget-100.png` | 16x16 | 100 | refused above a budget of 64 |
| `fractional-grid.png` | 10x10 | 4 | refused as a fractional grid at cell 4 |
