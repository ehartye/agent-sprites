# Unity atlas loader

A small, dependency-free Unity project that loads an agent-sprites atlas (the PNG sheet plus its Aseprite JSON atlas) into sprites and plays each tag as a flipbook. Unity's Aseprite importer reads `.aseprite` files, not a sheet plus JSON, so this loader is the way to use the exported atlas in Unity.

Tested with Unity `6000.6.0f1`. (The earlier agent-engine sample used `6000.3.25f1`.) Copy the folder, or just the scripts in `Assets/Scripts` and `Assets/Editor`, into your own project.

## Run the check

The check loads the three fixtures in `../atlas-fixtures`, and compares what the loader and the player do with each fixture's `expected.json`: the played frames and their durations in milliseconds, the loop behaviour, and for every frame the sheet region, offset, source size and pivot, including the pivot of the Unity `Sprite` itself. It also imports each sheet through the project's import settings and checks them. From the repository root:

```
Unity -batchmode -nographics -quit -projectPath examples/unity -executeMethod AtlasLoaderCheck.Run -logFile -
```

On success the log ends its report with `ATLAS-LOADER PASS fixtures=3 tags=6` and Unity exits 0. Any mismatch names the fixture, tag and frame and exits 1, as does an unhandled error. `AtlasLoaderCheck.RunTampered` changes one expected duration in memory and must exit 1, which shows the check can fail. Only one Unity instance can open the project at a time, and the first run imports the project, which takes a minute or two. Unity writes `Library/`, `Temp/`, `Logs/`, `obj/` and `UserSettings/`; they are git-ignored.

## Use it in a game

Copy `<name>.png` and `<name>.atlas.json` into `Assets/`. Because they sit side by side, `AtlasTextureImport` imports the PNG with point filtering, no compression and NPOT scale `None`; Unity's defaults blur pixel art. Then:

```csharp
var flipbook = gameObject.AddComponent<Flipbook>();   // needs a SpriteRenderer, which AddComponent adds
flipbook.Load(texture, atlasJson.text);                // Texture2D and TextAsset from the imported pair
flipbook.Play("walk");                                 // a tag name from the atlas
```

Without the editor, `AtlasLoader.LoadFiles(pngPath, atlasPath)` reads the pair from disk (point filtered, uncompressed). `AtlasLoader.Load(texture, json, pixelsPerUnit)` gives a `LoadedAtlas` with a `Sprite` per frame and an `AtlasClip` per tag, and `FlipbookPlayer` plays a clip without a scene object.

## What it honours

- The tag range: `from` and `to` are inclusive indexes into the atlas `frames` array, which is not the grid cell index.
- Per-frame durations, in milliseconds.
- All four directions (`forward`, `reverse`, `pingpong`, `pingpong_reverse`). A direction is expanded into an explicit frame list, the order the exporter's own preview plays, with the way back of a ping-pong not repeating either end. Unity's `WrapMode` is not used.
- The loop flag. A tag loops unless its `loop` is explicitly false; then it plays once and holds its last frame.
- Trimmed frames: each sprite is the opaque box, and the loader reports the offset and the untrimmed source size.
- The pivot: the atlas pivot is in pixels from the top-left of the untrimmed cell, and each sprite's pivot is converted into its own rectangle. For the trimmed fixture's frame 3 (a 30x22 box at offset (1, 1) in a 32x24 cell, pivot (16, 22)) that is (15, 21) from the top-left of the box, which Unity reports as `sprite.pivot` = (15, 1) from the bottom-left.

## What it does not do

- Audio.
- Normal maps (the paired normal atlas is not read).
- Aseprite slices other than `pivot`.
- Rotated frames: the `rotated` flag is ignored.

## Layout

- `Assets/Scripts/AtlasLoader.cs`: the atlas into sprites, frame data and clips.
- `Assets/Scripts/Flipbook.cs`: `FlipbookPlayer` (timing, loop and hold) and the `Flipbook` component.
- `Assets/Scripts/MiniJson.cs`: a small JSON reader, because `JsonUtility` cannot tell an absent `loop` from a false one.
- `Assets/Editor/AtlasTextureImport.cs`: the import settings, set by code.
- `Assets/Editor/AtlasLoaderCheck.cs`: the batch check.
