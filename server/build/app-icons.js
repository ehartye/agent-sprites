import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import sharp from 'sharp';
import {decodePng} from '../engine/png-decode.js';

// App icon set from three hand-placed tiles of a built tileset: whole-number nearest-neighbour scales and crops only, never a
// fractional resample, every output opaque and written as RGB. Deterministic: the same inputs give the same pixels.
//
//   master (64)  -> icon-192 (3x), icon-512 (8x), icon-maskable-512 (the master on a bleed of its own edge pixels, content inside the 75% safe
//                   zone), apple-touch-icon 180 (the master cropped to 60x60 and scaled 3x: the outer pixels are bleed)
//   mid (32), tiny (16) -> favicon-32 (1x), favicon-16 (1x), favicon-48 (tiny 3x), favicon.ico (16, 32 and 48 as PNG entries)
//   card (optional) -> og-card.png: the master on a wide scene made of its own edge pixels, extra stars, and a logo stamped on the horizon
export const ICON_FILES = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'favicon.ico'];
const FIELDS = ['version', 'atlas', 'output', 'tiles', 'card'];
const CARD_FIELDS = ['width', 'height', 'scale', 'sceneWidth', 'masterX', 'horizon', 'stars', 'logo'];

const image = (w, h) => ({w, h, data: new Uint8Array(w * h * 4)});
const at = (im, x, y) => (y * im.w + x) * 4;
const whole = (n, what) => { if (!Number.isInteger(n) || n < 1) throw Error(`${what} must be a whole number of at least 1.`); return n; };

function scale(im, k) {
  whole(k, 'scale');
  const out = image(im.w * k, im.h * k);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) { const s = at(im, Math.floor(x / k), Math.floor(y / k)), d = at(out, x, y); for (let c = 0; c < 4; c++) out.data[d + c] = im.data[s + c]; }
  return out;
}
function crop(im, x0, y0, w, h) {
  if (x0 < 0 || y0 < 0 || x0 + w > im.w || y0 + h > im.h) throw Error(`crop ${w}x${h} at ${x0},${y0} does not fit the ${im.w}x${im.h} picture.`);
  const out = image(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = at(im, x0 + x, y0 + y), d = at(out, x, y); for (let c = 0; c < 4; c++) out.data[d + c] = im.data[s + c]; }
  return out;
}
/** Grow the picture by repeating its own edge pixels, so the tile's flat border continues. */
function bleed(im, left, top, right, bottom) {
  const out = image(im.w + left + right, im.h + top + bottom);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    const sx = Math.min(im.w - 1, Math.max(0, x - left)), sy = Math.min(im.h - 1, Math.max(0, y - top)), s = at(im, sx, sy), d = at(out, x, y);
    for (let c = 0; c < 4; c++) out.data[d + c] = im.data[s + c];
  }
  return out;
}
/** Draw `src` onto `dst` at (x, y); alpha under 128 is skipped, the rest copied whole (hard alpha). */
function stamp(dst, src, x, y) {
  for (let j = 0; j < src.h; j++) for (let i = 0; i < src.w; i++) {
    const s = at(src, i, j);
    if (src.data[s + 3] < 128) continue;
    const px = x + i, py = y + j;
    if (px < 0 || py < 0 || px >= dst.w || py >= dst.h) continue;
    const d = at(dst, px, py);
    dst.data[d] = src.data[s]; dst.data[d + 1] = src.data[s + 1]; dst.data[d + 2] = src.data[s + 2]; dst.data[d + 3] = 255;
  }
}

