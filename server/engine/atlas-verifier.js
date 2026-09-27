import { readFileSync, writeFileSync, realpathSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { createCanvas, loadImage } from 'canvas';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function atlasFrames(atlas) {
  if (Array.isArray(atlas?.frames)) return atlas.frames;
  if (object(atlas?.frames)) return Object.entries(atlas.frames).map(([filename, frame]) => object(frame) ? { ...frame, filename } : frame);
  return [];
}

/** Validate metadata against decoded image dimensions; aliases may reuse rectangles. */
export function validateAtlas(atlas, { width, height, expectedTags = [], expectedFrames = [] } = {}) {
  const errors = [], warnings = [];
  const error = (code, path, message) => errors.push({ code, path, message });
  const frames = atlasFrames(atlas);
  if (!frames.length) error('frames', 'frames', 'Expected at least one atlas frame.');
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1)
    error('image-size', 'image', 'Decoded image dimensions must be positive integers.');
  if (atlas?.meta?.size?.w !== width || atlas?.meta?.size?.h !== height)
    error('image-size', 'meta.size', `Atlas size must match actual PNG (${width} × ${height}).`);
  const names = new Set();
  const rect = r => object(r) && ['x', 'y', 'w', 'h'].every(k => Number.isInteger(r[k])) && r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0;
  frames.forEach((frame, i) => {
    const path = `frames[${i}]`;
    if (!object(frame)) { error('frame', path, 'Frame must be an object.'); return; }
    if (typeof frame.filename !== 'string' || !frame.filename.length) error('frame-name', path, 'Frame requires a nonempty filename.');
    else if (names.has(frame.filename)) error('duplicate-name', path, `Duplicate frame name: ${frame.filename}`);
    names.add(frame.filename);
    if (!rect(frame.frame) || frame.frame.x + frame.frame.w > width || frame.frame.y + frame.frame.h > height)
      error('frame-bounds', `${path}.frame`, 'Frame rectangle must fit inside the actual PNG.');
    if (!Number.isFinite(frame.duration) || frame.duration <= 0) error('duration', path, 'Frame duration must be positive milliseconds.');
    const source = frame.sourceSize, trimmed = frame.spriteSourceSize;
    if (!object(source) || !Number.isInteger(source.w) || !Number.isInteger(source.h) || source.w < 1 || source.h < 1 ||
        !rect(trimmed) || trimmed.x + trimmed.w > source.w || trimmed.y + trimmed.h > source.h)
      error('source-bounds', path, 'Trimmed sprite rectangle must fit the original source size.');
    if (rect(frame.frame) && rect(trimmed) && (trimmed.w !== (frame.rotated ? frame.frame.h : frame.frame.w) || trimmed.h !== (frame.rotated ? frame.frame.w : frame.frame.h)))
      error('source-size', path, 'Trimmed dimensions must match the packed rectangle (accounting for rotation).');
    if (frame.rotated !== undefined && typeof frame.rotated !== 'boolean') error('rotation', path, 'rotated must be a boolean.');
  });
  const tags = atlas?.meta?.frameTags ?? [];
  const tagNames = new Set();
  if (!Array.isArray(tags)) error('tags', 'meta.frameTags', 'Tags must be an array.');
  else tags.forEach((tag, i) => {
    const path = `meta.frameTags[${i}]`;
    if (!object(tag)) { error('tag', path, 'Tag must be an object.'); return; }
    if (typeof tag.name !== 'string' || !tag.name.length || tagNames.has(tag.name)) error('tag-name', path, 'Tags require unique, nonempty names.');
    tagNames.add(tag.name);
    if (!Number.isInteger(tag.from) || !Number.isInteger(tag.to) || tag.from < 0 || tag.to < tag.from || tag.to >= frames.length)
      error('tag-range', path, 'Tag range must address existing frames in ascending order.');
    if (!['forward', 'reverse', 'pingpong', 'pingpong_reverse'].includes(tag.direction ?? 'forward')) error('tag-direction', path, 'Unsupported tag direction.');
  });
  for (const tag of expectedTags) if (!tagNames.has(tag)) error('missing-tag', 'meta.frameTags', `Required animation is missing: ${tag}`);
  if (!Array.isArray(expectedFrames) || expectedFrames.some(name => typeof name !== 'string' || !name.length))
    error('expected-frames', 'expectedFrames', 'expectedFrames must be an array of frame names.');
  else for (const name of expectedFrames) if (!names.has(name)) error('missing-frame', 'frames', `Required frame is missing: ${name}`);
  return { ok: errors.length === 0, frameCount: frames.length, dimensions: { width, height }, tags: [...tagNames], errors, warnings };
}

