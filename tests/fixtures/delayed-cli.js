import { appendFileSync } from 'node:fs';

const [mode, launches] = process.argv.slice(2);
appendFileSync(launches, `${mode}\n`);
if (mode === 'pending') {
  process.stdout.write('READY\n');
  process.stdin.resume(); // Keep the real execFile command alive until released or aborted.
  process.stdin.on('data', () => process.exit(0));
} else process.stdout.write('completed\n');
