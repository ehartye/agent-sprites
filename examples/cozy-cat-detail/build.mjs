import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { resolveRuntime } from "../../scripts/managed-runtime.js";
import {
  playTimeline,
  groomTimeline,
  playBeats,
  groomBeats,
} from "./timeline.mjs";
import { catParts, C } from "./art.mjs";
import { operationsFor } from "./generate.mjs";
import { editorParts, composedProof } from "./delivery.mjs";
const here = dirname(fileURLToPath(import.meta.url)),
  root = resolve(here, "../..");
const launcher = resolve(
    process.env.AGENT_SPRITES_LAUNCHER || join(root, "scripts/run-managed.js"),
  ),
  runtime = resolveRuntime(root);
const require = createRequire(join(runtime.root, "package.json")),
  { createCanvas, loadImage } = require("canvas"),
  sharp = require("sharp");
const read = (p) => JSON.parse(readFileSync(p, "utf8")),
  hash = (b) => createHash("sha256").update(b).digest("hex");
const write = (p, value) =>
  writeFileSync(p, JSON.stringify(value, null, 2) + "\n");
const run = (...args) => {
  const text = execFileSync(process.execPath, [launcher, ...args, "--json"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  const result = JSON.parse(text);
  if (result.ok === false) throw new Error(text);
  return result;
};
const walkFiles = (folder, prefix = "") =>
  readdirSync(folder, { withFileTypes: true }).flatMap((item) =>
    item.isDirectory()
      ? walkFiles(join(folder, item.name), `${prefix}${item.name}/`)
      : [`${prefix}${item.name}`],
  );
mkdirSync(join(here, ".reviews"), { recursive: true });
const review = mkdtempSync(join(here, ".reviews/review-"));
const requested = process.argv[2],
  clips = requested ? [requested] : ["play", "groom"];
for (const clip of clips) {
  if (!["play", "groom"].includes(clip))
    throw new Error("Choose play or groom");
  const timeline = clip === "play" ? playTimeline : groomTimeline,
    storyBeats = clip === "play" ? playBeats : groomBeats,
    tag = clip === "play" ? "little_morning" : "paw_wash";
  const publish = resolve(root, "site/assets/cozy-cat-detail", clip),
    dist = join(here, `dist-${clip}-v2`),
    prefix = `marmalade-${clip}`;
  if (
    relative(root, publish) !== join("site", "assets", "cozy-cat-detail", clip)
  )
    throw new Error("Unexpected publication directory");
  mkdirSync(publish, { recursive: true });
  // The supported ops-file input avoids buffering a large generator's stdout;
  // all ordinary composition, surface, shape and export bounds still apply.
  writeFileSync(
    join(here, `.generated-${clip}-ops.json`),
    JSON.stringify(operationsFor(clip, timeline)) + "\n",
  );
  console.error(`Building ${clip}: ${timeline.length} native 384×256 poses`);
  const built = run("build", join(here, `${clip}-project.json`));
  write(join(here, `.raw-build-${clip}.json`), built);
  copyFileSync(join(dist, `${prefix}.png`), join(publish, "sheet.png"));
  copyFileSync(join(dist, `${prefix}.normal.png`), join(publish, "normal.png"));
  const projectBytes = readFileSync(join(dist, `${prefix}.project.json`)),
    projectGzip = gzipSync(projectBytes, { level: 9, mtime: 0 });
  writeFileSync(join(publish, "project.json.gz"), projectGzip);
  const editableProject = {
    file: "project.json.gz",
    encoding: "gzip",
    bytes: projectGzip.length,
    sha256: hash(projectGzip),
    uncompressedBytes: projectBytes.length,
    uncompressedSha256: hash(projectBytes),
    identity:
      "Decompression reproduces the native exported JSON bytes exactly; no shapes, layers, materials or metadata removed.",
    unpack: `node examples/cozy-cat-detail/unpack.mjs site/assets/cozy-cat-detail/${clip}/project.json.gz marmalade-${clip}.project.json`,
  };
  const editors = await editorParts({
    projectBytes,
    publish,
    clip,
    tag,
    runtime,
  });
  writeFileSync(
    join(publish, "replay.json"),
    JSON.stringify(read(join(dist, "construction-replay.json"))) + "\n",
  );
  const atlas = read(join(dist, `${prefix}.atlas.json`));
  atlas.meta.image = "sheet.png";
  atlas.meta.normalMap.image = "normal.png";
  atlas.meta.normalMap.atlas = "normal.atlas.json";
  write(join(publish, "atlas.json"), atlas);
  const normal = read(join(dist, `${prefix}.normal.atlas.json`));
  normal.meta.image = "normal.png";
  normal.meta.colorImage = "sheet.png";
  normal.meta.normalEncoding.image = "normal.png";
  normal.meta.normalEncoding.atlas = "normal.atlas.json";
  write(join(publish, "normal.atlas.json"), normal);
  const verification = run(
      "verify",
      join(publish, "atlas.json"),
      "--report",
      join(review, `${clip}-verification.json`),
    ),
    normalVerification = run(
      "verify",
      join(publish, "normal.atlas.json"),
      "--report",
      join(review, `${clip}-normal-verification.json`),
    );
  write(join(here, `.raw-verification-${clip}.json`), {
    verification,
    normalVerification,
  });
  const proof = await composedProof({
    publish,
    review,
    atlas,
    tag,
    run,
    createCanvas,
    loadImage,
    sharp,
    runtime,
  });
  copyFileSync(
    join(publish, "frames", clip === "play" ? "0069.png" : "0029.png"),
    join(publish, "poster.png"),
  );
  const image = await loadImage(join(publish, "sheet.png")),
    frames = atlas.frames.slice(
      atlas.meta.frameTags[0].from,
      atlas.meta.frameTags[0].to + 1,
    );
  for (let start = 0; start < frames.length; start += 4) {
    const canvas = createCanvas(1536, 1024),
      ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    for (let j = 0; j < 4 && start + j < frames.length; j++) {
      const f = frames[start + j].frame;
      ctx.drawImage(
        image,
        f.x,
        f.y,
        384,
        256,
        (j % 2) * 768,
        Math.floor(j / 2) * 512,
        768,
        512,
      );
    }
    writeFileSync(
      join(
        review,
        `${clip}-poses-${String(start).padStart(3, "0")}-${start + 3}-2x.png`,
      ),
      canvas.toBuffer("image/png"),
    );
  }
  const nativeReceipt = read(join(dist, "sprite-manifest.json")).build;
  const allInputs = nativeReceipt.inputs.map((input) => {
    const bytes = readFileSync(resolve(here, input.path));
    if (hash(bytes) !== input.sha256)
      throw new Error(`Source changed after build: ${input.path}`);
    const text = /\.(?:[cm]?js|json|md|txt|ya?ml|html?|css|svg|ts|pxl)$/i.test(
      input.path,
    );
    return {
      ...input,
      bytes: input.bytes ?? bytes.length,
      ...(text
        ? {
            normalizedTextSha256: hash(
              bytes.toString("utf8").replace(/\r\n?/g, "\n"),
            ),
          }
        : {}),
    };
  });
  const generatedBuildInputs = allInputs
    .filter((input) => input.path === `.generated-${clip}-ops.json`)
    .map((input) => ({
      ...input,
      regenerate: `node examples/cozy-cat-detail/build.mjs ${clip}`,
      committed: false,
    }));
  const sources = allInputs.filter(
    (input) => !input.path.startsWith(".generated-"),
  );
  const integrity = Object.fromEntries(
    walkFiles(publish)
      .filter((p) => p !== "manifest.json" && p !== ".gitattributes")
      .map((p) => {
        const bytes = readFileSync(join(publish, p));
        return [p, { bytes: bytes.length, sha256: hash(bytes) }];
      }),
  );
  const contacts =
    clip === "play"
      ? [67, 68, 69, 70].map((frame) => {
          const p = timeline[frame],
            paw = catParts(p).paws.nearFore;
          return {
            frame,
            pawCenter: paw,
            ballCenter: [p.ball.x, p.ball.y],
            centerDistance: Math.hypot(paw[0] - p.ball.x, paw[1] - p.ball.y),
          };
        })
      : [29, 40, 51, 62].map((frame) => {
          const lick = catParts(timeline[frame]).lick;
          return {
            frame,
            ...lick,
            edgeDistance: Math.hypot(
              lick.tongueTip[0] - lick.innerPawEdge[0],
              lick.tongueTip[1] - lick.innerPawEdge[1],
            ),
          };
        });
  write(join(publish, "manifest.json"), {
    version: 1,
    name:
      clip === "play"
        ? "Marmalade's little morning — detailed edition"
        : "Marmalade's paw wash",
    width: 384,
    height: 256,
    pivot: { x: 0, y: 0 },
    sourceFrames: timeline.length,
    tag,
    durationMs: timeline.length * 50,
    frameDurationMs: 50,
    loop: true,
    reviewScale: 2,
    proofScale: 1,
    storyBeats,
    palette: C,
    contacts,
    editableProject: { ...editableProject, browserEditorImportable: false },
    editableParts: editors.parts,
    editableBundle: editors.bundle,
    sourceInputs: sources,
    generatedBuildInputs,
    nativeTool: nativeReceipt.tool,
    tools: {
      producer: "agent-sprites",
      version: runtime.version,
      inputRoute:
        "Official ops-file build input, deterministically regenerated by build.mjs; all native bounds remain enabled.",
      composition:
        "New native-resolution named room, quilt, wicker, yarn and articulated domestic-cat anatomy",
      timing: `${timeline.length} exact 50ms holds (20fps)`,
      markings:
        "Convex body/head clipping in anatomical local coordinates before posing; curved tail bands intersect the actual posed fur mask and stay named editable row rectangles.",
      surfaces:
        "Nested bounded logical regions and tight primitive layers retain dome/bevel/flat normals, material flags and a morning-window lamp",
      lighting: "Restrained RGB ambient/sky/window bake on every source cell",
      normalAtlas: "Paired packing, timing, pivot and exact alpha",
      constructionReplay: {
        cell: "0,0",
        records: read(join(publish, "replay.json")).records.length,
      },
    },
    reference: {
      sourcePath: "examples/cozy-cat-detail/reference/marmalade-concept.png",
      url: "https://github.com/ehartye/agent-sprites/blob/main/examples/cozy-cat-detail/reference/marmalade-concept.png",
      role: "Built-in imagegen visual direction only; all published scene geometry is newly authored and editable.",
    },
    proof: {
      kind: "composed-full-sequence",
      source:
        "Actual exported atlas via bounded official40-frame proofs and explicit full-GIF wrapper verification",
      matte: "#aaa392",
      durationMs: proof.durationMs,
      driftMs: proof.gif.driftMs,
      pixelComparison: proof.gif.pixelComparison,
      officialParts: proof.officialParts.length,
      scaleReason:
        "Each official proof uses a losslessly repacked 40-frame atlas page inside unchanged native side/work bounds. Full native-resolution GIF is separately encoded and decoded from the canonical PNG sequence; no single full-sequence official proof is claimed.",
    },
    unusedFrames: [],
    integrity,
  });
  console.error(
    `Published ${clip}; GIF ${proof.frameCount} frames, drift ${proof.gif.driftMs}ms`,
  );
}
console.log(
  JSON.stringify(
    { ok: true, clips, review: relative(root, review).split(sep).join("/") },
    null,
    2,
  ),
);
