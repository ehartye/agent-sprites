// Pure source inventory/hash policy shared by managed installs and build provenance.
// Importing this module performs no installation, home lookup, service or process work.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function fingerprintSource(root) {
  const files = [];
  function visit(name) {
    const path = join(root, name), stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`Runtime source must not contain symlinks: ${path}`);
    if (stat.isDirectory()) for (const child of readdirSync(path).sort()) visit(`${name}/${child}`);
    else if (stat.isFile()) files.push(name);
  }
  // Preserve traversal order; a global sort would change existing release identity.
  for (const name of ['package.json', 'package-lock.json', 'scripts', 'server']) visit(name);
  const hash = createHash('sha256');
  for (const name of files) {
    const bytes = readFileSync(join(root, name));
    // Git and npm's Windows bin-link shebang repair can change text CRLF.
    // Final artifact digests have a separate, exact raw-byte policy.
    const content = /\.(?:[cm]?js|json|html|css|svg|txt)$/.test(name) ? bytes.toString('utf8').replaceAll('\r\n', '\n') : bytes;
    hash.update(name).update('\0').update(content).update('\0');
  }
  return { fingerprint: hash.digest('hex'), files };
}
