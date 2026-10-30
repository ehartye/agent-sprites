using UnityEngine;

// Plays one AtlasClip. It owns no Unity objects, so a check can drive it without a scene: Seek puts it at a time, and
// Advance moves it on. A looping clip wraps; a clip with loop false plays once and then holds its last frame.
public sealed class FlipbookPlayer
{
    readonly AtlasClip clip;
    readonly LoadedAtlas atlas;
    readonly long[] endsMs;

    public FlipbookPlayer(LoadedAtlas atlas, AtlasClip clip)
    {
        this.atlas = atlas;
        this.clip = clip;
        endsMs = new long[clip.Steps.Length];
        long total = 0;
        for (int i = 0; i < endsMs.Length; i++) { total += clip.Steps[i].DurationMs; endsMs[i] = total; }
        Seek(0);
    }

    public AtlasClip Clip { get { return clip; } }
    public long ElapsedMs { get; private set; }
    public int StepIndex { get; private set; }                       // position in clip.Steps
    public int FrameIndex { get { return clip.Steps[StepIndex].Index; } } // index into the atlas "frames" array
    public Sprite Sprite { get { return atlas.Frames[FrameIndex].Sprite; } }
    public bool Finished { get; private set; }                        // true once a non-looping clip has held its last frame

    public void Seek(long elapsedMs)
    {
        ElapsedMs = elapsedMs < 0 ? 0 : elapsedMs;
        long total = endsMs[endsMs.Length - 1];
        long t = ElapsedMs;
        Finished = false;
        if (clip.Loop) t %= total;
        else if (t >= total) { StepIndex = endsMs.Length - 1; Finished = true; return; }
        int i = 0;
        while (endsMs[i] <= t) i++;
        StepIndex = i;
    }

    public void Advance(float deltaMs) { Seek(ElapsedMs + (long)deltaMs); }
}

// A game-side wrapper: put it on a GameObject with a SpriteRenderer, call Load once, then Play a tag by name.
[RequireComponent(typeof(SpriteRenderer))]
public class Flipbook : MonoBehaviour
{
    public float pixelsPerUnit = 100f;

    public LoadedAtlas Atlas { get; private set; }
    public FlipbookPlayer Player { get; private set; }

    SpriteRenderer spriteRenderer;
    float carryMs;

    // atlasJson is the text of the .atlas.json file; the texture must be point filtered and uncompressed.
    public void Load(Texture2D texture, string atlasJson)
    {
        Atlas = AtlasLoader.Load(texture, atlasJson, pixelsPerUnit);
    }

    public void Play(string tag)
    {
        Player = new FlipbookPlayer(Atlas, Atlas.GetClip(tag));
        carryMs = 0f;
        Show();
    }

    void Update()
    {
        if (Player == null) return;
        // keep the fraction of a millisecond between frames so a long run does not drift
        carryMs += Time.deltaTime * 1000f;
        int whole = (int)carryMs;
        carryMs -= whole;
        if (whole > 0) Player.Advance(whole);
        Show();
    }

    void Show()
    {
        if (spriteRenderer == null) spriteRenderer = GetComponent<SpriteRenderer>();
        spriteRenderer.sprite = Player.Sprite;
    }
}
