import {inflateSync} from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Synchronous PNG decoder for build inputs: 8-bit greyscale, RGB, palette (with tRNS), grey+alpha and RGBA, not interlaced.
 * Returns {width, height, data} with data an RGBA Uint8Array. Exists so a sync recipe can read another set's built sheet.
 */
export function decodePng(buffer) {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(SIGNATURE)) throw Error('Not a PNG file.');
  let pos = 8, header = null, palette = null, trns = null;
  const idat = [];
  while (pos + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(pos), type = buffer.toString('latin1', pos + 4, pos + 8), body = buffer.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length;
    if (type === 'IHDR') header = {width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], color: body[9], interlace: body[12]};
    else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') trns = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
  }
  if (!header || !idat.length) throw Error('PNG has no image data.');
  const {width, height, depth, color, interlace} = header;
  if (interlace !== 0 || ![0, 2, 3, 4, 6].includes(color) || !(depth === 8 || ([0, 3].includes(color) && [1, 2, 4].includes(depth)))) throw Error(`Unsupported PNG (need 8-bit, or 1/2/4-bit grey or palette, not interlaced; got depth ${depth}, colour type ${color}, interlace ${interlace}).`);
  const channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color], stride = Math.ceil(width * channels * depth / 8), bpp = Math.max(1, channels * depth >> 3);
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) throw Error('PNG image data is truncated.');
  const rows = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i], a = i >= bpp ? rows[dst + i - bpp] : 0, b = y ? rows[dst - stride + i] : 0, c = y && i >= bpp ? rows[dst - stride + i - bpp] : 0;
      let v;
      if (filter === 0) v = x; else if (filter === 1) v = x + a; else if (filter === 2) v = x + b; else if (filter === 3) v = x + ((a + b) >> 1);
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      else throw Error(`PNG uses unknown row filter ${filter}.`);
      rows[dst + i] = v & 255;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const d = p * 4;
    // sub-byte samples are packed most significant bit first within a row
    const s = depth < 8 ? 0 : p * channels;
    if (depth < 8) {
      const x = p % width, y = Math.floor(p / width), bit = x * depth, v = (rows[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
      const sample = color === 0 ? Math.round(v * 255 / ((1 << depth) - 1)) : v;
      if (color === 0) { data[d] = data[d + 1] = data[d + 2] = sample; data[d + 3] = 255; continue; }
      if (!palette || sample * 3 + 2 >= palette.length) throw Error('PNG palette index out of range.');
      data[d] = palette[sample * 3]; data[d + 1] = palette[sample * 3 + 1]; data[d + 2] = palette[sample * 3 + 2]; data[d + 3] = trns && sample < trns.length ? trns[sample] : 255;
      continue;
    }
    if (color === 6) { data[d] = rows[s]; data[d + 1] = rows[s + 1]; data[d + 2] = rows[s + 2]; data[d + 3] = rows[s + 3]; }
    else if (color === 2) { data[d] = rows[s]; data[d + 1] = rows[s + 1]; data[d + 2] = rows[s + 2]; data[d + 3] = 255; }
    else if (color === 0) { data[d] = data[d + 1] = data[d + 2] = rows[s]; data[d + 3] = 255; }
    else if (color === 4) { data[d] = data[d + 1] = data[d + 2] = rows[s]; data[d + 3] = rows[s + 1]; }
    else { const i = rows[s]; if (!palette || i * 3 + 2 >= palette.length) throw Error('PNG palette index out of range.'); data[d] = palette[i * 3]; data[d + 1] = palette[i * 3 + 1]; data[d + 2] = palette[i * 3 + 2]; data[d + 3] = trns && i < trns.length ? trns[i] : 255; }
  }
  return {width, height, data};
}
