# Base and overlay atlas proof

Copy this directory into your project before running it. Resolve the matching
managed launcher from the loaded sprite skill as `<launcher>` below:

```text
node "<launcher>" build base-project.json --json
node "<launcher>" build overlay-project.json --json
node "<launcher>" atlas-proof proof.json --out review-01 --json
```

Run from the copied directory. The two builds emit editable projects, trimmed
PNGs and atlases. The body has four 125 ms frames, and the hat has three 100 ms
frames. Their complete joint period is 1500 ms. Both use the original 16×16
bottom-center pivot despite their different trim rectangles. The overlay paints
after the body. The proof reads those exported files, without changing a session.

Inspect every tile in `review-01/contact.png`, play `proof.gif`, and read
`proof.json` for decoded GIF timing, palette differences and source hashes. PNG
frames preserve canonical colors; GIF may quantize them. Change a source and
rebuild it, then use another new directory such as `review-02` for the next proof.