// Resolve existing symlinks too, including output files through symlinked directories.
function canonical(path) {
  let result;
  if (existsSync(path)) result = realpathSync(path);
  else result = resolve(existsSync(dirname(path)) ? realpathSync(dirname(path)) : dirname(path), basename(path));
  return process.platform === 'win32' ? result.toLowerCase() : result;
}

// Base frames, tag runs and name aliases often share one source rectangle. Show
// each rectangle once, labeled with every frame index and its best name, so a
// font or cast sheet is reviewable; validation still covers every frame.
export function contactTiles(frames) {
  const tiles = new Map();
  frames.forEach((f, i) => {
    const key = JSON.stringify([f.frame, f.rotated, f.spriteSourceSize, f.sourceSize]);
    if (!tiles.has(key)) tiles.set(key, { frame: f, indices: [], names: [], durations: new Set() });
    const t = tiles.get(key);
    t.indices.push(i); t.durations.add(f.duration);
    if (!/^\d+$/.test(f.filename)) t.names.push(f.filename);
  });
  return [...tiles.values()];
}

function contactSheet(image, frames, scale) {
  const tiles = contactTiles(frames);
  const maxW = Math.max(...frames.map(f => f.sourceSize.w));
  const maxH = Math.max(...frames.map(f => f.sourceSize.h));
  const tileW = Math.max(160, maxW * scale + 16), tileH = maxH * scale + 48;
  // Roughly square sheets instead of a fixed six columns.
  const columns = Math.max(1, Math.min(tiles.length, 12, Math.round(Math.sqrt(tiles.length * tileH / tileW)) || 1));
  const w = columns * tileW, h = Math.ceil(tiles.length / columns) * tileH;
  if (w * h > 32_000_000 || w > 32767 || h > 32767) throw new Error('Contact sheet exceeds 32 megapixels; use a smaller scale or split the atlas.');
  const canvas = createCanvas(w, h), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#858585'; ctx.fillRect(0, 0, w, h); ctx.imageSmoothingEnabled = false;
  tiles.forEach((t, i) => {
    const f = t.frame, x = (i % columns) * tileW, y = Math.floor(i / columns) * tileH;
    ctx.fillStyle = '#252525'; ctx.fillRect(x, y, tileW, 40);
    ctx.fillStyle = '#ffffff'; ctx.font = '12px sans-serif';
    const extra = t.names.length > 1 ? ` +${t.names.length - 1}` : '';
    ctx.fillText(`${t.names[0] ?? f.filename}${extra}`, x + 6, y + 16, tileW - 12);
    ctx.fillText(`#${t.indices.join(',')} · ${[...t.durations].join('/')} ms`, x + 6, y + 32, tileW - 12);
    const r = f.frame, s = f.spriteSourceSize;
    ctx.save(); ctx.translate(x + 8 + s.x * scale, y + 44 + s.y * scale);
    if (f.rotated) { ctx.translate(0, r.w * scale); ctx.rotate(-Math.PI / 2); }
    ctx.drawImage(image, r.x, r.y, r.w, r.h, 0, 0, r.w * scale, r.h * scale); ctx.restore();
  });
  return { png: canvas.toBuffer('image/png'), tiles: tiles.length };
}

// Four-neighbor boundaries include transparent holes and the packed frame edge.
// Samples use local packed coordinates, also for rotated/trimmed atlas entries.
function outlineGaps(pixels, width, height, colors) {
  let count = 0;
  const samples = [];
  const alpha = (x,y) => x<0 || y<0 || x>=width || y>=height ? 0 : pixels[(y*width+x)*4+3];
  for (let y=0; y<height; y++) for (let x=0; x<width; x++) {
    const i=(y*width+x)*4;
    if (!pixels[i+3] || (alpha(x-1,y) && alpha(x+1,y) && alpha(x,y-1) && alpha(x,y+1))) continue;
    const rgb=(pixels[i]<<16)|(pixels[i+1]<<8)|pixels[i+2];
    if (pixels[i+3]===255 && colors.has(rgb)) continue;
    count++;
    if (samples.length<16) samples.push({x,y});
  }
  return {count,pixels:samples};
}

