using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using UnityEditor;
using UnityEngine;

// Batch check: loads every fixture in ../atlas-fixtures and compares what the loader and the player do with the
// committed expected.json: the played sequence (frame index and duration in ms), the loop behaviour, and per frame
// the sheet region, offset, source size and pivot, including the Sprite that Unity ends up with.
//
//   Unity -batchmode -nographics -quit -projectPath examples/unity -executeMethod AtlasLoaderCheck.Run -logFile -
//   Unity -batchmode -nographics -quit -projectPath examples/unity -executeMethod AtlasLoaderCheck.RunTampered -logFile -
//
// Run exits 0 and logs "ATLAS-LOADER PASS fixtures=3 tags=6" when everything matches. Anything else, including an
// unhandled exception, exits 1. RunTampered changes one expected duration in memory first, so it must exit 1 and
// name the tag and frame.
public static class AtlasLoaderCheck
{
    sealed class ExpectedFrame
    {
        public RectInt Region;
        public Vector2Int Offset, SourceSize;
        public bool HasPivot;
        public Vector2Int Pivot;
    }

    sealed class ExpectedTag
    {
        public string Name, Direction;
        public bool Loop;
        public List<int> Indices = new List<int>();
        public List<int> Durations = new List<int>();
        public int DurationMs;
        public SortedDictionary<int, ExpectedFrame> Frames = new SortedDictionary<int, ExpectedFrame>();
    }

    public static void Run() { Execute(false); }

    public static void RunTampered() { Execute(true); }

    static void Execute(bool tamper)
    {
        int code = 1;
        try { code = Check(tamper); }
        catch (Exception e) { Log("ATLAS-LOADER FAIL unhandled " + e.GetType().Name + ": " + e.Message + "\n" + e.StackTrace); }
        EditorApplication.Exit(code);
    }

    static void Log(string message) { Debug.LogFormat(LogType.Log, LogOption.NoStacktrace, null, "{0}", message); }

