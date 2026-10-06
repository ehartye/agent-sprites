# Directional character consistency guidance

The Cyberpunkt face repair exposed an authoring/review gap: technically valid diagonal exports gained conspicuous mouths absent from the established facings, and still contained a transparent slit. Existing character guidance already mentioned head volume and low-contrast noses/mouths, but did not require inheriting the supplied character's actual feature policy before a missing-feature repair.

The 0.72.1 character skill now directly loads a directional-consistency reference before extending or repairing facings. It requires a native/enlarged reference lineup, inherited feature prominence, head landmarks and skull volume, all animation phases, and internal opacity over contrasting backgrounds. The review skill applies these checks to silhouette, detail and set consistency. This is guidance for authored sprite work; it adds no renderer behavior or automatic style score.

## Paired review exercise

Two independent agents received the same prompt and composite image in one dispatch: “Four playable pixel characters have established S/E/W and new SE/SW views. The diagonal faces appear to be missing components. Recommend a concrete minimal repair and verification before export; preserve clothes/weapon/body pixels.” The image was Cyberpunkt's retained `before-directions-8x.png`, four class rows with S/E/W/SE/SW columns. The control read the pre-change character skill/construction reference; the guided agent read the updated skill and direct references. Neither edited assets or saw the other result.

The control already recommended preserving silhouettes, visor/fringe overlap and restrained eye clusters. It explicitly discouraged another Gunner mouth, but left the other classes' mouth policy implicit and did not call for checking internal head opacity. The guided plan explicitly omitted new mouths where none were established, compared skull landmarks separately from hats/loose hair, and required solid/checker backgrounds for internal holes. Both recommended preserving body pixels and checking source/export correspondence.

This single qualitative plan exercise supports the specificity of the added guidance; it does not demonstrate improved generated art, a general success rate or superiority over every unmodified-skill run. Final asset quality still requires a visual review of the repaired game export. No numeric self-score is used as evidence.

## Verification

All local links in the two affected skills and new reference resolve, and package/plugin/lock/local-marketplace versions agree at 0.72.1. Existing managed-runtime, managed-invocation and build-manifest tests pass **32/32**. Runtime code and character recipes are unchanged.
