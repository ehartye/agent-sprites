import { deflateSync, crc32 } from 'node:zlib';

export function surfacePngDimensions(width, height, scale = 1) {
  if (![width, height, scale].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Normal PNG dimensions and scale must be positive integers');
  const w = width * scale, h = height * scale;
  if (!Number.isSafeInteger(w * h) || w * h > 64_000_000) throw new Error('Normal PNG output exceeds 64000000-pixel budget');
  return { width: w, height: h };
}

/** Exact straight-alpha RGBA for normal maps; no canvas premultiplication. */
export function encodeSurfacePng(rgba, width, height, scale = 1) {
  const { width: w, height: h } = surfacePngDimensions(width, height, scale);
  if (rgba.length !== width * height * 4) throw new Error('Normal PNG requires four RGBA bytes per pixel');
  const scan = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const source = (Math.floor(y / scale) * width + Math.floor(x / scale)) * 4, target = y * (w * 4 + 1) + x * 4 + 1;
    for (let c = 0; c < 4; c++) scan[target + c] = rgba[source + c];
  }
  const chunk = (name, data) => {
    const result = Buffer.alloc(data.length + 12); result.writeUInt32BE(data.length); result.write(name, 4, 4, 'ascii'); data.copy(result, 8);
    result.writeUInt32BE(crc32(result.subarray(4, data.length + 8)), data.length + 8); return result;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(w); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(scan)), chunk('IEND', Buffer.alloc(0))]);
}
