#!/usr/bin/env node
import { dirname, isAbsolute, join } from 'node:path';
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describeSource, installRuntime, inspectInstallation, inspectServer, resolveRuntime } from './managed-runtime.js';

const currentSource = join(dirname(fileURLToPath(import.meta.url)), '..');
let source = currentSource;
try {
  const { values } = parseArgs({ options: { check: { type: 'boolean' }, json: { type: 'boolean' }, 'managed-only': { type: 'boolean' }, source: { type: 'string' }, 'expect-version': { type: 'string' } } });
  const selected = values.source !== undefined || values['expect-version'] !== undefined;
  if (selected && (!values['managed-only'] || !values.source || !values['expect-version'])) throw new Error('--source and --expect-version must be supplied together with --managed-only');
  if (selected) {
    if (!isAbsolute(values.source)) throw new Error('--source must be an absolute pinned plugin path');
    source = values.source;
    const description = describeSource(source);
    if (description.version !== values['expect-version']) throw Object.assign(new Error(`Expected pinned version ${values['expect-version']}, found ${description.version}; nothing was installed or repaired`), { boundary: 'version' });
    // Qualification promises the pin's original launcher, not just our resolver.
    // Admit only this policy or the identical historical policy in 0.99.0/0.101.1.
    const digest = path => createHash('sha256').update(readFileSync(path, 'utf8').replaceAll('\r\n', '\n')).digest('hex');
    for (const file of ['run-managed.js', 'managed-runtime.js', 'source-fingerprint.js']) {
      const allowed = [digest(join(currentSource, 'scripts', file))];
      if (file === 'managed-runtime.js') allowed.push('94145bf238cc13a66f8d1db1dd92ad94a71e7ba67077cec78c3408772f9e1fdd');
      if (!allowed.includes(digest(join(source, 'scripts', file)))) throw new Error(`Unsupported pinned managed launcher policy: scripts/${file}; nothing was installed or repaired`);
    }
  }
  const link = !values['managed-only'];
  if (!values.check) installRuntime(source, { link });
  const report = inspectInstallation(source, { link });
  if (report.ok) {
    report.server = await inspectServer(resolveRuntime(source));
    if (!report.server.ok) {
      report.ok = false;
      report.boundary = 'version';
      report.errors.push('Running server does not match this managed CLI. Stop the known old sprite server when safe, or set SPRITE_PORT to an unused port, then rerun --check. Setup never stops an existing server.');
    }
  }
  console.log(JSON.stringify(report, null, values.json ? undefined : 2));
  if (!report.ok) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  if (process.argv.includes('--json')) console.log(JSON.stringify({ ok: false, ...(error.boundary && { boundary: error.boundary }), errors: [error.message] }));
  process.exitCode = 1;
}
