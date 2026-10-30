using System.IO;
using UnityEditor;
using UnityEngine;

// Pixel art blurs under Unity's default texture import: bilinear filtering, compression, and a non-power-of-two sheet
// rescaled to a power of two. This sets the import by code for every PNG that sits next to a "<name>.atlas.json" file,
// the pair the agent-sprites atlas export writes, so copying the pair into Assets is enough.
public class AtlasTextureImport : AssetPostprocessor
{
    public static bool IsAtlasSheet(string assetPath)
    {
        if (!assetPath.EndsWith(".png", System.StringComparison.OrdinalIgnoreCase)) return false;
        string withoutExtension = assetPath.Substring(0, assetPath.Length - ".png".Length);
        return File.Exists(withoutExtension + ".atlas.json");
    }

    public static void Configure(TextureImporter importer)
    {
        importer.textureType = TextureImporterType.Default;
        importer.filterMode = FilterMode.Point;
        importer.textureCompression = TextureImporterCompression.Uncompressed;
        importer.npotScale = TextureImporterNPOTScale.None;
        importer.mipmapEnabled = false;
        importer.alphaIsTransparency = true;
        importer.wrapMode = TextureWrapMode.Clamp;
        importer.isReadable = false;
    }

    void OnPreprocessTexture()
    {
        if (IsAtlasSheet(assetPath)) Configure((TextureImporter)assetImporter);
    }
}
