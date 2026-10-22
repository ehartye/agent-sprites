import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  createReadStream,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, createGunzip } from "node:zlib";
import { resolveRuntime } from "../../scripts/managed-runtime.js";
import { rasterShape } from "../../server/web/public/js/shared/raster.js";
import { catParts } from "./art.mjs";
import { playTimeline, groomTimeline } from "./timeline.mjs";
const here = dirname(fileURLToPath(import.meta.url)),
  root = resolve(here, "../.."),
  runtime = resolveRuntime(root),
  require = createRequire(join(runtime.root, "package.json")),
  { createCanvas, loadImage } = require("canvas");
const read = (p) => JSON.parse(readFileSync(p, "utf8")),
  hash = (b) => createHash("sha256").update(b).digest("hex");
const coverage = (shapes) => {
  const out = new Set(),
    px = (x, y) => out.add(`${x},${y}`);
  for (const shape of shapes)
    rasterShape(shape.type, shape.params, {
      px,
      rect: (x, y, w, h) => {
        for (let yy = y; yy < y + h; yy++)
          for (let xx = x; xx < x + w; xx++) px(xx, yy);
      },
    });
  return out;
};
const pixels = async (path) => {
  const im = await loadImage(path),
    canvas = createCanvas(im.width, im.height),
    ctx = canvas.getContext("2d");
  ctx.drawImage(im, 0, 0);
  return {
    width: im.width,
    height: im.height,
    data: ctx.getImageData(0, 0, im.width, im.height).data,
  };
};
async function inspect(clip, poses) {
  const folder = join(root, "site/assets/cozy-cat-detail", clip),
    manifest = read(join(folder, "manifest.json")),
    atlas = read(join(folder, "atlas.json")),
    normal = read(join(folder, "normal.atlas.json")),
    proof = read(join(folder, "proof.json"));
  assert.equal(manifest.sourceFrames, poses.length);
  assert.equal(manifest.width, 384);
  assert.equal(manifest.height, 256);
  assert.equal(manifest.frameDurationMs, 50);
  assert.deepEqual(atlas.frames, normal.frames);
  assert.deepEqual(atlas.meta.frameTags, normal.meta.frameTags);
  assert.deepEqual(atlas.meta.slices, normal.meta.slices);
  const tag = atlas.meta.frameTags.find((t) => t.name === manifest.tag),
    frames = atlas.frames.slice(tag.from, tag.to + 1);
  assert.equal(frames.length, poses.length);
  assert(frames.every((f) => f.duration === 50));
  assert.equal(tag.loop, true);
  for (const [name, identity] of Object.entries(manifest.integrity)) {
    const bytes = readFileSync(join(folder, name));
    assert.equal(bytes.length, identity.bytes, name);
    assert.equal(hash(bytes), identity.sha256, name);
  }
  for (const input of manifest.sourceInputs) {
    const bytes = readFileSync(resolve(here, input.path));
    assert.equal(
      hash(bytes.toString("utf8").replace(/\r\n?/g, "\n")),
      input.normalizedTextSha256,
      input.path,
    );
    if (hash(bytes) === input.sha256) assert.equal(bytes.length, input.bytes);
  }
  for (const input of manifest.generatedBuildInputs) {
    assert.equal(input.committed, false);
    if (existsSync(join(here, input.path)))
      assert.equal(hash(readFileSync(join(here, input.path))), input.sha256);
  }
  const archive = readFileSync(join(folder, manifest.editableProject.file));
  const nativeHash = createHash("sha256");
  let nativeBytes = 0,
    tail = "";
  for await (const bytes of createReadStream(
    join(folder, manifest.editableProject.file),
  ).pipe(createGunzip())) {
    nativeBytes += bytes.length;
    nativeHash.update(bytes);
    const text = tail + bytes.toString("utf8");
    assert(
      !/[A-Za-z]:[\\/]|\/Users\/|\/home\//.test(text),
      "project contains a machine path",
    );
    tail = text.slice(-128);
  }
  const nativeSha256 = nativeHash.digest("hex");
  assert.equal(nativeSha256, manifest.editableProject.uncompressedSha256);
  assert.equal(nativeBytes, manifest.editableProject.uncompressedBytes);
  let minShapes = Infinity,
    maxShapes = 0,
    normalModes = new Set(),
    modeledShapes = 0;
  let partFrameCount = 0;
  for (const part of manifest.editableParts) {
    assert.equal(part.from, partFrameCount);
    assert.equal(part.loop, false);
    const unpacked = gunzipSync(readFileSync(join(folder, part.file)));
    assert(unpacked.length < 64 * 1024 * 1024);
    assert.equal(hash(unpacked), part.uncompressedSha256);
    const project = JSON.parse(unpacked);
    assert.equal(Object.keys(project.cells).length, part.frameCount);
    assert.equal(project.animationLoops[part.tag], false);
    assert.equal(project.groups[part.tag].length, part.frameCount);
    assert.deepEqual(project.pivot, { x: 0, y: 0 });
    assert(!project.constructionReplay);
    let shapes = 0;
    for (const cell of Object.values(project.cells)) {
      assert(cell.lighting);
      assert.equal(
        new Set(cell.shapes.map((s) => s.name)).size,
        cell.shapes.length,
      );
      assert.equal(
        cell.shapes.filter((s) => s.params.surface?.lamps?.length).length,
        1,
      );
      minShapes = Math.min(minShapes, cell.shapes.length);
      maxShapes = Math.max(maxShapes, cell.shapes.length);
      shapes += cell.shapes.length;
      for (const s of cell.shapes) {
        assert(s.params.layers?.length >= 2);
        if (s.params.surface?.normal) {
          normalModes.add(s.params.surface.normal.mode);
          if (s.params.surface.normal.mode !== "flat") modeledShapes++;
        }
      }
    }
    assert(shapes <= 200_000);
    assert.equal(shapes, part.shapeCount);
    partFrameCount += part.frameCount;
  }
  assert.equal(partFrameCount, poses.length);
  const color = await pixels(join(folder, "sheet.png")),
    norm = await pixels(join(folder, "normal.png"));
  assert.equal(color.width, norm.width);
  assert.equal(color.height, norm.height);
  let modeledNormalPixels = 0;
  for (let i = 3; i < color.data.length; i += 4) {
    assert.equal(color.data[i], 255);
    assert.equal(norm.data[i], color.data[i]);
    if (
      norm.data[i - 3] !== 128 ||
      norm.data[i - 2] !== 128 ||
      norm.data[i - 1] !== 255
    )
      modeledNormalPixels++;
  }
  assert(modeledNormalPixels > 10000);
  const at = (f, x, y) => ((f.y + y) * color.width + f.x + x) * 4;
  let seamDifferences = 0,
    normalSeamDifferences = 0;
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 384; x++) {
      const a = at(frames[0].frame, x, y),
        b = at(frames.at(-1).frame, x, y);
      if ([0, 1, 2, 3].some((c) => color.data[a + c] !== color.data[b + c]))
        seamDifferences++;
      if ([0, 1, 2, 3].some((c) => norm.data[a + c] !== norm.data[b + c]))
        normalSeamDifferences++;
    }
  assert.equal(seamDifferences, 0);
  assert.equal(normalSeamDifferences, 0);
  let torsoLeak = 0,
    headLeak = 0,
    tailLeak = 0,
    croppedCatPixels = 0;
  const counts = [];
  for (const p of poses) {
    const cat = catParts(p),
      shapes = cat.shapes,
      base = (name) => coverage(shapes.filter((s) => s.name === name)),
      outside = (mask, test) =>
        [...coverage(shapes.filter((s) => test(s.name)))].filter(
          (k) => !mask.has(k),
        ).length;
    torsoLeak += outside(base("body-base-fur"), (n) =>
      /^body-(clipped-tabby|tabby-warm-edge)-/.test(n),
    );
    headLeak += outside(base("rounded-head-fur"), (n) =>
      /^(forehead-contained-mark|cheek-contained-stripe)-/.test(n),
    );
    tailLeak += outside(base("tail-dark-edge"), (n) =>
      n.startsWith("tail-contained-ring-"),
    );
    croppedCatPixels += [...coverage(shapes)].filter((k) => {
      const [x, y] = k.split(",").map(Number);
      return x < 0 || x >= 384 || y < 0 || y >= 256;
    }).length;
    counts.push(shapes.length);
  }
  assert.equal(torsoLeak, 0);
  assert.equal(headLeak, 0);
  assert.equal(tailLeak, 0);
  assert.equal(croppedCatPixels, 0);
  const maxBodyStep = Math.max(
      ...poses
        .slice(1)
        .map((p, i) => Math.hypot(p.x - poses[i].x, p.y - poses[i].y)),
    ),
    maxBallStep = Math.max(
      ...poses
        .slice(1)
        .map((p, i) =>
          Math.hypot(p.ball.x - poses[i].ball.x, p.ball.y - poses[i].ball.y),
        ),
    );
  assert(maxBodyStep < 10);
  assert(maxBallStep < 7);
  assert.equal(proof.ok, true);
  assert.equal(proof.frameCount, poses.length);
  assert.equal(proof.gif.pages, poses.length);
  assert.equal(proof.durationMs, poses.length * 50);
  assert.equal(proof.gif.driftMs, 0);
  assert.deepEqual(proof.gif.delaysMs, Array(poses.length).fill(50));
  for (const input of proof.provenance.inputs) {
    const bytes = readFileSync(join(folder, input.path));
    assert.equal(hash(bytes), input.sha256);
  }
  const lickContacts =
    clip === "groom"
      ? [29, 40, 51, 62].map((frame) => {
          const { lick, shapes } = catParts(poses[frame]),
            tongue = coverage(
              shapes.filter((s) => s.name === "visible-licking-tongue"),
            ),
            paw = coverage(
              shapes.filter((s) => s.name.startsWith("raised-near-fore-paw")),
            ),
            overlapPixels = [...tongue].filter((k) => paw.has(k)).length;
          assert(overlapPixels > 0, `tongue misses paw at ${frame}`);
          return {
            frame,
            edgeDistance: Math.hypot(
              lick.tongueTip[0] - lick.innerPawEdge[0],
              lick.tongueTip[1] - lick.innerPawEdge[1],
            ),
            overlapPixels,
          };
        })
      : [];
  return {
    clip,
    ok: true,
    native: {
      width: 384,
      height: 256,
      frames: poses.length,
      frameDurationMs: 50,
      durationMs: poses.length * 50,
    },
    minShapes,
    maxShapes,
    catShapeRange: [Math.min(...counts), Math.max(...counts)],
    normalModes: [...normalModes],
    modeledShapes,
    modeledNormalPixels,
    pairedAlphaPixels: color.width * color.height,
    containment: { torsoLeak, headLeak, tailLeak, croppedCatPixels },
    seamDifferences,
    normalSeamDifferences,
    maxBodyStep,
    maxBallStep,
    lickContacts,
    project: {
      compressedBytes: archive.length,
      nativeBytes,
      sha256: nativeSha256,
    },
    gif: proof.gif.pixelComparison,
  };
}
const selected = process.argv[2],
  results = [];
if (!selected || selected === "play")
  results.push(await inspect("play", playTimeline));
if (!selected || selected === "groom")
  results.push(await inspect("groom", groomTimeline));
const result = {
  ok: true,
  clips: results,
  artDirection: {
    head: "66×58 native pixels before ears and cheek tufts",
    torso:
      "86×58 native pixels in standing pose, deformed for curl/stretch/sit",
    referenceFidelity:
      "Clean, grouped pixel illustration; generated reference guides feline face, wicker, quilt, color and light. Painterly microfur is not claimed.",
  },
};
writeFileSync(
  join(here, `.raw-check${selected ? `-${selected}` : ""}.json`),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
