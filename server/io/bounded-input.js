import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createHash } from 'node:crypto';

export function byteCounter({ limit, label, onProgress }) {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error(`${label} byte limit must be a nonnegative safe integer`);
  const hash = createHash('sha256'); let bytes = 0, digest;
  const stream = new Transform({ transform(chunk, _encoding, callback) {
    bytes += chunk.length;
    onProgress?.(bytes);
    if (bytes > limit) return callback(new Error(`${label} exceeds ${limit} bytes`));
    hash.update(chunk); callback(null, chunk);
  } });
  stream.receipt = () => ({ bytes, sha256: digest ??= hash.digest('hex') });
  return stream;
}

// The caller owns outputPath. This helper never removes caller files or folders.
export async function spoolBoundedInput(input, outputPath, { encoding = 'json', maxSourceBytes, maxExpandedBytes, signal, onProgress } = {}) {
  const source = byteCounter({ limit: maxSourceBytes, label: 'Raw source', onProgress: bytes => onProgress?.({ sourceBytes: bytes }) });
  const expanded = byteCounter({ limit: maxExpandedBytes, label: 'Expanded input', onProgress: bytes => onProgress?.({ expandedBytes: bytes }) });
  await pipeline(input, source, ...(encoding === 'gzip' ? [createGunzip()] : []), expanded, createWriteStream(outputPath, { flags: 'wx' }), { signal });
  return { source: source.receipt(), expanded: expanded.receipt() };
}
