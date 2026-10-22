import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, deflateRawSync } from "node:zlib";
const hash = (b) => createHash("sha256").update(b).digest("hex"),
  read = (p) => JSON.parse(readFileSync(p, "utf8"));
const write = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
const crcTable = Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function zipFiles(files) {
  const local = [],
    central = [];
  let offset = 0;
  for (const { path, bytes } of files) {
    const name = Buffer.from(path),
      data = deflateRawSync(bytes, { level: 9 }),
      crc = crc32(bytes),
      head = Buffer.alloc(30),
      entry = Buffer.alloc(46);
    head.writeUInt32LE(0x04034b50);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(8, 8);
    head.writeUInt16LE(0x21, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(bytes.length, 22);
    head.writeUInt16LE(name.length, 26);
    entry.writeUInt32LE(0x02014b50);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(bytes.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    local.push(head, name, data);
    central.push(entry, name);
    offset += head.length + name.length + data.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

export async function editorParts({
  projectBytes,
  publish,
  clip,
  tag,
  runtime,
}) {
  const full = JSON.parse(projectBytes.toString("utf8")),
    refs = full.groups[tag],
    parts = [],
    bundleFiles = [];
  const { Project } = await import(
    pathToFileURL(join(runtime.root, "server/engine/project.js"))
  );
  mkdirSync(join(publish, "editable"), { recursive: true });
  for (let start = 0; start < refs.length; start += 40) {
    const chosen = refs.slice(start, start + 40),
      cells = {},
      frameDurations = {},
      localRefs = [];
    for (let i = 0; i < chosen.length; i++) {
      const ref = `${Math.floor(i / 8)},${i % 8}`;
      cells[ref] = full.cells[chosen[i]];
      frameDurations[ref] = full.frameDurations[chosen[i]] ?? 50;
      localRefs.push(ref);
    }
    const number = String(parts.length + 1).padStart(2, "0"),
      partTag = `${tag}_part_${number}`;
    const project = {
      ...full,
      name: `marmalade-${clip}-part-${number}`,
      grid: { rows: Math.ceil(chosen.length / 8), cols: 8 },
      cells,
      groups: { [partTag]: localRefs },
      animationFps: { [partTag]: 20 },
      animationDirections: { [partTag]: "forward" },
      frameDurations,
      animationLoops: { [partTag]: false },
      shapeGroups: {},
    };
    delete project.constructionReplay;
    delete project.review;
    const validated = Project.fromJSON(project);
    assert.equal(validated.cells.toJSON().rows, project.grid.rows);
    const bytes = Buffer.from(JSON.stringify(project) + "\n");
    assert(
      bytes.length < 64 * 1024 * 1024,
      "Editor part exceeds native file-import limit",
    );
    const shapeCount = Object.values(cells).reduce(
      (sum, cell) => sum + cell.shapes.length,
      0,
    );
    assert(
      shapeCount <= 200_000,
      "Editor part exceeds native import shape-count policy",
    );
    const requestBytes = Buffer.byteLength(
      JSON.stringify({ project, name: project.name }),
    );
    assert(
      requestBytes < 64 * 1024 * 1024,
      "Editor import request exceeds native API body limit",
    );
    const gzip = gzipSync(bytes, { level: 9, mtime: 0 }),
      file = `editable/part-${number}.project.json.gz`;
    writeFileSync(join(publish, file), gzip);
    bundleFiles.push({ path: `part-${number}.project.json`, bytes });
    parts.push({
      file,
      encoding: "gzip",
      from: start,
      to: start + chosen.length - 1,
      frameCount: chosen.length,
      tag: partTag,
      loop: false,
      durationMs: chosen.length * 50,
      bytes: gzip.length,
      sha256: hash(gzip),
      uncompressedBytes: bytes.length,
      uncompressedSha256: hash(bytes),
      shapeCount,
      requestBytes,
      validation: {
        tool: "agent-sprites",
        version: runtime.version,
        method:
          "Isolated managed Project.fromJSON plus native file/body/shape-count import-policy checks; no live session or owner database opened.",
        cellRefs:
          "Remapped to a local eight-column grid; frame names, shape bytes, surfaces and layer coordinates unchanged.",
        replay:
          "Whole-short construction replay and review metadata are not attached to remapped segments. Original custody remains in the full archive and separate replay.json.",
      },
      unpack: `node examples/cozy-cat-detail/unpack.mjs site/assets/cozy-cat-detail/${clip}/${file} marmalade-${clip}-part-${number}.project.json`,
    });
  }
  bundleFiles.push({
    path: "README.md",
    bytes: Buffer.from(
      `# Marmalade ${clip}: editable projects\n\nOpen one part-XX.project.json in agent-sprites. Each independently editable part contains 40 consecutive native 384x256 frames, exact 50ms holds and a one-shot two-second tag. The segments are deliberately not advertised as seamless loops. Cell coordinates and tag refs are remapped; frame names, shapes, normal/material metadata and layer coordinates remain unchanged.\n\nPlay parts in numeric order for the complete ${(refs.length * 50) / 1000}-second short. The paired atlas and full GIF are separate downloads. project.json.gz preserves the complete native export for custody/CLI use; its unpacked size exceeds the browser editor import limit.\n`,
    ),
  });
  const bytes = zipFiles(bundleFiles),
    file = "editor-projects.zip";
  writeFileSync(join(publish, file), bytes);
  return {
    parts,
    bundle: {
      file,
      bytes: bytes.length,
      sha256: hash(bytes),
      entries: bundleFiles.map((f) => ({
        path: f.path,
        bytes: f.bytes.length,
        sha256: hash(f.bytes),
      })),
      format: "ZIP/DEFLATE",
      purpose:
        "Plain editor-importable segment JSON projects, each below the native 64 MiB file limit.",
    },
  };
}

export async function composedProof({
  publish,
  review,
  atlas,
  tag,
  run,
  createCanvas,
  loadImage,
  sharp,
  runtime,
}) {
  const selected = atlas.meta.frameTags.find((t) => t.name === tag);
  assert(selected);
  const frames = atlas.frames.slice(selected.from, selected.to + 1);
  const count = frames.length,
    w = 384,
    h = 256;
  assert(
    count <= 160 && count * w * h <= 16_000_000,
    "Full sequence assembly exceeds this example's explicit pixel envelope",
  );
  const image = await loadImage(join(publish, "sheet.png")),
    original = createCanvas(image.width, image.height),
    oc = original.getContext("2d");
  oc.drawImage(image, 0, 0);
  mkdirSync(join(publish, "frames"), { recursive: true });
  mkdirSync(join(publish, "proof-pages"), { recursive: true });
  const parts = [],
    stack = Buffer.alloc(w * h * count * 4),
    contactColumns = 12,
    contact = createCanvas(
      contactColumns * w,
      Math.ceil(count / contactColumns) * (h + 18),
    ),
    cc = contact.getContext("2d");
  cc.imageSmoothingEnabled = false;
  for (let start = 0; start < count; start += 40) {
    const chosen = frames.slice(start, start + 40),
      partIndex = parts.length,
      number = String(partIndex + 1).padStart(2, "0"),
      partPath = `proof-pages/part-${number}`,
      dir = join(publish, partPath),
      partTag = `${tag}_proof_part_${number}`;
    mkdirSync(dir, { recursive: true });
    const page = createCanvas(1920, Math.ceil(chosen.length / 5) * h),
      pc = page.getContext("2d");
    pc.imageSmoothingEnabled = false;
    const localFrames = chosen.map((frame, i) => {
      const r = frame.frame,
        x = (i % 5) * w,
        y = Math.floor(i / 5) * h;
      assert(!frame.rotated && !frame.trimmed && r.w === w && r.h === h);
      pc.drawImage(image, r.x, r.y, w, h, x, y, w, h);
      const a = oc.getImageData(r.x, r.y, w, h).data,
        b = pc.getImageData(x, y, w, h).data;
      assert.equal(
        Buffer.compare(Buffer.from(a), Buffer.from(b)),
        0,
        "Proof page must copy original PNG bytes pixel-identically",
      );
      return {
        ...frame,
        filename: `source_${String(start + i).padStart(3, "0")}`,
        frame: { x, y, w, h },
      };
    });
    writeFileSync(join(dir, "sheet.png"), page.toBuffer("image/png"));
    const meta = {
      app: "agent-sprites lossless proof page",
      version: runtime.version,
      image: "sheet.png",
      format: "RGBA8888",
      size: { w: page.width, h: page.height },
      scale: "1",
      frameTags: [
        {
          name: partTag,
          from: 0,
          to: chosen.length - 1,
          direction: "forward",
          loop: false,
        },
      ],
      slices: [
        {
          name: "pivot",
          keys: [
            { frame: 0, bounds: { x: 0, y: 0, w, h }, pivot: { x: 0, y: 0 } },
          ],
        },
      ],
    };
    write(join(dir, "atlas.json"), { frames: localFrames, meta });
    write(join(dir, "proof-input.json"), {
      version: 1,
      canvas: { w, h },
      scale: 1,
      loop: false,
      matte: "#aaa392",
      tracks: [
        {
          name: partTag,
          atlas: "atlas.json",
          tag: partTag,
          x: 0,
          y: 0,
          anchor: "pivot",
          loop: false,
        },
      ],
    });
    const out = join(review, `${tag}-official-${number}`);
    run("atlas-proof", join(dir, "proof-input.json"), "--out", out);
    const report = read(join(out, "proof.json"));
    assert.equal(report.frameCount, chosen.length);
    assert.equal(report.gif.driftMs, 0);
    copyFileSync(join(out, "proof.gif"), join(dir, "scene.gif"));
    copyFileSync(join(out, "contact.png"), join(dir, "contact.png"));
    for (let i = 0; i < chosen.length; i++) {
      const source = join(out, "frames", `${String(i).padStart(4, "0")}.png`),
        name = `frames/${String(start + i).padStart(4, "0")}.png`;
      copyFileSync(source, join(publish, name));
      const im = await loadImage(source),
        canvas = createCanvas(w, h),
        ctx = canvas.getContext("2d");
      ctx.drawImage(im, 0, 0);
      stack.set(ctx.getImageData(0, 0, w, h).data, (start + i) * w * h * 4);
      const x = ((start + i) % contactColumns) * w,
        y = Math.floor((start + i) / contactColumns) * (h + 18);
      cc.drawImage(im, x, y);
      cc.fillStyle = "#302e2b";
      cc.fillRect(x, y + h, w, 18);
      cc.fillStyle = "#fff5df";
      cc.font = "11px sans-serif";
      cc.fillText(`#${start + i} ${(start + i) * 50}ms +50`, x + 4, y + h + 13);
    }
    for (const track of report.tracks) {
      track.atlas = relative(dir, track.atlas).split(sep).join("/");
      track.image = relative(dir, track.image).split(sep).join("/");
    }
    for (const input of report.provenance.inputs)
      input.path = relative(dir, input.path).split(sep).join("/");
    report.artifacts = {
      gif: "scene.gif",
      contact: "contact.png",
      frames: chosen.map(
        (_, i) => `../../frames/${String(start + i).padStart(4, "0")}.png`,
      ),
      report: "proof.json",
    };
    report.publication = {
      paths:
        "Relocated paths; native measurements and source-input hashes unchanged.",
      nativeSourceFrames: {
        from: start,
        to: start + chosen.length - 1,
        atlasIndices: {
          from: selected.from + start,
          to: selected.from + start + chosen.length - 1,
        },
      },
      losslessPageCopy: {
        differentPixels: 0,
        sourceAtlas: "../../atlas.json",
        sourceImage: "../../sheet.png",
      },
    };
    write(join(dir, "proof.json"), report);
    const bytes = readFileSync(join(dir, "proof.json"));
    parts.push({
      from: start,
      to: start + chosen.length - 1,
      frameCount: chosen.length,
      durationMs: chosen.length * 50,
      report: `${partPath}/proof.json`,
      sha256: hash(bytes),
      bytes: bytes.length,
      rasterPixels: report.limits.rasterPixels,
      pixelComparison: report.gif.pixelComparison,
    });
  }
  const delays = Array(count).fill(50),
    gif = await sharp(stack, {
      raw: { width: w, height: h * count, channels: 4, pageHeight: h },
    })
      .gif({
        loop: 0,
        delay: delays,
        colours: 256,
        dither: 0,
        effort: 7,
        reuse: false,
        keepDuplicateFrames: true,
        interFrameMaxError: 0,
        interPaletteMaxError: 0,
      })
      .toBuffer();
  const metadata = await sharp(gif, { animated: true }).metadata(),
    decoded = await sharp(gif, { animated: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  assert.equal(metadata.pages, count);
  assert.equal(metadata.loop, 0);
  assert.deepEqual(metadata.delay, delays);
  assert.equal(decoded.info.width, w);
  assert.equal(decoded.info.height, h * count);
  assert.equal(decoded.data.length, stack.length);
  let differentPixels = 0,
    maxChannelError = 0;
  for (let i = 0; i < stack.length; i += 4) {
    assert.equal(stack[i + 3], decoded.data[i + 3]);
    let different = false;
    for (let j = 0; j < 3; j++) {
      const delta = Math.abs(stack[i + j] - decoded.data[i + j]);
      if (delta) different = true;
      maxChannelError = Math.max(maxChannelError, delta);
    }
    if (different) differentPixels++;
  }
  writeFileSync(join(publish, "scene.gif"), gif);
  writeFileSync(join(publish, "contact.png"), contact.toBuffer("image/png"));
  const inputs = ["atlas.json", "sheet.png", ...parts.map((p) => p.report)].map(
    (path) => {
      const bytes = readFileSync(join(publish, path));
      return { path, bytes: bytes.length, sha256: hash(bytes) };
    },
  );
  const proof = {
    ok: true,
    version: 1,
    kind: "composed-full-sequence",
    producer: {
      name: "agent-sprites example delivery wrapper",
      version: runtime.version,
      encoder: "sharp",
      encoderVersion: sharp.versions.sharp,
    },
    width: w,
    height: h,
    frameCount: count,
    durationMs: count * 50,
    loop: true,
    scale: 1,
    canvas: { w, h },
    matte: "#aaa392",
    method:
      "Losslessly copy actual native atlas tag frames to bounded 40-frame proof pages. Run official atlas-proof per page. Join those canonical PNG frames into a complete GIF, decode and verify every frame, hold, loop, alpha and pixel conversion. This full receipt is wrapper verification, not one official full-sequence atlas-proof invocation.",
    officialParts: parts,
    pageCopyDifferentPixels: 0,
    fullSequenceEnvelope: {
      maxFrames: 160,
      maxPixels: 16_000_000,
      actualPixels: w * h * count,
      scope:
        "Full GIF encoding and decoding from already-proven source frames. Native service limits remain unchanged.",
    },
    tracks: [
      {
        name: tag,
        atlas: "atlas.json",
        image: "sheet.png",
        sourceTag: selected,
        loop: true,
      },
    ],
    gif: {
      loop: true,
      pages: metadata.pages,
      delaysMs: metadata.delay,
      durationMs: metadata.delay.reduce((a, b) => a + b, 0),
      requestedDurationMs: count * 50,
      driftMs: 0,
      pixelComparison: {
        exact: differentPixels === 0,
        differentPixels,
        maxChannelError,
        transparentPixels: "All source frames are opaque.",
      },
      paletteLimit: 256,
    },
    provenance: { inputs },
    artifacts: {
      gif: "scene.gif",
      contact: "contact.png",
      frames: frames.map((_, i) => `frames/${String(i).padStart(4, "0")}.png`),
      report: "proof.json",
    },
  };
  write(join(publish, "proof.json"), proof);
  return proof;
}
