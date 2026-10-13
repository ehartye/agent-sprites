import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const buildMarker = '.agent-sprites-build.json';
export const buildManifest = 'sprite-manifest.json';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const portableName = file => typeof file === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(file)
  && !file.endsWith('.') && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(file)
  && file !== buildMarker && file !== buildManifest;
const identity = bytes => ({ bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });

function artifactNames(files) {
  const names = Object.values(files);
  if (names.some(file => !portableName(file)) || new Set(names.map(file => typeof file === 'string' ? file.toLowerCase() : file)).size !== names.length) {
    throw new Error('Build artifact filenames must be unique portable basenames.');
  }
  return [...names, buildMarker];
}

/** Final stage bytes only; the manifest is excluded to avoid self-reference. */
export function snapshotArtifactIntegrity(output, files) {
  const expected = artifactNames(files), allowed = new Set(expected), emitted = readdirSync(output);
  // The manifest has not been written yet. Every current stage entry must be a
  // declared artifact or the marker; nothing else can enter the publication.
  if (emitted.length !== expected.length || emitted.some(file => !allowed.has(file))) {
    throw new Error('Final staged artifact inventory differs from declared files and ownership marker.');
  }
  return Object.fromEntries(expected.map(file => {
    const path = join(output, file), stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Build artifact must be a regular file: ${file}`);
    return [file, identity(readFileSync(path))];
  }));
}

/** Inspect a portable final-byte receipt without following artifact links or writing files. */
export function inspectArtifactIntegrity(output, manifest) {
  const reasons = [], reason = (code, message, file) => reasons.push({ code, message, ...(file === undefined ? {} : { file }) });
  let expected;
  try { expected = artifactNames(manifest.files); }
  catch (error) { reason('manifest-invalid', error.message); return reasons; }
  if (!Object.hasOwn(manifest, 'integrity')) {
    reason('output-integrity-missing', 'Legacy output has no final artifact integrity; rebuild to certify its bytes.'); return reasons;
  }
  const records = manifest.integrity;
  if (!object(records) || Object.keys(records).length !== expected.length || Object.keys(records).some(file => !expected.includes(file)) || expected.some(file => !Object.hasOwn(records, file))) {
    reason('manifest-invalid', 'Artifact integrity must cover every declared file and the ownership marker, excluding the manifest.'); return reasons;
  }
  for (const file of expected) {
    const record = records[file];
    if (!object(record) || Object.keys(record).length !== 2 || !Object.hasOwn(record, 'bytes') || !Object.hasOwn(record, 'sha256')
      || !Number.isSafeInteger(record.bytes) || record.bytes < 0 || typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256)) {
      reason('manifest-invalid', `Invalid artifact integrity record: ${file}`, file);
    }
  }
  if (reasons.length) return reasons;
  try {
    const allowed = new Set([...expected, buildManifest]);
    if (readdirSync(output).some(file => !allowed.has(file))) reason('manifest-invalid', 'Output contains an unlisted artifact.');
  } catch {
    reason('output-missing', 'Build output directory is missing.'); return reasons;
  }
  for (const file of expected) {
    const path = join(output, file);
    let stat;
    try { stat = lstatSync(path); }
    catch { reason('output-missing', `Build artifact missing: ${file}`, file); continue; }
    if (stat.isSymbolicLink() || !stat.isFile()) { reason('manifest-invalid', `Build artifact must be a regular file: ${file}`, file); continue; }
    try {
      const actual = identity(readFileSync(path)), record = records[file];
      if (actual.bytes !== record.bytes || actual.sha256 !== record.sha256) reason('output-changed', `Build artifact bytes changed: ${file}`, file);
    } catch { reason('output-missing', `Build artifact unreadable: ${file}`, file); }
  }
  return reasons;
}
