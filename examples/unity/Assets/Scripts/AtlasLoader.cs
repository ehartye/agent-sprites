using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

// Loads an agent-sprites atlas (the Aseprite "array" JSON plus its PNG sheet) into Unity sprites and playable clips.
// Unity's Aseprite importer reads .aseprite files, not a sheet plus JSON, so this loader is ours.
//
// What it follows, and why:
//  - The tag's from/to are inclusive indexes into the atlas "frames" array. That array holds every grid cell first,
//    then each group as a run, then named aliases, so a frame index is not a cell index.
//  - A tag's direction is expanded into an explicit list of steps (the order the exporter's own preview plays):
//    reverse and pingpong_reverse walk the range backwards, and both ping-pong directions append the way back
//    without repeating either end. Unity's WrapMode is not used: WrapMode.Once resets instead of holding the last
//    frame, so the loop and the hold are done by FlipbookPlayer.
//  - A tag loops unless its "loop" is explicitly false.
//  - A trimmed frame is its opaque box. Its sprite keeps the pivot relative to the untrimmed cell, so every frame of
//    a clip stands on the same world point whatever it was trimmed to.

public enum AtlasDirection { Forward, Reverse, PingPong, PingPongReverse }

public struct AtlasStep
{
    public int Index;       // index into the atlas "frames" array
    public int DurationMs;
}

public sealed class AtlasFrameData
{
    public int Index;
    public string Name;
    // The atlas convention: whole pixels, origin top-left, y pointing down.
    public RectInt Region;          // where the frame sits on the sheet
    public Vector2Int Offset;       // spriteSourceSize x, y: where the region sits inside the untrimmed cell
    public Vector2Int SourceSize;   // the untrimmed cell
    public bool HasPivot;
    public Vector2Int Pivot;        // from the top-left of the untrimmed cell (the cell centre when HasPivot is false)
    public int DurationMs;
    // Unity's convention.
    public Rect SpriteRect;         // sheet pixels, origin bottom-left
    public Sprite Sprite;
}

public sealed class AtlasClip
{
    public string Name;
    public AtlasDirection Direction;
    public string DirectionName;
    public bool Loop;
    public AtlasStep[] Steps;
    public int TotalMs;
}

public sealed class LoadedAtlas
{
    public Texture2D Texture;
    public AtlasFrameData[] Frames;
    public List<AtlasClip> Clips = new List<AtlasClip>();

    public AtlasClip GetClip(string tag)
    {
        AtlasClip clip = Clips.Find(c => c.Name == tag);
        if (clip == null) throw new KeyNotFoundException("Unknown atlas tag: " + tag);
        return clip;
    }
}

public static class AtlasLoader
{
    // Reads the sheet from disk as an uncompressed, point-filtered texture, ready for pixel art. For a texture that is
    // imported as an asset instead, AtlasTextureImport (Assets/Editor) sets the same import settings by code.
    public static Texture2D LoadTexture(string pngPath)
    {
        var texture = new Texture2D(2, 2, TextureFormat.RGBA32, false);
        if (!texture.LoadImage(File.ReadAllBytes(pngPath), false)) throw new InvalidDataException("Not a PNG: " + pngPath);
        texture.filterMode = FilterMode.Point;
        texture.wrapMode = TextureWrapMode.Clamp;
        return texture;
    }

    public static LoadedAtlas LoadFiles(string pngPath, string atlasJsonPath, float pixelsPerUnit = 100f)
    {
        return Load(LoadTexture(pngPath), File.ReadAllText(atlasJsonPath), pixelsPerUnit);
    }

