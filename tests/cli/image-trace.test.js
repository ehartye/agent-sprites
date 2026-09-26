import { test, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { buildProject } from '../../server/build/project-build.js';
const exec = promisify(execFile);
const dirs = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

test('trace is offline and emitted operations replay through the isolated build pipeline', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sprite-trace-cli-')); dirs.push(dir);
  const input = join(dir, 'reference.png'), output = join(dir, 'trace');
  await sharp(Buffer.from([10,20,30,255, 40,50,60,255]), { raw: { width: 2, height: 1, channels: 4 } }).png().toFile(input);
  const { stdout } = await exec(process.execPath, ['scripts/sprite.js', 'trace', input, '--out', output, '--name', 'reference', '--json'], { env: { ...process.env, SPRITE_PORT: 'invalid-offline-port' } });
  const report = JSON.parse(stdout);
  expect(report.ok).toBe(true);
  const config = join(dir, 'build.json');
  writeFileSync(config, JSON.stringify({ version: 1, ops: 'trace/operations.json', output: 'rebuilt' }));
  const rebuilt = await buildProject(config);
  expect(rebuilt.ok).toBe(true);
  expect(readFileSync(rebuilt.artifacts.sheet)).toEqual(readFileSync(report.artifacts.sheet));
});

test('missing output and unknown trace flags fail without contacting the server', async () => {
  for (const args of [[], ['--out', 'unused', '--resize', '32']]) {
    await expect(exec(process.execPath, ['scripts/sprite.js', 'trace', 'image.png', ...args], { env: { ...process.env, SPRITE_PORT: 'invalid-offline-port' } })).rejects.toMatchObject({ code: 1, stderr: expect.stringMatching(/Usage:|Unknown trace option/) });
  }
});
