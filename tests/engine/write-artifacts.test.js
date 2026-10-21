import { test, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, readdirSync, unlinkSync, linkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const interception = vi.hoisted(() => ({ onRead: null }));
vi.mock('node:fs', async importOriginal => {
  const original = await importOriginal();
  return { ...original, readFileSync(path, ...args) { interception.onRead?.(path); return original.readFileSync(path, ...args); } };
});
import { writeArtifactDirectory } from '../../server/engine/write-artifacts.js';
let dir;
afterEach(() => { interception.onRead = null; if (dir) rmSync(dir, { recursive: true, force: true }); });
test('a same-byte hardlink substituted during artifact hashing blocks publication and preserves its target', () => {
  dir = mkdtempSync(join(tmpdir(), 'sprite-artifact-race-'));
  const sentinel = join(dir, 'sentinel'); writeFileSync(sentinel, 'canonical'); let swapped = false;
  interception.onRead = () => {
    if (swapped) return;
    const staging = readdirSync(dir).find(name => name.includes('staging'));
    if (!staging) return;
    const artifact = join(dir, staging, 'after.png');
    if (!existsSync(artifact)) return;
    swapped = true; unlinkSync(artifact); linkSync(sentinel, artifact);
  };
  expect(() => writeArtifactDirectory(join(dir, 'review'), { 'after.png': Buffer.from('canonical') })).toThrow(/changed|identity|artifact/i);
  expect(swapped).toBe(true); interception.onRead = null;
  expect(readFileSync(sentinel, 'utf8')).toBe('canonical'); expect(existsSync(join(dir, 'review'))).toBe(false);
});
