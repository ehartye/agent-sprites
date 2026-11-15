import { test, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// This repository is a public plugin. Tracked text must not name a private consumer
// project, a personal machine or a home directory. Private names are held as SHA-256
// digests of the lowercased word, so this file does not publish them itself. To deny
// another name, add the digest of its lowercased letters and digits:
//   node -e "console.log(require('node:crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" name
const root = fileURLToPath(new URL('../', import.meta.url));
const deniedWordDigests = new Set([
  '64025067b78049fdb3f09a033c91470385b60b268286fc26fcf59288e23d2254',
  'b4bf5d7e5fcf89ef8adb64ec9c624db850d10f2afef020ed9ef23892df0833af',
  '839345c938309b36b697ffcb46b070c37e691c3da4338681b194e47dc27d5b3e',
  'c3cd7965b8558e92a0046b1bdc5d49d9449eb12ba77f267214198d9a7de45e6a',
  'fc68511efd2f661975915d3c9497d0ee8eca7851bde2cb0f91f11fed5bb19b7f',
  '232554cace01d13701a849d11b0a87083eef96befc90aa7a570f3d85cb149f0e',
  'aa76d267777dfd63c4dcbc1ddb2cb482956eaa533d57c1d325f0ae2ba772dae1',
]);
const deniedPatterns = [
  ['Windows user path', /[a-z]:[\\/]+users[\\/]/i], // also matches the JSON-escaped form
  ['Git Bash user path', /\/[a-z]\/users\//i],
  ['macOS home path', /\/Users\/[a-z]/],
  ['Linux home path', /\/home\/[a-z]/],
];
// Add a path here only with a comment saying why a hit is unavoidable.
const allowed = new Set(['package-lock.json']);
const binary = /\.(png|jpe?g|gif|webp|ico|wav|ogg|mp3|mp4|webm|woff2?|ttf|otf|zip|gz|pdf|wasm|glb|sprites)$/i;

const verdicts = new Map();
const deniedWord = word => {
  let verdict = verdicts.get(word);
  if (verdict === undefined) {
    verdict = deniedWordDigests.has(createHash('sha256').update(word).digest('hex'));
    verdicts.set(word, verdict);
  }
  return verdict;
};
const findings = text => {
  const found = deniedPatterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  if ((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).some(deniedWord)) found.push('private name');
  return found;
};

function trackedFiles() {
  try {
    return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0').filter(path => path && !allowed.has(path) && !binary.test(path));
  } catch {
    return null; // Not a git checkout: a plugin cache or an archive has no index to list.
  }
}

test('the deny-list recognises what it denies', () => {
  expect(findings('C:\\Users\\someone\\repos')).toEqual(['Windows user path']);
  expect(findings('"C:\\\\Users\\\\someone"')).toEqual(['Windows user path']);
  expect(findings('/c/Users/someone/repos')).toContain('Git Bash user path');
  expect(findings('/Users/someone')).toEqual(['macOS home path']);
  expect(findings('/home/someone')).toEqual(['Linux home path']);
  expect(findings('a consumer game on a development machine')).toEqual([]);
  expect(deniedWordDigests.size).toBe(7);
  for (const digest of deniedWordDigests) expect(digest).toMatch(/^[0-9a-f]{64}$/);
});

test('tracked text names no private project, machine or home directory', () => {
  const files = trackedFiles();
  if (files === null) return;
  const hits = [];
  for (const path of files) {
    let text;
    try { text = readFileSync(root + path, 'utf8'); } catch { continue; } // Deleted in the working tree.
    if (text.includes('\0')) continue;
    for (const label of findings(text)) hits.push(`${path}: ${label}`);
  }
  expect(hits, 'reword the text generically, or add the path to `allowed` in tests/hygiene.test.js with the reason').toEqual([]);
});
