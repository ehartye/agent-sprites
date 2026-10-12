import { test, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const script = fileURLToPath(new URL('../../.github/scripts/native-compatibility.mjs', import.meta.url));
test.each([
  ['passed', ['success', 'success', 'success', 'success']],
  ['failed', ['failure', 'skipped', 'skipped', 'skipped']],
  ['incomplete', ['success', undefined, 'success', 'success']],
  ['incomplete', ['success', 'success', 'skipped', 'success']],
])('recording receipt succeeds while native validation is %s', async (nativeResult, outcomes) => {
  const directory = mkdtempSync(join(tmpdir(), 'sprite-native-receipt-'));
  const env = { ...process.env, NATIVE_RECEIPT_DIR: directory };
  for (const [index, name] of ['install', 'dependencies', 'tests', 'managed'].entries()) {
    const key = `NATIVE_${name.toUpperCase()}_RESULT`;
    if (outcomes[index] === undefined) delete env[key]; else env[key] = outcomes[index];
  }
  try {
    await execute(process.execPath, [script, 'receipt'], { env, timeout: 4000, windowsHide: true });
    const receipt = JSON.parse(readFileSync(join(directory, 'receipt.json'), 'utf8'));
    expect(receipt.nativeResult).toBe(nativeResult); expect(receipt.phaseResult).toBe('passed');
    expect(receipt.outcomes.install).toBe(outcomes[0]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
