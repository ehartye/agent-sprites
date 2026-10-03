import { afterAll } from 'vitest';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';

// Every test file gets its own on-disk database. CLI-spawned servers inherit
// this path, so real-server coverage cannot write into the owner's workbench.
const priorPath = process.env.SPRITE_DB_PATH;
const tempRoot = realpathSync(tmpdir());
const directory = mkdtempSync(join(tempRoot, 'agent-sprites-tests-'));
process.env.SPRITE_DB_PATH = join(directory, 'sessions.db');
afterAll(() => {
  if (priorPath === undefined) delete process.env.SPRITE_DB_PATH;
  else process.env.SPRITE_DB_PATH = priorPath;
  // A detached test server may still be exiting after its shutdown response.
  const path = relative(tempRoot, realpathSync(directory));
  if (!path || isAbsolute(path) || path === '..' || path.startsWith(`..${sep}`)) throw new Error('Test cleanup escaped its temporary root.');
  rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
});
