extends SceneTree
## Headless check of atlas_loader.gd against the shared fixtures.
##
##   godot --headless --path examples/godot --script res://scripts/check_atlas_loader.gd
##   godot --headless --path examples/godot --script res://scripts/check_atlas_loader.gd -- --tamper
##
## For every tag of every fixture in ../atlas-fixtures it compares the played
## sequence, the durations, the loop behaviour and each frame's region, offset,
## source size and pivot with expected.json. One-shot tags are then played on a
## real AnimatedSprite2D to see that they stop on their last frame. Exit code 0
## and a final "ATLAS-LOADER PASS" line mean everything matched. --tamper changes
## one expected duration in memory, so the check must fail and name the tag and frame.

const AtlasLoader = preload("res://scripts/atlas_loader.gd")
const FIXTURES_DIR := "res://../atlas-fixtures"

var failures: Array[String] = []
var fixtures_checked := 0
var tags_checked := 0
var tamper := false
var one_shots: Array[Dictionary] = []
var current: Dictionary = {}
var sprite: AnimatedSprite2D = null
var observed: Array[int] = []
var finished := false
var elapsed := 0.0
var hold_left := 0.0
var done := false


func fail(fixture: String, tag: String, frame: Variant, message: String) -> void:
	var where := "fixture=%s tag=%s" % [fixture, tag]
	if frame != null:
		where += " frame=%s" % str(frame)
	failures.append("ATLAS-LOADER FAIL %s: %s" % [where, message])


func _initialize() -> void:
	tamper = "--tamper" in OS.get_cmdline_user_args()
	var root_dir := ProjectSettings.globalize_path(FIXTURES_DIR).simplify_path()
	var names := DirAccess.get_directories_at(root_dir)
	names.sort()
	for fixture_name in names:
		var dir := root_dir.path_join(fixture_name)
		if not FileAccess.file_exists(dir.path_join("expected.json")):
			continue
		check_fixture(fixture_name, dir)
	if fixtures_checked == 0:
		fail("-", "-", null, "no fixtures found in " + FIXTURES_DIR)
	if not failures.is_empty():
		finish()


func check_fixture(fixture_name: String, dir: String) -> void:
	var expected: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(dir.path_join("expected.json")))
	if tamper and fixtures_checked == 0:
		# Change one expected duration in memory so the check has to notice.
		expected.tags[0].steps[0].duration = int(expected.tags[0].steps[0].duration) + 1
		print("tamper: expected duration of %s frame 0 is now %d ms" % [expected.tags[0].name, int(expected.tags[0].steps[0].duration)])
	var loaded := AtlasLoader.load_atlas(dir.path_join(expected.image), dir.path_join(expected.atlas))
	if loaded.is_empty():
		fail(fixture_name, "-", null, "loader returned nothing")
		return
	fixtures_checked += 1
	var sprite_frames: SpriteFrames = loaded.sprite_frames
	var pivot_expected: Variant = vec_or_null(expected.get("pivot"))
	if loaded.pivot != pivot_expected:
		fail(fixture_name, "-", null, "pivot %s, expected %s" % [str(loaded.pivot), str(pivot_expected)])
	if loaded.tags.size() != expected.tags.size():
		fail(fixture_name, "-", null, "%d tags loaded, expected %d" % [loaded.tags.size(), expected.tags.size()])

	for tag in expected.tags:
		var tag_name: String = tag.name
		if not loaded.tags.has(tag_name) or not sprite_frames.has_animation(tag_name):
			fail(fixture_name, tag_name, null, "tag was not loaded")
			continue
		tags_checked += 1
		check_tag(fixture_name, tag, loaded.tags[tag_name], sprite_frames)
		if not tag.loop:
			one_shots.append({"fixture": fixture_name, "tag": tag_name, "frames": sprite_frames, "count": tag.steps.size()})

	if fixture_name == "trimmed":
		check_trimmed_frame_3(loaded)


