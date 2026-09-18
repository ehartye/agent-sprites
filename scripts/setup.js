#!/usr/bin/env node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installRuntime, inspectInstallation, inspectServer, resolveRuntime } from './managed-runtime.js';

const source = join(dirname(fileURLToPath(import.meta.url)), '..');
try {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--check', '--json'].includes(arg))) throw new Error('Usage: node scripts/setup.js [--check] [--json]');
  if (!args.includes('--check')) installRuntime(source);
  const report = inspectInstallation(source);
  if (report.ok) {
    report.server = await inspectServer(resolveRuntime(source));
    if (!report.server.ok) {
      report.ok = false;
      report.errors.push('Running server does not match this managed CLI. Stop the known old sprite server when safe, or set SPRITE_PORT to an unused port, then rerun --check. Setup never stops an existing server.');
    }
  }
  console.log(JSON.stringify(report, null, args.includes('--json') ? undefined : 2));
  if (!report.ok) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  if (process.argv.includes('--json')) console.log(JSON.stringify({ ok: false, errors: [error.message] }));
  process.exitCode = 1;
}
