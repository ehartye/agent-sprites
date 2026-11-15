import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./tests/setup-session-db.js'],
    // tests/native-ui/*.test.mjs are written for node:test and drive real browsers.
    // scripts/test-ui-native.mjs runs them with `node --test`; vitest must not collect them.
    exclude: [...configDefaults.exclude, 'tests/native-ui/**/*.test.mjs'],
    // Many files start child processes or a jsdom app. One worker per core made six of
    // them miss their five-second limits in a whole-suite run; half the cores does not.
    maxWorkers: '50%',
    // Let jsdom supply browser storage. Node's native storage without a backing
    // file otherwise shadows it in forked workers, breaking real UI behavior.
    execArgv: process.allowedNodeEnvironmentFlags.has('--no-experimental-webstorage')
      ? ['--no-experimental-webstorage'] : [],
  },
});
