# Exact palette census

Use the checked managed launcher, as required by sprite setup:

```sh
node "<plugin-root>/scripts/run-managed.js" verify scene.atlas.json --palette allowed.hex --palette-extra "#112233,#445566" --palette-mode fail --json
node "<plugin-root>/scripts/run-managed.js" verify scene.atlas.json --palette allowed.hex --mask-frame overlay-mask --palette-mode advisory
```

The palette path is relative to the invoking working directory, not the atlas. Supported files:

- `.json`: an array of `#RRGGBB` strings or `{color: "#RRGGBB"}` entries; also `{colors: [...]}`.
- `.hex`: one six-digit RGB value per nonblank line, with optional `#`. No inline comments.
- `.gpl`: `GIMP Palette` header, optional Name/Columns metadata and `#` comments, then decimal
  RGB rows (0..255) with optional color names.

Files must be UTF-8, nonempty and at most 1 MiB; at most 4096 file entries and 4096 extras.
Colors are case-normalized and deduplicated. Malformed entries fail; they are not silently dropped.
Extras require six-digit `#RRGGBB`. No nearest-color tolerance, quantization or asset rewriting occurs.

The census accepts 8-bit RGB/RGBA or indexed PNG without an embedded ICC profile.
Profile-bearing and other bit-depth/color-type inputs fail instead of silently changing colors.
Every pixel with alpha greater than zero is compared by its decoded RGB; fully transparent pixels
are ignored. Semi-transparent colors are included, unlike the opaque-only hygiene checks. Sharp
decodes the same PNG bytes used for structural verification, avoiding Canvas premultiplication
rounding. Alpha is reported in samples but is not a palette channel.

`paletteCensus.frames` lists each non-mask atlas frame by name, with exact `offPalettePixels`,
`offPaletteColors`, per-color counts, checked/masked/transparent counts and up to 16 coordinate
samples per color. `samplesTruncated` states when samples are incomplete. Counts stay exact.
Coordinates are packed-frame-local before rotation/trim restoration. Aliases have their own rows;
do not sum rows to infer unique sheet pixels. Unused atlas pixels outside frames are not audited.

With a palette, mode defaults to `fail`: any off-palette finding adds an error and exits 1.
`advisory` adds warnings and preserves success if structural and other checks pass. Bad inputs and
invalid masks always fail. Without palette options, existing verification behavior is unchanged.
`--allow-colors` remains a hygiene exemption and has no effect on palette membership.

## Explicit mask contract

`--mask-frame` names one exact frame in the same atlas, applied to all remaining frames. Opaque
white pixels exclude the corresponding packed position; opaque black or transparent pixels keep
it. Any other visible RGB or partial alpha is invalid. Mask rectangle aliases with identical rotation/trim/source geometry are excluded from
the census as support data, but still receive ordinary structural/hygiene checks when requested.
Every target must match the mask's packed dimensions, rotation, source dimensions and trim offset;
there is no scaling or implicit alignment. A mask-only atlas is refused. Masked counts include all
excluded positions, including positions where the target is transparent.

Choose the mask deliberately: a fully white mask exempts the entire frame, so zero off-palette
pixels then proves nothing about the artwork. Review `checkedPixels` and `maskedPixels`, and inspect
the mask visually. This is an explicit exported-mask workflow, not new alpha-layer authoring.

Palette inputs are protected from report/contact output collisions, including symlinks and hardlinks.
Existing explicit report/contact output behavior otherwise stays unchanged. The census is an export
check, not a claim about post-render blending, shaders, color management or aesthetic quality.
