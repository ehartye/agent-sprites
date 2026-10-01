# Rubric: logos, wordmarks, titles and text

Contents: scope and confidence · dimensions · numbers worth testing · instruments · gates ·
reporting.

Use this with [sprite review](../SKILL.md) when the asset is lettering: a logo or wordmark, a
title or credits screen, in-world signage, UI labels, an app icon. Score each dimension 0 to
4 as usual. Confidence tags: **[exact]** is read from code or counted from pixels, **[wiki]**
is from sources the wiki holds (practitioner or standards guidance, not a pixel-art study),
**[thin]** is one source or an inference.

## Dimensions

| Dimension | Ask | Evidence |
| --------- | --- | -------- |
| Legibility at the smallest shown size | Can a reader get every word at the smallest size and screen it ships at? | the real smallest frame, phone width |
| Letterform integrity | Whole-pixel strokes, one stroke weight, no half-pixel blur, even rhythm between letters? | 8x crop, stroke-width list |
| Contrast | Text against its background, and against the busiest part behind it | WCAG ratio on exported colors |
| One-ink survival | Does the mark still read as a single flat color, and at 16x16? | silhouette fill, 16 px export |
| Fit to the world | Built from the kit (outline family, palette, rivets, chevrons) and the world's own shapes, not generic | palette table, lineup with a kit asset |
| Hierarchy and lockup | Title, tagline and UI text in clear integer size ratios, with clear space | the lockup at 1x and 2x |
| Scale ladder | Exports at 1x, 2x, 3x and icon sizes are pixel-exact, never fractional | draw scales from code |
| Copy | Spelling, length, voice; one idea per line | read it aloud |
| Motion (animated only) | Reveal timing, dwell time, a still frame that is complete, a reduced-motion version | frame capture, timing list |

## Numbers worth testing

- Use the game's own faces at integer scale. The regular face has 14 px capitals at 2x and
  the compact face 12 px; compact is for supporting text, not titles **[exact]**.
- Text a phone viewer must read: about 4% of frame height or more **[thin]** (wiki
  arithmetic from print-size research; broadcast subtitles use 7 to 8%, regulators floor
  fine print near 2.4% **[wiki]**).
- Contrast: 4.5:1 for body text, 3:1 for large text and for graphic marks **[wiki]** (WCAG
  2.2). Black on white or white on black read about the same; avoid red against green.
- Lines: at most about 30 characters and 3 lines at once; hold text at least 1 second per
  13 characters **[wiki]**.
- Titles stay inside about 90% of width and height **[wiki]** (broadcast title-safe area),
  and on a phone inside the notch and gesture areas.
- All caps slows reading; keep it for short labels, not sentences **[wiki]**.
- Sans or serif matters less than x-height and spacing **[wiki]**.

## Instruments

1. Export the lockup at 1x and render it at 2x and 3x with nearest neighbor; compare to the
   native 2x export byte for byte.
2. List every stroke width in the wordmark. More than one width is a finding unless it is a
   deliberate contrast.
3. Measure the gap between neighboring stems for a test string; large variance is uneven
   rhythm.
4. Fill the mark with one color and shrink it to 16 px.
5. Compute the contrast ratio for every text color against its worst background pixel.
6. Screenshot the smallest supported viewport and read it without zooming.

## Gates

Any fractional scale, body text under 4.5:1, text clipped by a safe area or screen edge, or a
mark that fails at 16 px when it is also the app icon, fails the asset regardless of average.

## Reporting

Say which size and screen each finding comes from. A logo is a judgment call after the gates:
report what is measurably wrong and leave "is it a good logo" to the owner.