/** Offline verification always decodes the real local PNG, never session state. */
export async function verifyAtlasFile(atlasPath, { expectedTags = [], expectedFrames = [], outlineColors, contactPath, reportPath, scale = 4 } = {}) {
  atlasPath = resolve(atlasPath);
  let report = { ok: false, frameCount: 0, errors: [], warnings: [], artifacts: { atlas: atlasPath } };
  let safeReport = false;
  const fail = (code, message) => { report.ok = false; report.errors.push({ code, message }); };
  try {
    let atlas;
    try { atlas = JSON.parse(readFileSync(atlasPath, 'utf8')); }
    catch (e) { fail('atlas-read', `Cannot read atlas: ${e.message}`); return report; }
    if (typeof atlas?.meta?.image !== 'string' || !atlas.meta.image) { fail('image-read', 'Atlas meta.image must name a local PNG.'); return report; }
    const imagePath = resolve(dirname(atlasPath), atlas.meta.image);
    report.artifacts.image = imagePath;
    const paths = [atlasPath, imagePath, contactPath, reportPath].filter(Boolean).map(p => canonical(resolve(p)));
    const identities = paths.filter(p => existsSync(p)).map(p => { const s = statSync(p, { bigint: true }); return `${s.dev}:${s.ino}`; });
    if (new Set(paths).size !== paths.length || new Set(identities).size !== identities.length) {
      fail('output-path', 'Review output paths must differ from each other and from atlas/PNG inputs (including file links).'); return report;
    }
    safeReport = Boolean(reportPath);
    if (outlineColors !== undefined && (!Array.isArray(outlineColors) || !outlineColors.length || outlineColors.some(c => typeof c!=='string' || !/^#[0-9a-f]{6}$/i.test(c)))) {
      fail('outline-colors', 'outlineColors must be a nonempty array of #RRGGBB colors.'); return report;
    }
    const contourColors = outlineColors === undefined ? null : new Set(outlineColors.map(c=>parseInt(c.slice(1),16)));
    let image;
    try {
      const bytes = readFileSync(imagePath);
      if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Expected PNG file bytes.');
      image = await loadImage(bytes);
    } catch (e) { fail('image-read', `Cannot decode PNG: ${e.message}`); return report; }
    report = { ...validateAtlas(atlas, { width: image.width, height: image.height, expectedTags, expectedFrames }), artifacts: report.artifacts };
    if (!report.ok) return report;
    const frames = atlasFrames(atlas);
    const canvas = createCanvas(image.width, image.height), ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const checkedContours = new Set();
    if (contourColors) report.outlineColors = outlineColors;
    for (const [i, f] of frames.entries()) {
      const r = f.frame, pixels = ctx.getImageData(r.x, r.y, r.w, r.h).data;
      let visible = false;
      for (let j = 3; j < pixels.length; j += 4) if (pixels[j]) { visible = true; break; }
      if (!visible) report.warnings.push({ code: 'empty-frame', path: `frames[${i}]`, message: `Frame ${f.filename} is fully transparent; confirm this is intentional.` });
      const key = `${r.x},${r.y},${r.w},${r.h}`;
      if (visible && contourColors && !checkedContours.has(key)) {
        checkedContours.add(key);
        const gaps = outlineGaps(pixels, r.w, r.h, contourColors);
        if (gaps.count) {
          report.ok = false;
          report.errors.push({code:'outline-gap',path:`frames[${i}]`,message:`Frame ${f.filename} has ${gaps.count} boundary pixels outside its opaque outline colors. Samples are packed-frame-local coordinates.`,...gaps});
        }
      }
    }
    if (contactPath) {
      if (!Number.isInteger(scale) || scale < 1 || scale > 16) throw new Error('Contact scale must be an integer from 1 to 16.');
      const sheet = contactSheet(image, frames, scale);
      writeFileSync(contactPath, sheet.png);
      report.artifacts.contactSheet = resolve(contactPath);
      report.contactSheet = { tiles: sheet.tiles, frames: frames.length };
    }
    return report;
  } catch (e) { fail('verification', e.message); return report; }
  finally {
    if (safeReport) {
      try { writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n'); }
      catch (e) { fail('report-write', e.message); }
    }
  }
}
