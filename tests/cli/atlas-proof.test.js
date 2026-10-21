import { test, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, rmSync, existsSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { atlasProofFixture } from '../helpers/atlas-proof-fixture.js';
const exec = promisify(execFile);
let dir, config;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sprite-proof-cli-')); config = atlasProofFixture(dir); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const cli = (...args) => exec(process.execPath, [resolve('scripts/sprite.js'), ...args], {
  env: { ...process.env, SPRITE_PORT: '1' }, windowsHide: true, timeout: 15000,
});
test('offline proof CLI emits a decoded animation without contacting a live session', async () => {
  const report = JSON.parse((await cli('atlas-proof', config, '--out', join(dir, 'review'), '--json')).stdout);
  expect(report).toMatchObject({ ok: true, frameCount: 2, durationMs: 200, loop: true, width: 3, height: 3 });
  expect((await sharp(readFileSync(report.artifacts.gif), { animated: true }).metadata()).pages).toBe(2);
  expect(report.artifacts.frames).toHaveLength(2);
  await expect(cli('atlas-proof', config, '--out', join(dir, 'review'))).rejects.toMatchObject({ code: 1 });
});
test('proof CLI rejects unknown and missing options before creating output', async () => {
  await expect(cli('atlas-proof', config, '--out', join(dir, 'bad'), '--fps', '8')).rejects.toMatchObject({ stderr: expect.stringMatching(/Unknown atlas-proof option/) });
  await expect(cli('atlas-proof', config)).rejects.toMatchObject({ stderr: expect.stringMatching(/Usage:/) });
  expect(existsSync(join(dir, 'bad'))).toBe(false);
});
test('copied example builds two trimmed sources and proves their complete joint cycle', async () => {
  const example = join(dir, 'example'); cpSync(resolve('examples/atlas-proof'), example, { recursive: true });
  for (const name of ['base', 'overlay']) {
    const built = JSON.parse((await cli('build', join(example, `${name}-project.json`), '--json')).stdout);
    expect(built.ok, JSON.stringify(built.errors)).toBe(true);
  }
  const report = JSON.parse((await cli('atlas-proof', join(example, 'proof.json'), '--out', join(example, 'review'), '--json')).stdout);
  expect(report.durationMs).toBe(1500);
  expect(report.frameCount).toBeGreaterThan(12);
  expect(report.gif.pixelComparison.exact).toBe(true);
}, 20000);
