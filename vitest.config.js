import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./tests/setup-session-db.js'],
    // Let jsdom supply browser storage. Node's native storage without a backing
    // file otherwise shadows it in forked workers, breaking real UI behavior.
    execArgv: process.allowedNodeEnvironmentFlags.has('--no-experimental-webstorage')
      ? ['--no-experimental-webstorage'] : [],
  },
});