    static int Check(bool tamper)
    {
        // <project>/Assets -> <project> -> examples -> examples/atlas-fixtures
        string fixturesRoot = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "atlas-fixtures"));
        if (!Directory.Exists(fixturesRoot)) throw new DirectoryNotFoundException("No ../atlas-fixtures next to the project folder");
        string[] folders = Directory.GetDirectories(fixturesRoot);
        Array.Sort(folders, StringComparer.Ordinal);

        var failures = new List<string>();
        int fixtures = 0, tags = 0;
        bool tampered = false;
        foreach (string folder in folders)
        {
            string name = Path.GetFileName(folder);
            if (!File.Exists(Path.Combine(folder, "expected.json"))) continue;
            List<ExpectedTag> expected = ReadExpected(Path.Combine(folder, "expected.json"));
            if (tamper && !tampered && expected.Count > 0)
            {
                ExpectedTag t = expected[0];
                Log("Tampering in memory: " + name + " tag " + t.Name + " frame " + t.Indices[0] + " expected duration " + t.Durations[0] + " ms -> " + (t.Durations[0] + 1) + " ms");
                t.Durations[0] += 1;
                tampered = true;
            }
            fixtures++;
            tags += CheckFixture(name, folder, expected, failures);
            CheckImportSettings(name, folder, failures);
        }

        if (tamper && !tampered) failures.Add("tamper had nothing to change");
        foreach (string failure in failures) Log(failure);
        if (failures.Count == 0 && !tamper && fixtures == 3 && tags == 6)
        {
            Log("ATLAS-LOADER PASS fixtures=" + fixtures + " tags=" + tags);
            return 0;
        }
        if (failures.Count == 0 && !tamper)
            failures.Add("expected 3 fixtures with 6 tags, found " + fixtures + " with " + tags);
        if (failures.Count == 0) failures.Add("tamper was not detected");
        Log("ATLAS-LOADER FAIL fixtures=" + fixtures + " tags=" + tags + " mismatches=" + failures.Count + (tamper ? " (tampered run)" : ""));
        return 1;
    }

    static int CheckFixture(string fixture, string folder, List<ExpectedTag> expected, List<string> failures)
    {
        var root = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(Path.Combine(folder, "expected.json"))), "expected.json");
        string png = Path.Combine(folder, MiniJson.Str(MiniJson.Field(root, "image", "expected.json"), "image"));
        string atlasPath = Path.Combine(folder, MiniJson.Str(MiniJson.Field(root, "atlas", "expected.json"), "atlas"));

        Texture2D texture = AtlasLoader.LoadTexture(png);
        LoadedAtlas atlas = AtlasLoader.Load(texture, File.ReadAllText(atlasPath));
        if (texture.filterMode != FilterMode.Point) failures.Add("MISMATCH fixture=" + fixture + ": texture filter mode is " + texture.filterMode + ", expected Point");
        if (UnityEngine.Experimental.Rendering.GraphicsFormatUtility.IsCompressedFormat(texture.graphicsFormat)) failures.Add("MISMATCH fixture=" + fixture + ": texture format is " + texture.format + ", expected uncompressed");

        foreach (ExpectedTag tag in expected)
        {
            int before = failures.Count;
            CheckTag(fixture, tag, atlas, texture, failures);
            Log("fixture " + fixture + " tag " + tag.Name + " (" + tag.Direction + ", loop " + (tag.Loop ? "true" : "false") + ", " + tag.Indices.Count +
                " steps, " + tag.DurationMs + " ms): " + (failures.Count == before ? "ok" : "MISMATCH"));
        }
        if (fixture == "trimmed") CheckTrimmedFrame3(atlas, failures);
        return expected.Count;
    }

    static void CheckTag(string fixture, ExpectedTag tag, LoadedAtlas atlas, Texture2D texture, List<string> failures)
    {
        string where = "fixture=" + fixture + " tag=" + tag.Name;
        AtlasClip clip = atlas.Clips.Find(c => c.Name == tag.Name);
        if (clip == null) { failures.Add("MISMATCH " + where + ": the loader found no such tag"); return; }

        if (clip.DirectionName != tag.Direction) failures.Add("MISMATCH " + where + ": direction expected " + tag.Direction + ", got " + clip.DirectionName);
        if (clip.Loop != tag.Loop) failures.Add("MISMATCH " + where + ": loop expected " + tag.Loop + ", got " + clip.Loop);
        if (clip.Steps.Length != tag.Indices.Count)
            failures.Add("MISMATCH " + where + ": " + tag.Indices.Count + " steps expected, got " + clip.Steps.Length);
        for (int k = 0; k < Math.Min(clip.Steps.Length, tag.Indices.Count); k++)
        {
            if (clip.Steps[k].Index != tag.Indices[k])
                failures.Add("MISMATCH " + where + " frame=" + tag.Indices[k] + ": step " + k + " should play frame " + tag.Indices[k] + ", plays " + clip.Steps[k].Index);
            else if (clip.Steps[k].DurationMs != tag.Durations[k])
                failures.Add("MISMATCH " + where + " frame=" + tag.Indices[k] + ": duration of step " + k + " expected " + tag.Durations[k] + " ms, got " + clip.Steps[k].DurationMs + " ms");
        }
        int expectedTotal = 0;
        foreach (int d in tag.Durations) expectedTotal += d;
        if (clip.TotalMs != expectedTotal) failures.Add("MISMATCH " + where + ": total " + expectedTotal + " ms expected, got " + clip.TotalMs + " ms");

        foreach (KeyValuePair<int, ExpectedFrame> entry in tag.Frames)
        {
            int index = entry.Key;
            ExpectedFrame e = entry.Value;
            string fw = where + " frame=" + index;
            if (index < 0 || index >= atlas.Frames.Length) { failures.Add("MISMATCH " + fw + ": no such frame"); continue; }
            AtlasFrameData f = atlas.Frames[index];
            if (!f.Region.Equals(e.Region)) failures.Add("MISMATCH " + fw + ": region expected " + e.Region + ", got " + f.Region);
            if (f.Offset != e.Offset) failures.Add("MISMATCH " + fw + ": offset expected " + e.Offset + ", got " + f.Offset);
            if (f.SourceSize != e.SourceSize) failures.Add("MISMATCH " + fw + ": source size expected " + e.SourceSize + ", got " + f.SourceSize);
            if (f.HasPivot != e.HasPivot) failures.Add("MISMATCH " + fw + ": pivot present expected " + e.HasPivot + ", got " + f.HasPivot);
            else if (e.HasPivot && f.Pivot != e.Pivot) failures.Add("MISMATCH " + fw + ": cell pivot expected " + e.Pivot + ", got " + f.Pivot);

            // The Sprite, worked out here from the expected values alone.
            Sprite s = f.Sprite;
            var wantRect = new Rect(e.Region.x, texture.height - e.Region.y - e.Region.height, e.Region.width, e.Region.height);
            if (s.rect != wantRect) failures.Add("MISMATCH " + fw + ": sprite rect expected " + wantRect + " (y flipped), got " + s.rect);
            Vector2Int cellPivot = e.HasPivot ? e.Pivot : new Vector2Int(e.SourceSize.x / 2, e.SourceSize.y / 2);
            float fromLeft = cellPivot.x - e.Offset.x;
            float fromTop = cellPivot.y - e.Offset.y;
            var wantPivot = new Vector2(fromLeft, e.Region.height - fromTop); // Sprite.pivot counts from the rect's bottom-left
            if ((s.pivot - wantPivot).magnitude > 0.001f)
                failures.Add("MISMATCH " + fw + ": sprite pivot expected " + wantPivot + " from the bottom-left (" + fromLeft + ", " + fromTop + " from the top-left), got " + s.pivot);
            if (s.texture != texture) failures.Add("MISMATCH " + fw + ": sprite does not use the sheet texture");
        }

        CheckPlayback(where, tag, atlas, clip, failures);
    }

    // Plays the clip through time and compares which frame is showing, including the wrap or the hold at the end.
    static void CheckPlayback(string where, ExpectedTag tag, LoadedAtlas atlas, AtlasClip clip, List<string> failures)
    {
        if (clip.Steps.Length == 0 || tag.Indices.Count == 0) return;
        var player = new FlipbookPlayer(atlas, clip);
        long start = 0;
        long total = 0;
        foreach (int d in tag.Durations) total += d;
        string problem = null;
        int problemFrame = tag.Indices[0];

        for (int k = 0; k < tag.Indices.Count && problem == null; k++)
        {
            long end = start + tag.Durations[k];
            foreach (long t in new[] { start, end - 1 })
            {
                player.Seek(t);
                if (player.FrameIndex != tag.Indices[k] || player.Sprite != atlas.Frames[tag.Indices[k]].Sprite || player.Finished)
                {
                    problem = "at " + t + " ms the player shows frame " + player.FrameIndex + (player.Finished ? " (finished)" : "") + ", expected frame " + tag.Indices[k];
                    problemFrame = tag.Indices[k];
                    break;
                }
            }
            start = end;
        }

        int last = tag.Indices.Count - 1;
        if (problem == null)
        {
            if (tag.Loop)
            {
                player.Seek(total);
                if (player.FrameIndex != tag.Indices[0] || player.Finished) { problem = "at " + total + " ms a looping tag should wrap to frame " + tag.Indices[0] + ", shows " + player.FrameIndex; problemFrame = tag.Indices[0]; }
                player.Seek(total * 3 + total - 1);
                if (problem == null && (player.FrameIndex != tag.Indices[last] || player.Finished)) { problem = "late in a looping tag the player shows frame " + player.FrameIndex + ", expected " + tag.Indices[last]; problemFrame = tag.Indices[last]; }
            }
            else
            {
                foreach (long t in new[] { total, total + 1, total * 50 + 7 })
                {
                    player.Seek(t);
                    if (player.FrameIndex != tag.Indices[last] || !player.Finished)
                    {
                        problem = "at " + t + " ms a loop-false tag should hold frame " + tag.Indices[last] + " and be finished, shows " + player.FrameIndex + (player.Finished ? "" : " (not finished)");
                        problemFrame = tag.Indices[last];
                        break;
                    }
                }
            }
        }
        if (problem != null) failures.Add("MISMATCH " + where + " frame=" + problemFrame + ": " + problem);
    }

    // The case the spec names: trimmed fixture, frame 3.
    static void CheckTrimmedFrame3(LoadedAtlas atlas, List<string> failures)
    {
        AtlasFrameData f = atlas.Frames[3];
        Sprite s = f.Sprite;
        Log("trimmed frame 3: offset " + f.Offset + ", source size " + f.SourceSize.x + "x" + f.SourceSize.y + ", cell pivot " + f.Pivot +
            " (from the top-left of the untrimmed cell), region " + f.Region + ", sprite rect " + s.rect + " (y flipped), sprite.pivot " + s.pivot +
            " from the rect's bottom-left, which is (15, 21) from the top-left of the 30x22 box");
        string where = "fixture=trimmed tag=sweep frame=3";
        if (f.Offset != new Vector2Int(1, 1)) failures.Add("MISMATCH " + where + ": offset should be (1, 1), is " + f.Offset);
        if (f.SourceSize != new Vector2Int(32, 24)) failures.Add("MISMATCH " + where + ": source size should be 32x24, is " + f.SourceSize);
        if (f.Pivot != new Vector2Int(16, 22)) failures.Add("MISMATCH " + where + ": cell pivot should be (16, 22), is " + f.Pivot);
        if ((s.pivot - new Vector2(15f, 1f)).magnitude > 0.001f) failures.Add("MISMATCH " + where + ": sprite.pivot should be (15, 1) from the bottom-left, is " + s.pivot);
        if (s.rect.size != new Vector2(30f, 22f)) failures.Add("MISMATCH " + where + ": sprite size should be 30x22, is " + s.rect.size);
    }

    // The import settings, applied by AtlasTextureImport: copy the pair into the project, import it, read the result.
    static void CheckImportSettings(string fixture, string folder, List<string> failures)
    {
        const string scratch = "Assets/AtlasCheckTemp";
        string dir = scratch + "/" + fixture;
        try
        {
            if (AssetDatabase.IsValidFolder(scratch)) AssetDatabase.DeleteAsset(scratch);
            Directory.CreateDirectory(Path.Combine(Application.dataPath, "AtlasCheckTemp", fixture));
            foreach (string file in new[] { fixture + ".png", fixture + ".atlas.json" })
                File.Copy(Path.Combine(folder, file), Path.Combine(Application.dataPath, "AtlasCheckTemp", fixture, file), true);
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);

            string path = dir + "/" + fixture + ".png";
            var importer = AssetImporter.GetAtPath(path) as TextureImporter;
            if (importer == null) { failures.Add("MISMATCH fixture=" + fixture + ": the PNG did not import as a texture"); return; }
            var texture = AssetDatabase.LoadAssetAtPath<Texture2D>(path);
            var meta = MiniJson.Obj(MiniJson.Field(MiniJson.Obj(MiniJson.Parse(File.ReadAllText(Path.Combine(folder, fixture + ".atlas.json"))), "atlas"), "meta", "atlas"), "meta");
            var size = MiniJson.Obj(MiniJson.Field(meta, "size", "meta"), "meta.size");
            int w = MiniJson.Int(MiniJson.Field(size, "w", "size"), "w"), h = MiniJson.Int(MiniJson.Field(size, "h", "size"), "h");

            string problem = null;
            if (importer.filterMode != FilterMode.Point) problem = "filter mode " + importer.filterMode;
            else if (importer.textureCompression != TextureImporterCompression.Uncompressed) problem = "compression " + importer.textureCompression;
            else if (importer.npotScale != TextureImporterNPOTScale.None) problem = "NPOT scale " + importer.npotScale;
            else if (importer.mipmapEnabled) problem = "mipmaps on";
            else if (texture == null || texture.width != w || texture.height != h) problem = "imported size " + (texture == null ? "none" : texture.width + "x" + texture.height) + ", sheet is " + w + "x" + h;
            if (problem != null) failures.Add("MISMATCH fixture=" + fixture + ": import settings: " + problem);
            else Log("fixture " + fixture + " import settings: point filtering, uncompressed, NPOT scale None, " + w + "x" + h + " kept: ok");
        }
        finally
        {
            AssetDatabase.DeleteAsset(scratch);
            string leftover = Path.Combine(Application.dataPath, "AtlasCheckTemp");
            if (Directory.Exists(leftover)) Directory.Delete(leftover, true);
            if (File.Exists(leftover + ".meta")) File.Delete(leftover + ".meta");
        }
    }

    static List<ExpectedTag> ReadExpected(string path)
    {
        var root = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(path)), "expected.json");
        var result = new List<ExpectedTag>();
        foreach (object tagValue in MiniJson.Arr(MiniJson.Field(root, "tags", "expected.json"), "tags"))
        {
            var t = MiniJson.Obj(tagValue, "a tag");
            var tag = new ExpectedTag
            {
                Name = MiniJson.Str(MiniJson.Field(t, "name", "a tag"), "name"),
                Direction = MiniJson.Str(MiniJson.Field(t, "direction", "a tag"), "direction"),
                DurationMs = MiniJson.Int(MiniJson.Field(t, "durationMs", "a tag"), "durationMs"),
            };
            object loop = MiniJson.Field(t, "loop", tag.Name);
            if (!(loop is bool)) throw new FormatException(tag.Name + ".loop must be a boolean");
            tag.Loop = (bool)loop;
            foreach (object stepValue in MiniJson.Arr(MiniJson.Field(t, "steps", tag.Name), "steps"))
            {
                var step = MiniJson.Obj(stepValue, "a step");
                tag.Indices.Add(MiniJson.Int(MiniJson.Field(step, "index", "a step"), "index"));
                tag.Durations.Add(MiniJson.Int(MiniJson.Field(step, "duration", "a step"), "duration"));
            }
            foreach (KeyValuePair<string, object> entry in MiniJson.Obj(MiniJson.Field(t, "frames", tag.Name), "frames"))
            {
                var f = MiniJson.Obj(entry.Value, "frame " + entry.Key);
                var frame = new ExpectedFrame
                {
                    Region = Rect4(MiniJson.Field(f, "frame", "frame " + entry.Key), "frame"),
                    SourceSize = new Vector2Int(
                        MiniJson.Int(MiniJson.Field(MiniJson.Obj(MiniJson.Field(f, "sourceSize", "frame " + entry.Key), "sourceSize"), "w", "sourceSize"), "w"),
                        MiniJson.Int(MiniJson.Field(MiniJson.Obj(MiniJson.Field(f, "sourceSize", "frame " + entry.Key), "sourceSize"), "h", "sourceSize"), "h")),
                };
                var o = MiniJson.Obj(MiniJson.Field(f, "offset", "frame " + entry.Key), "offset");
                frame.Offset = new Vector2Int(MiniJson.Int(MiniJson.Field(o, "x", "offset"), "x"), MiniJson.Int(MiniJson.Field(o, "y", "offset"), "y"));
                object pv = MiniJson.Field(f, "pivot", "frame " + entry.Key);
                if (pv != null)
                {
                    var p = MiniJson.Obj(pv, "pivot");
                    frame.HasPivot = true;
                    frame.Pivot = new Vector2Int(MiniJson.Int(MiniJson.Field(p, "x", "pivot"), "x"), MiniJson.Int(MiniJson.Field(p, "y", "pivot"), "y"));
                }
                tag.Frames[int.Parse(entry.Key, CultureInfo.InvariantCulture)] = frame;
            }
            result.Add(tag);
        }
        return result;
    }

    static RectInt Rect4(object value, string what)
    {
        var o = MiniJson.Obj(value, what);
        return new RectInt(MiniJson.Int(MiniJson.Field(o, "x", what), "x"), MiniJson.Int(MiniJson.Field(o, "y", what), "y"),
            MiniJson.Int(MiniJson.Field(o, "w", what), "w"), MiniJson.Int(MiniJson.Field(o, "h", what), "h"));
    }
}
