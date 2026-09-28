# Constructing a compact anime RPG character

## A starting grid

For a bespoke **32×48** study, try a center around x=16, soles at y=45,
and hair top around y=5. Begin with about 2.5–3 heads of visible height.
This is a proposed compact style, not a canonical ratio for any named game.
Keep margins for hair, hands and equipment. Change the ratios deliberately if
the user's reference is stockier, taller or intended for a smaller game scale.

| Landmark | Starting rows | What to preserve when turning |
|---|---|---|
| Hair/head envelope | 5–19 | Cranial volume; profile needs back-of-skull mass |
| Eye band | 13–16 | Height and expression; profile has one dominant visible eye |
| Chin/neck | 19–22 | Short connection under jaw, not a floating head |
| Shoulders/chest | 23–29 | Shoulder attachment and clothing width |
| Waist/pelvis | 30–34 | Connected hip volume beneath tunic |
| Knees/boots | 38–45 | Leg ownership, grounded soles, profile toe projection |

Use polygons to bevel the jaw, hair and shoulders rather than building a stack
of outlined rectangles. In silhouette, the neck, hands and gap between boots
must survive. Choose the outline thickness at source resolution, normally one
pixel here; do not infer it from an enlarged reference.

When the reference has a continuous dark outline, preserve that contour around
the entire final silhouette, including hair, ears, chin, hands, garment edges
and boot toes. Later fills can overwrite an otherwise correct backing shape.
Inspect after all layers are composed; inset the fill or restore a named contour
segment in its part group. Check at native size and enlarged on a contrasting
background. For this outline style, an opaque boundary pixel touching transparent
background should carry an outline tone, not exposed skin, cloth or highlight.
Do not apply selective broken outlines unless the reference or user calls for them.

## Children in the same cast

For a compact child design, keep a large cranium and readable eyes while
shortening the torso and limbs. Narrower shoulders, compact hands/boots
and a small chin can distinguish it from the adult. Compare these relationships
against the user's reference; do not shrink an adult bitmap or give every child
the same age.

For an initial younger-child study on the **same 32×48 canvas and y=45 ground**,
try a crown near y=13, chin near y=26, shoulders around y=29, pelvis around y=36
and short legs ending at the common baseline. Keep head width close to the
adult study rather than scaling all axes equally. These are proposed working
coordinates, not measured source pixels. Adjust an older child toward the adult
landmarks gradually: longer torso/legs and less dominant head, retaining the
family's eye, outline and shading language.

Draw the child beside the adult at 1×; check that age reads from silhouette
before relying on color or labels. Refit clothes to the shorter torso and limbs,
keeping cuffs/hands and hem/boots separate. Shorter stride and smaller arm swing
need their own keyed poses. The built-in recipe already exposes `child` and
`older-child`; use those when its 40×56 proportions fit, without claiming they
reproduce the supplied reference exactly.

## Full reference sheets

First map the sheet's asset families: gameplay sprites, dialogue portraits,
directions, outfit variants, expressions and action frames. Mixed sheets can
contain several grids and scales; do not divide the entire image evenly or
apply portrait-sized eyes and hair detail to a tiny walking sprite. Infer the
gameplay cell dimensions from repeated rows and margins, separately from portraits.

Compare the same character across front, profile and back and across clothing
changes. Record which features retain identity: hair silhouette/part, head width,
skin ramp, costume mass and signature accessories. A held object changes the arm
pose and occlusion; it is not just a prop pasted over an unchanged idle. Use the
full sheet to test consistency after a small study has established the design,
not as a reason to generate every outfit, portrait and action immediately.

## Face and hair

On a roughly 12–14px-wide front head, start eyes as 2–3px-wide clusters, with
space between them. A dark upper lid, small iris and optional one-pixel white
can suggest anime eyes without surrounding each eye in a black box. Check the
expression before adding catchlights, brows or mouth. If the face cannot afford
all these marks, omit lower-priority marks rather than enlarging every feature.
Keep the nose/mouth lower contrast than eyes. A tiny chin shadow separates the
head from the neck; a dark stripe across the entire face reads as a mask.

For a right profile, draw a new contour: rear skull, forehead, one-pixel nose
projection if useful, mouth/chin and neck. Place the visible eye toward the
front of the face, keep the ear behind it, and tuck the far eye out of view.
Do not compress the front face or leave two front-facing eyes in the profile.
Match crown, eye line and chin heights; preserve skull depth behind the ear.

Build hair as a rear mass, a cap and two or three distinctive fringe locks.
Use stepped connected clusters and one broad highlight following the volume.
Avoid a striped helmet, individual strand noise, or isolated highlights at
every boundary. Preserve the fringe/part as an identity cue across views.

## Color and material separation

Choose roles before exact hex values: outline, skin base/shadow/light, hair
base/light, cloth base/shadow/light, boots and accent. Start around 12–16 colors
for this study; the count is a working budget, not a platform limit. A dark
plum outline and warm skin with cooler shadows are useful starting choices,
not mandatory across all RPG characters.

Read [sprite palette](../../sprite-palette/SKILL.md) when choosing tool ramps.
Custom hex colors work with explicit named shadow/highlight shapes. Automatic
lighting stays in the palette only with registered ramps (other colors get HSL-derived
steps); do not alter the engine merely to shade a face.
Use broad shadow shapes under fringe/chin, inside far sleeve and between legs.
Keep highlights sparse on matte cloth and skin. Reserve sharp bright marks for
eyes or small metal hardware. Judge local contrast on each skin tone; blanket
darkening can erase the eyes and merge the outline with the face.

## Parts that can actually be reused

In a custom generator, separate palette/identity parameters from per-view
landmarks and drawing helpers. Suggested handles: `hair_back`, `hair_fringe`,
`face_base`, `eye_near`, `eye_far`, `torso`, `pelvis`, anatomical limb names,
`tunic`, `belt` and `boots`. Put optional parts behind explicit choices, so
omitting a cape also omits its shadows. Do not claim these are built-in API fields.

Draw rear hair/cape and far limbs first, then pelvis/near legs, torso/neck/head,
face, front hair and near arm/equipment as the pose requires. An up-facing view
changes occlusion; one global layer order is not correct for every direction.
Make recoloring material-aware: replacing every color in a group with one hex
flattens its ramp. Shape groups organize editable parts; cell groups define
animation sequences. They are not interchangeable. For multipart edits, create
shape groups for hair, face, clothing and each limb as needed, rather than only
one whole-character group. Keep individual material colors addressable inside them.

## Visual fault → first correction

| Visible fault | Inspect and correct |
|---|---|
| Staring doll or goggles | Reduce eye whites/black enclosure; adjust upper lids and eye spacing |
| Head looks pasted on | Check jaw/neck overlap and shoulder span before adding shading |
| Profile looks like another character | Align eye/chin/crown, preserve rear skull, repeat fringe and costume cues |
| Boxy paper-doll torso | Bevel shoulders, connect waist/pelvis, vary outer contour instead of adding seams |
| Muddy face or noisy clothes | Remove isolated pixels/tones; restore larger connected material clusters |
| Legs merge into a pillar | Separate boots and inner leg contour; keep far-leg shade readable |
| Mechanical walk | Revisit contact/passing silhouettes, opposite arm swing and support; extra bob is not a repair |

Review front/profile at 1× on a neutral background and at 4× nearest-neighbor.
Check a flat silhouette too. If the design only reads when enlarged, simplify
or allocate more pixels to the important feature before adding animation.
