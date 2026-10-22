import assert from "node:assert/strict";
import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { resolve, join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMANDS } from "../server/commands/catalog.js";
import { features, scenes, examples } from "./feature-guide.mjs";
import { readExampleArtifacts } from "./example-artifacts.mjs";
import { TESSEL_ACTIONS, tesselSequence } from "./tessel-data.js";
import {
  atlasFrames,
  orderedFrames,
  frameIndexAt,
  requestExample,
} from "./model.js";

const root = fileURLToPath(new URL("..", import.meta.url)),
  dist = join(root, "site/dist");
const read = (p) => readFileSync(p, "utf8"),
  json = (p) => JSON.parse(read(p));
const hash = (b) => createHash("sha256").update(b).digest("hex");
const fixture = mkdtempSync(join(tmpdir(), "sprites-site-refresh-"));
try {
  const example = { name: "sample" };
  assert.throws(() => readExampleArtifacts(fixture, example), /sample\.png/);
  writeFileSync(join(fixture, "sample.png"), "pixels");
  assert.throws(
    () => readExampleArtifacts(fixture, example),
    /sample\.atlas\.json/,
  );
  writeFileSync(join(fixture, "sample.atlas.json"), "{}");
  assert.throws(
    () => readExampleArtifacts(fixture, example),
    /sample\.project\.json/,
  );
  assert.equal(
    readExampleArtifacts(fixture, { ...example, omitProject: true }).length,
    2,
  );
  writeFileSync(join(fixture, "sample.project.json"), "{}");
  assert.equal(readExampleArtifacts(fixture, example).length, 3);
} finally {
  assert.equal(dirname(resolve(fixture)), resolve(tmpdir()));
  assert(basename(fixture).startsWith("sprites-site-refresh-"));
  rmSync(fixture, { recursive: true, force: true });
}
const coverage = json(join(dist, "coverage.json"));
for (const folder of [".build", ".reviews"])
  assert(
    !existsSync(join(dist, "source/examples/showcase", folder)),
    `Local-only source leaked: ${folder}`,
  );
assert.equal(features.length, 8);
assert.equal(new Set(features.map((f) => f.id)).size, 8);
assert.deepEqual(
  coverage.commands,
  COMMANDS.map((c) => c.id),
);
assert.deepEqual([...coverage.sourceKinds].sort(), [
  "animation",
  "character",
  "creature",
  "environment",
  "generator",
  "native",
  "ops",
  "tileset",
  "ui",
]);
assert.deepEqual(json(join(dist, "commands.json")), COMMANDS);
// Exact half-open timing boundaries, nonloop holds and reversed/ping-pong order.
const frames = [{ duration: 75 }, { duration: 125 }, { duration: 200 }];
assert.deepEqual(
  [0, 74, 75, 199, 200, 399, 400].map((t) => frameIndexAt(frames, t)),
  [0, 0, 1, 1, 2, 2, 0],
);
assert.equal(frameIndexAt(frames, 500, false), 2);
assert.deepEqual(orderedFrames([0, 1, 2], "pingpong_reverse"), [2, 1, 0, 1]);
assert.throws(() => frameIndexAt([{ duration: 0 }], 0), /Invalid atlas timing/);
const get = requestExample(COMMANDS.find((c) => c.id === "shapes"));
assert.match(get, /^GET http:\/\/localhost:3000\/api\/shapes\?cell=0%2C0$/);
assert(!get.includes("Content-Type"));
const post = requestExample(COMMANDS.find((c) => c.id === "draw rect"));
assert.match(post, /^POST /);
assert.match(post, /"shape_name": "rect"/);

let total = 0,
  files = 0;
function walk(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    assert(
      !entry.isSymbolicLink(),
      `Symbolic link in deployment: ${entry.name}`,
    );
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      walk(path);
      continue;
    }
    files++;
    total += statSync(path).size;
    if (/\.(js|mjs|json|html|css|md|txt)$/.test(entry.name)) {
      const text = read(path),
        normalized = text.replace(/\\\\/g, "\\");
      assert(
        !/[A-Z]:[\\/]Users[\\/]|file:\/\/\/|\.wiki-master-vault|\.codex[\\/]work/i.test(
          normalized,
        ),
        `Machine path in ${path}`,
      );
      // Source excerpts are for a repository clone, not browser-executable standalone bundles.
      if (
        !path.startsWith(join(dist, "source")) &&
        /\.(js|mjs)$/.test(entry.name)
      )
        for (const match of text.matchAll(
          /(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g,
        ))
          assert(
            existsSync(resolve(dirname(path), match[1])),
            `Missing runtime module ${match[1]} in ${path}`,
          );
    }
  }
}
walk(dist);
for (const p of [
  "server/web/public/js/cell-raster.js",
  "server/web/public/js/erase-layer.js",
  "server/web/public/js/shared/raster.js",
  "server/web/public/js/shared/surface-raster.js",
  "server/web/public/js/shared/timing.js",
  "server/engine/composition.js",
  "server/build/ui-runtime.mjs",
])
  assert.equal(
    hash(readFileSync(join(root, p))),
    hash(readFileSync(join(dist, "runtime", p))),
    `Shared module fork: ${p}`,
  );
