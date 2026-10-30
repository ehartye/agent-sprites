# Godot atlas loader

A small Godot 4 example that loads an agent-sprites atlas (the PNG sheet and its Aseprite JSON `.atlas.json`) into a `SpriteFrames`, one animation per tag. Godot has no importer for this atlas, so copy this folder and use `scripts/atlas_loader.gd` as your loader.

Tested with Godot 4.7.2 (stable). It needs no editor import: the PNG is read with `Image.load_from_file`, so it runs from a fresh checkout.

## Use it in a game

```gdscript
const AtlasLoader = preload("res://scripts/atlas_loader.gd")

func _ready() -> void:
	var atlas := AtlasLoader.load_atlas("res://hero.png", "res://hero.atlas.json")
	$AnimatedSprite2D.sprite_frames = atlas.sprite_frames
	$AnimatedSprite2D.play("walk")  # a tag name from the atlas
```

`load_atlas` also returns, per tag, the played frames with their atlas index, duration, region, offset, source size and pivot (see the header of `scripts/atlas_loader.gd`), and `pivot` for the whole atlas. The pivot is in pixels from the top-left of the untrimmed cell. To anchor a sprite at its pivot, set `AnimatedSprite2D.centered = false` and `offset = -Vector2(atlas.pivot)`: the frame textures report the untrimmed cell size, so the offset works for trimmed and untrimmed atlases alike.

## Check it

From the repository root, with `godot` standing for your Godot 4.7.2 console executable:

```
godot --headless --path examples/godot --script res://scripts/check_atlas_loader.gd
```

The check loads the three fixtures in `../atlas-fixtures`, compares every tag with that fixture's `expected.json` (played frame order, durations in milliseconds, loop behaviour, and each frame's region, offset, source size and pivot), and plays each non-looping tag on an `AnimatedSprite2D` to see that it stops on its last frame. The last line is `ATLAS-LOADER PASS fixtures=3 tags=6` and the exit code is 0. Any mismatch prints a line naming the fixture, tag and frame and exits 1.

`-- --tamper` changes one expected duration in memory. That run must fail with exit code 1:

```
godot --headless --path examples/godot --script res://scripts/check_atlas_loader.gd -- --tamper
```

Godot may print "leaked" notices when a script quits. They are harmless.

## What the loader honours

- The tag range: `from` and `to` are inclusive indexes into the atlas `frames` array.
- Per-frame durations. Each frame keeps its exported milliseconds; the animation runs at 1000 fps so the stored duration is the millisecond count.
- All four directions: `forward`, `reverse`, `pingpong` and `pingpong_reverse`. The way back is written out as explicit frames, with neither end repeated, rather than using Godot's native ping-pong mode.
- The loop flag. A tag loops unless its `loop` is explicitly false; a tag with `loop: false` plays once and holds its last frame.
- Trimmed frames. Each frame is drawn at its `spriteSourceSize` offset inside the untrimmed cell, and its texture size is the untrimmed cell size (`AtlasTexture.margin` is set to the offset and the size difference).
- The pivot, from the slice named `pivot`, relative to the untrimmed cell.

## What it does not do

- Audio.
- Normal maps; load a paired normal-map PNG yourself.
- Aseprite slices other than `pivot`.
- Rotated frames; the loader refuses an atlas that has them.

## Files

- `scripts/atlas_loader.gd`: the loader.
- `scripts/check_atlas_loader.gd`: the headless check.
- `project.godot`: a minimal project so the check can run; nearest-neighbour filtering is the default.
