# App icons recipe

Build a web app's whole icon set from three hand-drawn tiles: `agent-sprites app-icons` reads a built tileset and
writes every size by whole-number nearest-neighbour scales and crops, opaque and without an alpha channel. This
folder is a complete working example.

```
agent-sprites build sprite-project.json      # icons.pxl -> built/icons.png + built/icons.atlas.json
agent-sprites app-icons app-icons.json       # built/icons.atlas.json -> icons/
agent-sprites app-icons app-icons.json --check
```

## The config

`app-icons.json`, the smallest config that works. All three fields are required:

```json
{
  "version": 1,
  "atlas": "built/icons.atlas.json",
  "output": "icons"
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `version` | yes | Always the number `1`. A config without it is rejected. |
| `atlas` | yes | The `<name>.atlas.json` that the tileset build wrote, relative to the config. |
| `output` | yes | The directory that receives the icon files, relative to the config. It is created when missing. |
| `tiles` | no | Frame names of the three tiles: `{"master": "icon_master", "mid": "icon_32", "tiny": "icon_16"}` (these are the defaults; give only the ones you rename). |
| `card` | no | Adds the share card `og-card.png`; see [the share card](#the-share-card). |

Any other field is an error. Paths inside the config resolve from the config's own folder, not the working directory.

## The tiles

The atlas comes from a `tileset` project ([tileset recipe](../tileset/README.md)) with a 64 px cell:

```json
{
  "version": 1,
  "output": "built",
  "omit": ["project", "operations", "preview"],
  "tileset": { "name": "icons", "cell": 64, "columns": 3, "sources": ["icons.pxl"] }
}
```

A tileset sheet is always written at 1x, which is what `app-icons` reads. Draw three tiles in the `.pxl` source
([icons.pxl](icons.pxl)):

```
@tile icon_master                      % 64 rows of 64: the whole cell
@tile icon_32 x=0 y=0 w=32 rows=32     % 32 rows of 32, in the top left of the 64 px cell
@tile icon_16 x=0 y=0 w=16 rows=16     % 16 rows of 16, in the top left of the 64 px cell
```

- Each tile is read from the **top left** of its cell at its own size (64, 32, 16), so the two small tiles need
  `x=0 y=0`. The rest of their cell stays empty.
- Every pixel of a tile is opaque. A `.` (transparent) inside a tile fails the build of the icons.
- Draw the master full-bleed with a flat border: the maskable icon and the share card continue its edge pixels outward.
- Redraw the 32 and 16 px tiles by hand; a 64 px picture does not survive halving.

## What it writes

Eight files, always with these names, in `output`:

| File | Size | Made from |
| --- | --- | --- |
| `icon-192.png` | 192x192 | master at 3x |
| `icon-512.png` | 512x512 | master at 8x |
| `icon-maskable-512.png` | 512x512 | master on an 11 px bleed of its own edge pixels, at 6x, cropped: the art fills 75% of the side |
| `apple-touch-icon.png` | 180x180 | the master's 60x60 centre at 3x |
| `favicon-16.png` | 16x16 | tiny at 1x |
| `favicon-32.png` | 32x32 | mid at 1x |
| `favicon-48.png` | 48x48 | tiny at 3x |
| `favicon.ico` | 16, 32, 48 | the three favicon PNGs as entries |

With `card`, `og-card.png` is the ninth. The PNGs are 8-bit RGB with no alpha channel.

`--check` rebuilds the set in memory, compares decoded pixels with the files in `output`, writes nothing and exits 1
naming each stale or missing file. `--json` prints `{ok, mode, output, files: [{name, width, height, status}], errors}`.

## The web manifest and page tags

`app-icons` writes image files only. It does not write a web manifest or HTML; add those by hand. The maskable icon
is a separate picture, so give it its own entry instead of `"purpose": "any maskable"` on one file:

```json
{
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

```html
<link rel="icon" href="icons/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="icons/favicon-16.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="manifest" href="manifest.webmanifest">
```

Manifest `src` values resolve from the manifest's URL and `href` values from the page; adjust the prefix to where the
site serves the folder.

## The share card

`card` composes a wide scene from the master and its edge pixels, scales it and crops it to the card:

```json
{
  "version": 1,
  "atlas": "built/icons.atlas.json",
  "output": "icons",
  "card": {
    "width": 1200,
    "height": 630,
    "scale": 9,
    "sceneWidth": 134,
    "masterX": 35,
    "horizon": 44,
    "stars": { "sample": [9, 7], "at": [[12, 9], [118, 14], [100, 4]] },
    "logo": { "image": "logo.png", "scale": 3, "x": 60 }
  }
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `width`, `height` | yes | Card size in pixels. `height` must be a multiple of `scale`. |
| `scale` | yes | Whole-number scale of the scene. The scene is `height / scale` rows tall, at least 64. |
| `sceneWidth` | yes | Scene width before scaling. `sceneWidth * scale` must be at least `width` and differ from it by an even number; the surplus is cropped equally from both sides. |
| `masterX` | yes | Column of the scene where the master's left edge sits; `masterX + 64` must fit in `sceneWidth`. The master rests on the bottom edge. |
| `horizon` | yes | Row of the master (0 at its top) on which the logo's bottom row rests. |
| `stars` | no | `sample` is a pixel of the master (0 to 63) whose colour is copied to each scene pixel in `at`. |
| `logo` | no | `image` is a PNG relative to the config, stamped at whole-number `scale` with its left edge at card pixel `x`. Pixels with alpha under 128 are skipped. |

The six required fields are required together; leave `card` out to skip the file.

## Errors

Each message names the config file and what to change. The common ones:

| Message starts | Fix |
| --- | --- |
| `app-icons.json has no "version" field` | Add `"version": 1`. |
| `Unknown app-icons field` | Only `version`, `atlas`, `output`, `tiles` and `card` exist. |
| `atlas "..." does not exist` | Run `agent-sprites build` on the tileset project first, or correct the path. |
| `The atlas has no frame icon_32` | Name the tile `icon_32`, or point `tiles.mid` at the frame you drew. The message lists the frames found. |
| `icon_32 (x,y) is not opaque` | Fill the tile, and place it with `x=0 y=0`. |
| `Frame ... is 32x32` | Build the tileset with `"cell": 64`. |