for (const e of examples) {
  const dir = join(dist, "assets/examples", e.id),
    a = json(join(dir, "atlas.json")),
    png = readFileSync(join(dir, a.meta.image)),
    w = png.readUInt32BE(16),
    h = png.readUInt32BE(20);
  for (const { frame: f, duration } of atlasFrames(a)) {
    assert(
      f.x >= 0 && f.y >= 0 && f.x + f.w <= w && f.y + f.h <= h,
      `Atlas bounds: ${e.id}`,
    );
    assert(Number.isSafeInteger(duration) && duration > 0);
  }
}
for (const s of scenes) {
  const dir = join(dist, "assets/scenes", s.id),
    a = json(join(dir, "atlas.json")),
    proof = json(join(dir, "proof.json")),
    tag = a.meta.frameTags.find((t) => t.name === "ambience");
  assert(tag, `Scene tag missing: ${s.id}`);
  const frames = atlasFrames(a).slice(tag.from, tag.to + 1);
  assert.equal(frames.length, 32);
  assert.equal(
    frames.reduce((s, f) => s + f.duration, 0),
    3200,
  );
  assert.equal(proof.ok, true);
  assert.equal(proof.frameCount, 32);
  assert.equal(proof.durationMs, 3200);
  assert.equal(proof.loop, true);
  for (const [name, receipt] of Object.entries(proof.integrity)) {
    const b = readFileSync(join(dir, name));
    assert.equal(
      hash(b),
      receipt.sha256,
      `Scene receipt mismatch: ${s.id}/${name}`,
    );
    assert.equal(b.length, receipt.bytes);
  }
  const gif = readFileSync(join(dir, "scene.gif"));
  assert.equal(gif.subarray(0, 6).toString(), "GIF89a");
  assert.equal(gif.readUInt16LE(6), 384);
  assert.equal(gif.readUInt16LE(8), 256);
  const project = json(join(dir, "project.json"));
  assert(
    Object.values(project.cells).some((c) => c.shapes.some((s) => s.name)),
    "Scene lacks named editable shapes",
  );
}
// The original character must retain real tag ranges: the atlas also contains
// static grid entries and named aliases, which are not additional poses.
{
  const dir = join(dist, "assets/tessel"),
    manifest = json(join(dir, "manifest.json")),
    color = json(join(dir, "atlas.json")),
    normal = json(join(dir, "normal.atlas.json")),
    project = json(join(dir, "project.json"));
  assert.equal(manifest.sourceCells, 128);
  assert.equal(Object.keys(project.cells).length, 128);
  assert.deepEqual(project.pivot, { x: 32, y: 55 });
  assert.deepEqual(color.frames, normal.frames);
  assert.deepEqual(color.meta.frameTags, normal.meta.frameTags);
  assert.deepEqual(color.meta.slices, normal.meta.slices);
  assert.equal(color.meta.frameTags.length, 16);
  for (const cell of Object.values(project.cells)) {
    assert.equal(cell.lighting.palettePolicy, "rgb");
    assert(
      cell.shapes.every((s) => s.name),
      "Unnamed character geometry",
    );
    assert(
      cell.shapes.some((s) => s.params?.surface),
      "Missing retained character surfaces",
    );
  }
  for (const action of TESSEL_ACTIONS) {
    const expected = manifest.actions.find((a) => a.id === action.id);
    for (const facing of ["right", "left"]) {
      const sequence = tesselSequence(color, action.id, facing);
      assert.equal(sequence.duration, action.duration);
      assert.equal(sequence.loop, action.loop);
      assert.deepEqual(
        sequence.frames.map((f) => f.duration),
        expected.holdsMs,
      );
      for (const frame of sequence.frames)
        assert.deepEqual(frame.sourceSize, { w: 64, h: 64 });
    }
    const proof = json(join(dir, "actions", action.id, "proof.json"));
    assert.equal(proof.ok, true);
    assert.equal(proof.frameCount, 8);
    assert.equal(proof.loop, action.loop);
    assert.equal(proof.gif.driftMs, 0);
    assert.deepEqual(proof.gif.delaysMs, expected.holdsMs);
    assert.equal(proof.gif.pixelComparison.exact, true);
  }
  assert.throws(
    () => tesselSequence(color, "missing", "right"),
    /Missing Tessel/,
  );
  for (const [name, receipt] of Object.entries(manifest.integrity)) {
    const bytes = readFileSync(join(dir, name));
    assert.equal(bytes.length, receipt.bytes, `Tessel size: ${name}`);
    assert.equal(hash(bytes), receipt.sha256, `Tessel digest: ${name}`);
  }
  for (const input of manifest.sourceInputs) {
    const bytes = readFileSync(join(root, "examples/tessel", input.path));
    // Raw hashes identify captured build bytes. A shared module may be checked
    // out with different line endings; only its explicit text identity may vary.
    if (hash(bytes) !== input.sha256)
      assert.equal(
        hash(Buffer.from(bytes.toString("utf8").replace(/\r\n?/g, "\n"))),
        input.normalizedTextSha256,
        `Tessel source drift: ${input.path}`,
      );
  }
  for (const folder of [".reviews", "proof-work"])
    assert(
      !existsSync(join(dist, "source/examples/tessel", folder)),
      `Local character review leaked: ${folder}`,
    );
}
for (const name of ["index.html", "tessel.html"]) {
  const html = read(join(dist, name));
  for (const match of html.matchAll(/(?:href|src)="(\.\/[^"#]+)(?:#[^"]*)?"/g))
    assert(
      existsSync(resolve(dist, match[1])),
      `Broken ${name} link ${match[1]}`,
    );
}
console.log(
  `PASS: 8 chapters; ${COMMANDS.length} exact catalog commands; 9 build sources; 4 editable 32-frame scene receipts; Tessel's 128 cells, 16 paired tags and 8 exact GIF receipts; timing, atlas bounds, shared-module identity, imports, links and public-path checks. ${files} static files, ${(total / 1024 / 1024).toFixed(1)} MiB.`,
);
