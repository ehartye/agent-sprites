extends RefCounted
## Loads an agent-sprites Aseprite JSON atlas and its PNG into a SpriteFrames.
##
## Every atlas tag becomes one animation of the same name. The loader honours
## the tag range, the per-frame durations, the direction (forward, reverse,
## pingpong, pingpong_reverse), the loop flag, trimmed frames and the pivot.
## It does not use the editor importer, so it runs from a fresh checkout.
##
## Usage:
##   const AtlasLoader = preload("res://scripts/atlas_loader.gd")
##   var atlas := AtlasLoader.load_atlas("res://hero.png", "res://hero.atlas.json")
##   sprite.sprite_frames = atlas.sprite_frames
##   sprite.play("walk")
##
## load_atlas() returns a Dictionary, or an empty one after push_error():
##   sprite_frames  SpriteFrames, one animation per tag
##   pivot          Vector2i in pixels from the top-left of the untrimmed cell, or null
##   tags           Dictionary, tag name -> { loop: bool, direction: String, frames: Array }
## Each entry of a tag's frames is the played order, one per SpriteFrames frame:
##   index          index into the atlas "frames" array (not a grid cell)
##   duration_ms    int, the exported duration
##   region         Rect2i, the rectangle in the sheet
##   offset         Vector2i, where the region sits inside the untrimmed cell
##   source_size    Vector2i, the untrimmed cell size
##   pivot          Vector2i, in pixels from the top-left of the untrimmed cell, or null

## Durations are stored in milliseconds. SpriteFrames takes a duration relative to
## 1 / fps, so a fixed 1000 fps makes the stored number the milliseconds themselves.
const FPS := 1000.0
const DIRECTIONS := ["forward", "reverse", "pingpong", "pingpong_reverse"]


static func load_atlas(png_path: String, atlas_path: String) -> Dictionary:
	var atlas: Variant = _read_json(atlas_path)
	if not (atlas is Dictionary) or not atlas.has("frames") or not atlas.has("meta"):
		push_error("Not an agent-sprites atlas: " + atlas_path)
		return {}
	var image := Image.load_from_file(png_path)
	if image == null or image.is_empty():
		push_error("Cannot load image: " + png_path)
		return {}
	var texture := ImageTexture.create_from_image(image)
	var frames: Array = atlas.frames
	var meta: Dictionary = atlas.meta

	var pivot: Variant = null
	for slice in meta.get("slices", []):
		if slice.name == "pivot" and slice.keys.size() > 0:
			pivot = Vector2i(int(slice.keys[0].pivot.x), int(slice.keys[0].pivot.y))
			break

	var sprite_frames := SpriteFrames.new()
	sprite_frames.remove_animation("default")
	var tags := {}
	for tag in meta.get("frameTags", []):
		var direction: String = tag.get("direction", "forward")
		var first := int(tag.from)
		var last := int(tag.to)
		if direction not in DIRECTIONS or first < 0 or last < first or last >= frames.size():
			push_error("Unsupported tag %s (direction %s, range %d to %d)" % [tag.name, direction, first, last])
			return {}
		# A tag loops unless its loop is explicitly false.
		var loops: bool = tag.get("loop", true) != false
		var name: String = tag.name
		sprite_frames.add_animation(name)
		sprite_frames.set_animation_speed(name, FPS)
		sprite_frames.set_animation_loop_mode(name, SpriteFrames.LOOP_LINEAR if loops else SpriteFrames.LOOP_NONE)
		var played := []
		for index in sequence(first, last, direction):
			var f: Dictionary = frames[index]
			if f.get("rotated", false):
				push_error("Rotated frames are not supported (frame %d)" % index)
				return {}
			var region := Rect2i(int(f.frame.x), int(f.frame.y), int(f.frame.w), int(f.frame.h))
			var offset := Vector2i(int(f.spriteSourceSize.x), int(f.spriteSourceSize.y))
			var source_size := Vector2i(int(f.sourceSize.w), int(f.sourceSize.h))
			var at := AtlasTexture.new()
			at.atlas = texture
			at.region = Rect2(region)
			# Godot draws a margin's position as the region's offset and grows the texture
			# size by the margin's size, so this draws a trimmed region at its place inside
			# the untrimmed cell and reports the untrimmed size.
			at.margin = Rect2(Vector2(offset), Vector2(source_size - region.size))
			sprite_frames.add_frame(name, at, float(f.duration))
			played.append({
				"index": index,
				"duration_ms": int(f.duration),
				"region": region,
				"offset": offset,
				"source_size": source_size,
				"pivot": pivot,
			})
		tags[name] = {"loop": loops, "direction": direction, "frames": played}
	return {"sprite_frames": sprite_frames, "pivot": pivot, "tags": tags}


## The played order of atlas indices for a tag. Ping-pong appends the way back
## without repeating either end.
static func sequence(first: int, last: int, direction: String) -> Array[int]:
	var forward: Array[int] = []
	for i in range(first, last + 1):
		forward.append(i)
	var indices: Array[int] = forward.duplicate()
	if direction == "reverse" or direction == "pingpong_reverse":
		indices.reverse()
	if direction == "pingpong" or direction == "pingpong_reverse":
		var back: Array[int] = indices.slice(1, indices.size() - 1)
		back.reverse()
		indices.append_array(back)
	return indices


static func _read_json(path: String) -> Variant:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return null
	return JSON.parse_string(file.get_as_text())