async function encode(im, name) {
  for (let i = 3; i < im.data.length; i += 4) if (im.data[i] !== 255) throw Error(`${name} must be fully opaque.`);
  return sharp(Buffer.from(im.data), {raw: {width: im.w, height: im.h, channels: 4}}).removeAlpha().png().toBuffer();
}
/** A Windows icon: the PNGs themselves, one directory entry each. */
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({size, bytes}, i) => {
    const e = 6 + 16 * i;
    head[e] = size >= 256 ? 0 : size; head[e + 1] = size >= 256 ? 0 : size; head[e + 2] = 0; head[e + 3] = 0;
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6); head.writeUInt32LE(bytes.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += bytes.length;
  });
  return Buffer.concat([head, ...pngs.map(p => p.bytes)]);
}
/** Compared by decoded pixels, not bytes: the deflate stream may differ between encoders, the picture may not. */
function samePixels(name, a, b) {
  if (name.endsWith('.ico')) {
    if (a.length < 6 || a.readUInt16LE(4) !== b.readUInt16LE(4)) return false;
    return [...Array(b.readUInt16LE(4)).keys()].every(i => {
      const slice = buf => buf.subarray(buf.readUInt32LE(6 + 16 * i + 12), buf.readUInt32LE(6 + 16 * i + 12) + buf.readUInt32LE(6 + 16 * i + 8));
      return samePixels('x.png', slice(a), slice(b));
    });
  }
  try { const pa = decodePng(a), pb = decodePng(b); return pa.width === pb.width && pa.height === pb.height && Buffer.from(pa.data).equals(Buffer.from(pb.data)); } catch { return false; }
}
const loadImage = path => { const png = decodePng(readFileSync(path)); return {w: png.width, h: png.height, data: png.data}; };

function validate(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw Error('Config must be an object.');
  for (const k of Object.keys(config)) if (!FIELDS.includes(k)) throw Error(`Unknown app-icons field: ${k}`);
  if (config.version !== 1) throw Error('Config requires version: 1.');
  if (typeof config.atlas !== 'string' || !config.atlas) throw Error('atlas must be the path of the built tileset .atlas.json holding the icon tiles.');
  if (typeof config.output !== 'string' || !config.output) throw Error('output must be the directory for the icon files.');
  const tiles = config.tiles ?? {};
  for (const k of Object.keys(tiles)) if (!['master', 'mid', 'tiny'].includes(k)) throw Error(`Unknown tiles field: ${k}`);
  const names = {master: tiles.master ?? 'icon_master', mid: tiles.mid ?? 'icon_32', tiny: tiles.tiny ?? 'icon_16'};
  for (const [k, v] of Object.entries(names)) if (typeof v !== 'string' || !v) throw Error(`tiles.${k} must be a frame name.`);
  if (config.card !== undefined) {
    const c = config.card;
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw Error('card must be an object.');
    for (const k of Object.keys(c)) if (!CARD_FIELDS.includes(k)) throw Error(`Unknown card field: ${k}`);
    for (const k of ['width', 'height', 'scale', 'sceneWidth', 'masterX', 'horizon']) if (!Number.isInteger(c[k]) || c[k] < 0) throw Error(`card.${k} must be a non-negative integer.`);
    whole(c.scale, 'card.scale'); whole(c.width, 'card.width'); whole(c.height, 'card.height');
    if (c.height % c.scale) throw Error(`card.height ${c.height} must be a whole number of scene pixels at card.scale ${c.scale}.`);
    if (c.stars !== undefined && (!c.stars || !Array.isArray(c.stars.at) || !Array.isArray(c.stars.sample) || c.stars.sample.length !== 2 || c.stars.at.some(p => !Array.isArray(p) || p.length !== 2 || p.some(n => !Number.isInteger(n))))) throw Error('card.stars is {sample: [x, y], at: [[x, y], ...]} in pixels.');
    if (c.logo !== undefined && (!c.logo || typeof c.logo.image !== 'string' || !Number.isInteger(c.logo.scale) || !Number.isInteger(c.logo.x))) throw Error('card.logo is {image, scale, x}.');
  }
  return names;
}

/**
 * Build (or, with `check`, verify) the icon set described by a config. Paths in the config are relative to it.
 * Returns {ok, mode, output, files: [{name, width, height, status}], errors}; in check mode status is current, stale or missing and nothing is written.
 */
