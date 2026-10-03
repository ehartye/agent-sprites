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

These rows describe the idle/passing pose. Stride poses lower the head, shoulders, and waist by one pixel while soles remain at y=29. Read the actual head group to follow its bob; hands require pose-specific silhouettes rather than a fixed horizontal cutoff. The ten-pixel constraint describes the bare head. Hair may add one pixel on each side and above; a right-profile knot extends to x=1 (reflected on the left). Keep those additions explicit. Do not resize the body to accommodate clothing. Child garments need shorter sleeves and their own waist/hem placement; do not shrink an adult sprite.

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

Point names include direction, material and coordinates. Each material also has role subgroups, for example `hair`, `hair-highlight`, `cloth-shadow`, `trim`, `trousers` and `shoes`. The generator selects outfit and wig independently: jacket/dress with short/tied/none hair. Wig-only exports retain the same coordinates, all 20 frame aliases, four walk tags, and pivot as the body. The browser review page composes separate wig sheets over bare or hair-free clothed bodies; build configs select baked combinations. To make a new preset, edit the source masks/palettes and rebuild. Save workbench edits to a new source before rebuilding, since builds replace `dist`.

## Walking contract

- Preserve all four source front/right poses and retain the repeated passing frame at phases 0 and 2. Reflect the complete right-facing body and wardrobe for left; do not mirror only a sleeve or shoe.
- Derive each rear pose from its matching front silhouette and shift rear shading with its bob. Never carry facial pixels or a jacket opening onto the back.
- Fit sleeves to moving arms and exclude the hands before painting garments, trousers, or a skirt. Fixed y-based clothing bands alone can paint over a swinging hand.
- Front and rear contact poses follow the Stardew convention: the forward-swinging arm is foreshortened (three rows shorter for adults, two for children, hand tucked at the hip), the trailing arm stays full length with its hand visible, the foot on the same side as the short arm lifts one row, and the sides swap on the opposite contact. Passing poses keep both arms down.
- Attach hair to the current head landmark. Advance separate body and wig sheets with the same named frame. Keep their full cell size, tag order, 8 fps default, and bottom-center pivot aligned.
- Keep shoes on the source feet and all soles on y=29. Skirt motion must leave visible footwear and fit within 16×32.

## Acceptance checks

Build every authored direction and every walk frame; inspect native pixels, a nearest-neighbor enlargement, and looping playback. Check eyes remain visible, neckline meets the head, hands remain distinguishable, rear clothing has no front opening, shoes meet y=29, and no material boundary makes an outline gap. Change skin tone and confirm garment/hair colors stay fixed. Compare standalone wig composition with the baked outfit. These examples establish a repeatable four-direction wardrobe walk study; they do not establish portrait fidelity or a complete game customization UI.
