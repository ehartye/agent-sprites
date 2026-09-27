# Clothing and hair rules for the native template

## Reference observations

Reviewed local Downloads `77318.png` and `77329.png`: the small gameplay sprites show short swept hair with jackets, and tied hair with dresses and alternate outfits. The large portraits are expression references, not the pixel grid for this builder. Small sprites use clustered hair highlights, darker lower/rear hair, visible collars, compact sleeves, belts/hems and distinct footwear. The examples here are original simplified wardrobe studies, not copies of those characters.

## Fixed construction contract

| Landmark | Adult | Child |
|---|---|---|
| Cell | 16×32 | 16×32 |
| Bare head | x=3..12, crown y=2 | x=3..12, crown y=8 |
| Hair allowance in these examples | x=2..13, crown y=1 | x=2..13, crown y=7 |
| First front eye row | y=8 | y=14 |
| Shoulder row | y=15 | y=20 |
| Belt row | y=21 | y=24 |
| Soles | y=29 | y=29 |

The ten-pixel constraint describes the bare head. Hair may add one pixel on each side and above; a profile knot extends to x=1. Keep those additions explicit. Do not resize the body to accommodate clothing. Child garments need shorter sleeves and their own waist/hem placement; do not shrink an adult sprite.

## Hair

- Separate the scalp cap, front fringe, profile side mass and rear tie logically. Use a few connected color clusters, with upper-left light and darker lower/right planes.
- Stop the front fringe before the first eye row. Preserve every sampled eye pixel unless deliberate occlusion is part of the design. A right view exposes the eye on screen-right; the hair mass belongs behind it on screen-left.
- Make the rear a full cap without facial pixels. Carry the same palette, crown and length across directions; show the tie in back and profile, not pasted onto the forehead.
- Use a material-specific dark outline. Every newly exposed contour must be opaque and continuous. Do not use smoothing, fractional positions or image resizing.

## Clothing

- Fit shoulders and sleeves to the existing body; leave hands visible. Begin the collar below the chin. Keep the front opening on the front only and resolve the near sleeve separately in profile.
- Preserve waist height across directions. Keep garment fill, trim and shoes in separate named groups with highlight/base/shadow/outline roles.
- Jackets require trousers below the hem; dresses replace the lower silhouette with a skirt. A hem may widen the body but must fit the cell and leave the ground unchanged.
- Use restrained material ramps: four colors per material, shared between directions. Prefer readable shoulder, opening, belt and hem clusters to individual decorative pixels. Add accessories only after the standing study reads at 1×.

## Editable layer and palette contract

Keep the original body points underneath overlays. Clothing/hair points must never enter `skin-*` groups. Their draw order covers the body where required; exposed body points retain their skin roles. This makes skin selection independent of wardrobe colors and keeps the base recoverable. These examples use foreground overlays; future long hair, capes or equipment behind limbs need an explicit rear layer rather than this shortcut.

Point names include direction, material and coordinates. Each material also has role subgroups, for example `hair`, `hair-highlight`, `cloth-shadow`, `trim`, `trousers` and `shoes`. The example generator supplies two complete presets, not arbitrary swappable hair/outfit controls. To make a new preset, edit the source masks/palettes and rebuild. Save workbench edits to a new source before rebuilding, since builds replace `dist`.

## Acceptance checks

Build every authored direction and inspect both native pixels and a nearest-neighbor enlargement. Check eyes remain visible, neckline meets the head, hands remain distinguishable, rear clothing has no front opening, shoes meet y=29, and no material boundary makes an outline gap. Change skin tone and confirm garment/hair colors stay fixed. These are standing front/right/back studies: they do not establish left-facing art, walking animation, portrait fidelity or a complete customization UI.
