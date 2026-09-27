import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProject } from '../../server/build/project-build.js';

let dir, path;
const write = config => writeFileSync(path, JSON.stringify({ version: 1, output: 'dist', scale: 1, ...config }));
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sprite-manifest-')); path = join(dir, 'sprite-project.json'); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('recipe builds publish a portable manifest naming the recipe kind and every emitted file', async () => {
  write({ environment: { name: 'furnishings', kind: 'furniture', seed: 7 } });
  const result = await buildProject(path);
  expect(result.errors).toEqual([]);
  const manifest = JSON.parse(readFileSync(result.artifacts.manifest, 'utf8'));
  expect(manifest).toMatchObject({ format: 'agent-sprites-build-manifest', version: 1, name: 'furnishings', source: 'environment', kind: 'furniture', report: 'environment-report.json' });
  expect(manifest.files).toMatchObject({ sheet: 'furnishings.png', atlas: 'furnishings.atlas.json', environmentReport: 'environment-report.json' });
  // Relative names only: the manifest keeps working after the directory is copied.
  for (const file of Object.values(manifest.files)) expect(file).not.toMatch(/[\\/]/);
  expect(manifest.files.manifest).toBeUndefined();
  const moved = join(dir, 'public', 'furnishings');
  cpSync(join(dir, 'dist'), moved, { recursive: true });
  for (const file of Object.values(manifest.files)) expect(existsSync(join(moved, file))).toBe(true);
  const marker = JSON.parse(readFileSync(join(dir, 'dist', '.agent-sprites-build.json'), 'utf8'));
  expect(marker.files).toContain('sprite-manifest.json');
  // The ownership marker still permits an unchanged rebuild over its own output.
  expect((await buildProject(path)).ok).toBe(true);
}, 20000);

test('UI manifests list the runtime and font bootstrap', async () => {
  write({ ui: { name: 'ui-font', kind: 'font', characters: ' Ag' } });
  const result = await buildProject(path);
  expect(result.errors).toEqual([]);
  const manifest = JSON.parse(readFileSync(result.artifacts.manifest, 'utf8'));
  expect(manifest).toMatchObject({ source: 'ui', kind: 'font', report: 'ui-report.json' });
  expect(manifest.files).toMatchObject({ uiRuntime: 'ui-runtime.mjs', uiBoot: 'ui-boot.mjs' });
}, 20000);

test('operation builds have no recipe kind or report', async () => {
  writeFileSync(join(dir, 'ops.json'), JSON.stringify([{ command: 'new', name: 'dot', size: 8, rows: 1, cols: 1 }, { command: 'draw', type: 'point', cell: '0,0', name: 'p', x: 1, y: 1, color: '#ffffff' }]));
  write({ ops: 'ops.json' });
  const result = await buildProject(path);
  expect(result.errors).toEqual([]);
  const manifest = JSON.parse(readFileSync(result.artifacts.manifest, 'utf8'));
  expect(manifest).toMatchObject({ source: 'ops', name: 'dot' });
  expect(manifest).not.toHaveProperty('kind');
  expect(manifest).not.toHaveProperty('report');
});
