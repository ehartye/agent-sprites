import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deriveBackStudy } from '../../server/authoring/native/derive-back.mjs';

// The study itself ships with the managed runtime; this is its command-line entry point.
export { deriveBackStudy };
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: node derive-back.mjs centered.project.json [adult|child] [tone]');
  process.stdout.write(JSON.stringify(deriveBackStudy(JSON.parse(readFileSync(resolve(process.argv[2]), 'utf8')), { kind: process.argv[3] ?? 'adult', tone: process.argv[4] ?? 'peach' })));
}