export async function buildAppIcons(configPath, {check = false} = {}) {
  const result = {ok: false, mode: check ? 'check' : 'build', output: null, files: [], errors: []};
  try {
    configPath = resolve(configPath);
    const config = JSON.parse(readFileSync(configPath, 'utf8')), base = dirname(configPath), names = validate(config);
    const outDir = resolve(base, config.output);
    result.output = outDir;
    const atlasPath = resolve(base, config.atlas);
    if (!existsSync(atlasPath)) throw Error(`atlas "${config.atlas}" does not exist; build the icon tileset first.`);
    const atlas = JSON.parse(readFileSync(atlasPath, 'utf8'));
    if (!Array.isArray(atlas.frames) || typeof atlas.meta?.image !== 'string') throw Error('atlas is not an Aseprite atlas.');
    const frames = new Map(atlas.frames.map(f => [f.filename, f.frame])), sheet = loadImage(resolve(dirname(atlasPath), atlas.meta.image));
    const tile = (name, size) => {
      const f = frames.get(name);
      if (!f) throw Error(`The atlas has no frame ${name}.`);
      const im = image(size, size);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const s = at(sheet, f.x + x, f.y + y), d = at(im, x, y);
        if (sheet.data[s + 3] !== 255) throw Error(`${name} (${x},${y}) is not opaque: an icon tile has no transparent pixel.`);
        for (let k = 0; k < 4; k++) im.data[d + k] = sheet.data[s + k];
      }
      return im;
    };
    const master = tile(names.master, 64), mid = tile(names.mid, 32), tiny = tile(names.tiny, 16);
    const outputs = new Map();
    const save = async (name, im) => { const bytes = await encode(im, name); outputs.set(name, {bytes, width: im.w, height: im.h}); return bytes; };
    await save('icon-192.png', scale(master, 3));
    await save('icon-512.png', scale(master, 8));
    // Maskable: the platform crops to a circle of 40% of the side. At 6x the 64 px tile is 384 px (75% of 512), its content within the safe zone;
    // the rest of the 512 is the tile's own flat edge continued. 86 x 6 = 516, cropped to 512.
    await save('icon-maskable-512.png', crop(scale(bleed(master, 11, 11, 11, 11), 6), 2, 2, 512, 512));
    await save('apple-touch-icon.png', scale(crop(master, 2, 2, 60, 60), 3));
    const f16 = await save('favicon-16.png', tiny), f32 = await save('favicon-32.png', mid), f48 = await save('favicon-48.png', scale(tiny, 3));
    outputs.set('favicon.ico', {bytes: ico([{size: 16, bytes: f16}, {size: 32, bytes: f32}, {size: 48, bytes: f48}]), width: 48, height: 48});
    if (config.card) {
      const c = config.card, sceneH = c.height / c.scale, masterY = sceneH - 64;
      if (masterY < 0) throw Error('card is shorter than the master tile.');
      const rightBleed = c.sceneWidth - c.masterX - 64;
      if (rightBleed < 0) throw Error('card.masterX puts the master tile past the scene width.');
      const scene = bleed(master, c.masterX, masterY, rightBleed, 0);
      if (c.stars) {
        const [sx, sy] = c.stars.sample, star = [...master.data.slice(at(master, sx, sy), at(master, sx, sy) + 4)];
        for (const [x, y] of c.stars.at) { if (x < 0 || y < 0 || x >= scene.w || y >= scene.h) throw Error(`star at ${x},${y} is outside the ${scene.w}x${scene.h} scene.`); const d = at(scene, x, y); for (let k = 0; k < 4; k++) scene.data[d + k] = star[k]; }
      }
      if ((scene.w * c.scale - c.width) % 2 || scene.w * c.scale < c.width) throw Error(`scene ${scene.w * c.scale}px must be at least as wide as the card (${c.width}) and differ from it by an even number of pixels.`);
      const card = crop(scale(scene, c.scale), (scene.w * c.scale - c.width) / 2, 0, c.width, c.height);
      if (c.logo) {
        const logo = loadImage(resolve(base, c.logo.image)), logoScaled = scale(logo, c.logo.scale);
        // the logo's last painted row rests on the horizon
        stamp(card, logoScaled, c.logo.x, (masterY + c.horizon) * c.scale - logoScaled.h + c.logo.scale);
      }
      await save('og-card.png', card);
    }
    const stale = [];
    for (const [name, out] of outputs) {
      const target = join(outDir, name), entry = {name, width: out.width, height: out.height, status: 'written'};
      if (check) {
        entry.status = !existsSync(target) ? 'missing' : samePixels(name, readFileSync(target), out.bytes) ? 'current' : 'stale';
        if (entry.status !== 'current') stale.push(name);
      } else { mkdirSync(outDir, {recursive: true}); writeFileSync(target, out.bytes); }
      result.files.push(entry);
    }
    result.ok = stale.length === 0;
    if (stale.length) result.errors.push({code: 'stale', message: `Icon files differ from the built set: ${stale.join(', ')}.`});
  } catch (error) { result.errors.push({code: 'app-icons', message: error.message}); }
  return result;
}
