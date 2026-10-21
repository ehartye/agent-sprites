import { lstatSync, statSync, realpathSync, mkdtempSync, openSync, fstatSync, writeFileSync, closeSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { resolve, dirname, basename, relative, isAbsolute, sep } from 'node:path';
import { createHash } from 'node:crypto';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
function absent(path) {
  try { lstatSync(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error(`Output already exists: ${path}`);
}

/** Publish a small set of already-rendered files into one new directory. */
export function writeArtifactDirectory(output, files) {
  if (typeof output !== 'string' || !output.trim()) throw new Error('A new output directory is required');
  const names = Object.keys(files);
  if (!names.length || names.some(name => !name || name === '.' || name === '..' || /[\\/:\0]/.test(name))) throw new Error('Artifact names must be plain filenames');
  const requested = resolve(output); absent(requested);
  const parent = realpathSync(dirname(requested)), destination = resolve(parent, basename(requested));
  if (!statSync(parent).isDirectory()) throw new Error('Output parent must be an existing directory');
  absent(destination);
  const stage = mkdtempSync(resolve(parent, `.${basename(destination)}-staging-`));
  const owned = lstatSync(stage, { bigint: true });
  const ownsStage = () => {
    const entry = lstatSync(stage, { bigint: true });
    return entry.isDirectory() && !entry.isSymbolicLink() && same(entry, owned) && realpathSync(stage) === stage;
  };
  let published = false;
  try {
    const written = new Map();
    for (const name of names) {
      if (!ownsStage()) throw new Error('Owned artifact staging directory changed');
      const bytes = Buffer.isBuffer(files[name]) ? files[name] : Buffer.from(files[name]);
      const fd = openSync(resolve(stage, name), 'wx');
      try { const identity = fstatSync(fd, { bigint: true }); writeFileSync(fd, bytes); written.set(name, { identity, sha256: digest(bytes), size: BigInt(bytes.length) }); }
      finally { closeSync(fd); }
    }
    const checkInventory = () => {
      if (!ownsStage() || JSON.stringify(readdirSync(stage).sort()) !== JSON.stringify([...names].sort())) throw new Error('Artifact staging inventory changed');
    };
    checkInventory();
    for (const [name, expected] of written) {
      const path = resolve(stage, name), entry = lstatSync(path, { bigint: true });
      const valid = identity => identity.isFile() && !identity.isSymbolicLink() && identity.nlink === 1n && same(identity, expected.identity) && identity.size === expected.size;
      if (!valid(entry)) throw new Error(`Artifact identity changed before publication: ${name}`);
      const fd = openSync(path, 'r');
      try {
        if (!valid(fstatSync(fd, { bigint: true })) || digest(readFileSync(fd)) !== expected.sha256) throw new Error(`Artifact bytes changed before publication: ${name}`);
      } finally { closeSync(fd); }
      if (!valid(lstatSync(path, { bigint: true }))) throw new Error(`Artifact identity changed before publication: ${name}`);
    }
    if (realpathSync(dirname(requested)) !== parent) throw new Error('Output parent changed before publication');
    checkInventory();
    absent(destination); renameSync(stage, destination); published = true;
    return Object.fromEntries(names.map(name => [name, resolve(destination, name)]));
  } finally {
    if (!published) {
      const rel = relative(parent, stage);
      if (rel && !isAbsolute(rel) && !rel.startsWith(`..${sep}`) && !rel.includes(sep) && ownsStage()) rmSync(stage, { recursive: true, force: true });
    }
  }
}