func check_tag(fixture_name: String, tag: Dictionary, got: Dictionary, sprite_frames: SpriteFrames) -> void:
	var tag_name: String = tag.name
	if got.loop != tag.loop:
		fail(fixture_name, tag_name, null, "loop is %s, expected %s" % [got.loop, tag.loop])
	var mode := sprite_frames.get_animation_loop_mode(tag_name)
	var want_mode := SpriteFrames.LOOP_LINEAR if tag.loop else SpriteFrames.LOOP_NONE
	if mode != want_mode:
		fail(fixture_name, tag_name, null, "SpriteFrames loop mode %d, expected %d" % [mode, want_mode])
	var count := sprite_frames.get_frame_count(tag_name)
	if count != tag.steps.size() or got.frames.size() != tag.steps.size():
		fail(fixture_name, tag_name, null, "%d frames played, expected %d" % [count, tag.steps.size()])
		return
	var fps := sprite_frames.get_animation_speed(tag_name)
	for i in count:
		var step: Dictionary = tag.steps[i]
		var played: Dictionary = got.frames[i]
		if played.index != int(step.index):
			fail(fixture_name, tag_name, i, "atlas index %d, expected %d" % [played.index, int(step.index)])
		if played.duration_ms != int(step.duration):
			fail(fixture_name, tag_name, i, "duration %d ms, expected %d ms" % [played.duration_ms, int(step.duration)])
		# What the engine will play: relative duration over fps, in milliseconds.
		var engine_ms := roundi(sprite_frames.get_frame_duration(tag_name, i) * 1000.0 / fps)
		if engine_ms != int(step.duration):
			fail(fixture_name, tag_name, i, "SpriteFrames duration %d ms, expected %d ms" % [engine_ms, int(step.duration)])
		var want: Dictionary = tag.frames[str(int(step.index))]
		var region := rect_of(want.frame)
		var offset := vec_of(want.offset)
		var source_size := Vector2i(int(want.sourceSize.w), int(want.sourceSize.h))
		var pivot_want: Variant = vec_or_null(want.get("pivot"))
		if played.region != region:
			fail(fixture_name, tag_name, i, "region %s, expected %s" % [str(played.region), str(region)])
		if played.offset != offset:
			fail(fixture_name, tag_name, i, "offset %s, expected %s" % [str(played.offset), str(offset)])
		if played.source_size != source_size:
			fail(fixture_name, tag_name, i, "source size %s, expected %s" % [str(played.source_size), str(source_size)])
		if played.pivot != pivot_want:
			fail(fixture_name, tag_name, i, "pivot %s, expected %s" % [str(played.pivot), str(pivot_want)])
		# The texture itself must carry the same placement.
		var texture := sprite_frames.get_frame_texture(tag_name, i) as AtlasTexture
		if texture == null:
			fail(fixture_name, tag_name, i, "frame texture is not an AtlasTexture")
		elif Rect2i(texture.region) != region:
			fail(fixture_name, tag_name, i, "texture region %s, expected %s" % [str(texture.region), str(region)])
		elif Vector2i(texture.margin.position) != offset:
			fail(fixture_name, tag_name, i, "texture offset %s, expected %s" % [str(texture.margin.position), str(offset)])
		elif Vector2i(texture.get_size()) != source_size:
			fail(fixture_name, tag_name, i, "texture size %s, expected %s" % [str(texture.get_size()), str(source_size)])


## Frame 3 of the trimmed fixture, with literal values from the spec: a 30x22 opaque
## box at (1, 1) in a 32x24 cell, pivot (16, 22) relative to the untrimmed cell.
func check_trimmed_frame_3(loaded: Dictionary) -> void:
	for tag_name in loaded.tags:
		for i in loaded.tags[tag_name].frames.size():
			var played: Dictionary = loaded.tags[tag_name].frames[i]
			if played.index != 3:
				continue
			if played.offset != Vector2i(1, 1):
				fail("trimmed", tag_name, i, "frame 3 offset %s, expected (1, 1)" % str(played.offset))
			if played.source_size != Vector2i(32, 24):
				fail("trimmed", tag_name, i, "frame 3 source size %s, expected (32, 24)" % str(played.source_size))
			if played.pivot != Vector2i(16, 22):
				fail("trimmed", tag_name, i, "frame 3 pivot %s, expected (16, 22)" % str(played.pivot))
			return
	fail("trimmed", "-", 3, "frame 3 is not played by any tag")


func vec_of(v: Dictionary) -> Vector2i:
	return Vector2i(int(v.x), int(v.y))


func vec_or_null(v: Variant) -> Variant:
	return null if v == null else vec_of(v)


func rect_of(r: Dictionary) -> Rect2i:
	return Rect2i(int(r.x), int(r.y), int(r.w), int(r.h))


# One-shot playback: each non-looping tag is played on a real AnimatedSprite2D and
# must show its frames in order, end on its last frame and stay there.
func _process(delta: float) -> bool:
	if done or not failures.is_empty():
		return false
	if current.is_empty():
		if one_shots.is_empty():
			finish()
			return false
		current = one_shots.pop_front()
		sprite = AnimatedSprite2D.new()
		root.add_child(sprite)
		sprite.sprite_frames = current.frames
		sprite.animation = current.tag
		observed = [0]
		finished = false
		elapsed = 0.0
		hold_left = 0.3
		sprite.frame_changed.connect(func() -> void: observed.append(sprite.frame))
		sprite.animation_finished.connect(func() -> void: finished = true)
		sprite.play(current.tag)
		return false
	elapsed += delta
	var last: int = current.count - 1
	if finished:
		hold_left -= delta
		if hold_left > 0.0:
			return false
		var want: Array[int] = []
		for i in current.count:
			want.append(i)
		if observed != want:
			fail(current.fixture, current.tag, null, "one-shot showed frames %s, expected %s" % [str(observed), str(want)])
		elif sprite.frame != last:
			fail(current.fixture, current.tag, sprite.frame, "one-shot ended on frame %d, expected last frame %d" % [sprite.frame, last])
		next_job()
	elif elapsed > 5.0:
		fail(current.fixture, current.tag, sprite.frame, "one-shot did not finish within 5 s")
		next_job()
	return false


func next_job() -> void:
	sprite.free()
	sprite = null
	current = {}
	if not failures.is_empty():
		finish()


func finish() -> void:
	if done:
		return
	done = true
	for message in failures:
		print(message)
	one_shots.clear()
	if failures.is_empty():
		print("ATLAS-LOADER PASS fixtures=%d tags=%d" % [fixtures_checked, tags_checked])
		quit(0)
	else:
		print("ATLAS-LOADER FAIL failures=%d" % failures.size())
		quit(1)