    // The texture must be point filtered and uncompressed (see LoadTexture). pixelsPerUnit sets a sprite's world size.
    public static LoadedAtlas Load(Texture2D texture, string atlasJson, float pixelsPerUnit = 100f)
    {
        var root = MiniJson.Obj(MiniJson.Parse(atlasJson), "the atlas");
        var frames = MiniJson.Arr(MiniJson.Field(root, "frames", "the atlas"), "frames");
        var meta = MiniJson.Obj(MiniJson.Field(root, "meta", "the atlas"), "meta");

        bool hasPivot = false;
        Vector2Int pivot = Vector2Int.zero;
        object slicesValue;
        if (meta.TryGetValue("slices", out slicesValue))
        {
            foreach (object sliceValue in MiniJson.Arr(slicesValue, "meta.slices"))
            {
                var slice = MiniJson.Obj(sliceValue, "a slice");
                if (MiniJson.Str(MiniJson.Field(slice, "name", "a slice"), "slice name") != "pivot") continue;
                var keys = MiniJson.Arr(MiniJson.Field(slice, "keys", "the pivot slice"), "pivot keys");
                if (keys.Count == 0) break;
                var p = MiniJson.Obj(MiniJson.Field(MiniJson.Obj(keys[0], "a pivot key"), "pivot", "a pivot key"), "pivot");
                pivot = new Vector2Int(MiniJson.Int(MiniJson.Field(p, "x", "pivot"), "pivot.x"), MiniJson.Int(MiniJson.Field(p, "y", "pivot"), "pivot.y"));
                hasPivot = true;
                break;
            }
        }

        var atlas = new LoadedAtlas { Texture = texture, Frames = new AtlasFrameData[frames.Count] };
        for (int i = 0; i < frames.Count; i++)
        {
            string what = "frame " + i;
            var f = MiniJson.Obj(frames[i], what);
            RectInt region = ReadRect(MiniJson.Field(f, "frame", what), what + ".frame");
            RectInt placed = ReadRect(MiniJson.Field(f, "spriteSourceSize", what), what + ".spriteSourceSize");
            var source = MiniJson.Obj(MiniJson.Field(f, "sourceSize", what), what + ".sourceSize");
            var data = new AtlasFrameData
            {
                Index = i,
                Name = MiniJson.Str(MiniJson.Field(f, "filename", what), what + ".filename"),
                Region = region,
                Offset = new Vector2Int(placed.x, placed.y),
                SourceSize = new Vector2Int(MiniJson.Int(MiniJson.Field(source, "w", what + ".sourceSize"), "w"), MiniJson.Int(MiniJson.Field(source, "h", what + ".sourceSize"), "h")),
                DurationMs = MiniJson.Int(MiniJson.Field(f, "duration", what), what + ".duration"),
                HasPivot = hasPivot,
            };
            if (data.DurationMs < 1) throw new FormatException(what + " duration must be at least 1 ms");
            if (region.x < 0 || region.y < 0 || region.xMax > texture.width || region.yMax > texture.height || region.width < 1 || region.height < 1)
                throw new FormatException(what + " region lies outside the " + texture.width + "x" + texture.height + " sheet");
            data.Pivot = hasPivot ? pivot : new Vector2Int(data.SourceSize.x / 2, data.SourceSize.y / 2);

            // The sheet's y axis points down, Unity's points up: flip the rect.
            data.SpriteRect = new Rect(region.x, texture.height - region.y - region.height, region.width, region.height);
            // The pivot is in untrimmed-cell pixels from the top-left. Move it into the trimmed region, then flip the
            // vertical axis and normalise by the region size: Sprite.Create wants (0,0) bottom-left to (1,1) top-right.
            float inRegionX = data.Pivot.x - data.Offset.x;
            float inRegionYFromTop = data.Pivot.y - data.Offset.y;
            var normalised = new Vector2(inRegionX / region.width, 1f - inRegionYFromTop / region.height);
            data.Sprite = Sprite.Create(texture, data.SpriteRect, normalised, pixelsPerUnit, 0, SpriteMeshType.FullRect);
            data.Sprite.name = data.Name;
            atlas.Frames[i] = data;
        }

        var tags = new List<object>();
        object tagsValue;
        if (meta.TryGetValue("frameTags", out tagsValue)) tags = MiniJson.Arr(tagsValue, "meta.frameTags");
        foreach (object tagValue in tags)
        {
            var t = MiniJson.Obj(tagValue, "a tag");
            string name = MiniJson.Str(MiniJson.Field(t, "name", "a tag"), "tag name");
            int from = MiniJson.Int(MiniJson.Field(t, "from", name), name + ".from");
            int to = MiniJson.Int(MiniJson.Field(t, "to", name), name + ".to");
            if (from < 0 || to < from || to >= frames.Count) throw new FormatException("Invalid tag range: " + name);
            string directionName = "forward";
            object d;
            if (t.TryGetValue("direction", out d)) directionName = MiniJson.Str(d, name + ".direction");
            AtlasDirection direction = ParseDirection(directionName, name);
            // "loop" is only present when it was set; a tag loops unless it is explicitly false.
            bool loop = true;
            object l;
            if (t.TryGetValue("loop", out l) && l is bool) loop = (bool)l;

            var clip = new AtlasClip
            {
                Name = name,
                Direction = direction,
                DirectionName = directionName,
                Loop = loop,
                Steps = Expand(atlas.Frames, from, to, direction),
            };
            foreach (AtlasStep s in clip.Steps) clip.TotalMs += s.DurationMs;
            atlas.Clips.Add(clip);
        }
        return atlas;
    }

    // The played order of a tag as an explicit list of (frame index, duration) steps.
    public static AtlasStep[] Expand(AtlasFrameData[] frames, int from, int to, AtlasDirection direction)
    {
        var indices = new List<int>();
        for (int i = from; i <= to; i++) indices.Add(i);
        if (direction == AtlasDirection.Reverse || direction == AtlasDirection.PingPongReverse) indices.Reverse();
        if (direction == AtlasDirection.PingPong || direction == AtlasDirection.PingPongReverse)
        {
            // the way back: every frame between the two ends, in the opposite order
            for (int i = indices.Count - 2; i >= 1; i--) indices.Add(indices[i]);
        }
        var steps = new AtlasStep[indices.Count];
        for (int i = 0; i < steps.Length; i++) steps[i] = new AtlasStep { Index = indices[i], DurationMs = frames[indices[i]].DurationMs };
        return steps;
    }

    static AtlasDirection ParseDirection(string name, string tag)
    {
        switch (name)
        {
            case "forward": return AtlasDirection.Forward;
            case "reverse": return AtlasDirection.Reverse;
            case "pingpong": return AtlasDirection.PingPong;
            case "pingpong_reverse": return AtlasDirection.PingPongReverse;
            default: throw new FormatException("Unsupported tag direction \"" + name + "\" on tag " + tag);
        }
    }

    static RectInt ReadRect(object value, string what)
    {
        var o = MiniJson.Obj(value, what);
        return new RectInt(
            MiniJson.Int(MiniJson.Field(o, "x", what), what + ".x"), MiniJson.Int(MiniJson.Field(o, "y", what), what + ".y"),
            MiniJson.Int(MiniJson.Field(o, "w", what), what + ".w"), MiniJson.Int(MiniJson.Field(o, "h", what), what + ".h"));
    }
}
