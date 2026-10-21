import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  mkdirSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildProject } from '../../server/build/project-build.js';
import {
  resolveBuildSource,
  snapshotBuildInputs
} from '../../server/build/build-provenance.js';
import { Project } from '../../server/engine/project.js';

let dir, configPath, childPath, config;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'animation-build-'));
  configPath = join(dir, 'build.json');
  childPath = join(dir, 'child.project.json');
  const shape = (x) => ({
    id: `s${x + 1}`,
    name: 'body',
    type: 'rect',
    params: { x, y: 0, w: 2, h: 2, filled: true },
    color: 'red',
    visible: true,
    zIndex: 0
  });
  writeFileSync(
    childPath,
    JSON.stringify({
      version: 1,
      name: 'child',
      cellWidth: 4,
      cellHeight: 4,
      grid: { rows: 1, cols: 2 },
      palette: [{ name: 'red', color: '#f00' }],
      cells: {
        '0,0': { name: 'first', shapes: [shape(0)] },
        '0,1': { name: 'second', shapes: [shape(1)] }
      },
      groups: { walk: ['0,0', '0,1'] },
      frameDurations: { '0,0': 70, '0,1': 130 },
      animationFps: { walk: 5 }
    })
  );
  config = {
    version: 1,
    output: 'dist',
    animation: {
      name: 'scene',
      size: 8,
      palette: 'pico8',
      parts: {
        child: { project: 'child.project.json', group: 'walk', loop: false }
      },
      placements: [{ kind: 'stamp', name: 'left', part: 'child', x: 1, y: 1 }]
    },
    expectedTags: ['scene']
  };
  writeFileSync(configPath, JSON.stringify(config));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('animation build sources automatically hash portable source projects', () => {
  const source = resolveBuildSource(configPath, config);
  expect(source).toMatchObject({
    sourceKind: 'animation',
    inline: true,
    source: configPath
  });
  const provenance = snapshotBuildInputs(configPath, config, configPath, {
    version: 'test'
  });
  expect(provenance.inputs).toContainEqual({
    path: 'child.project.json',
    sha256: createHash('sha256').update(readFileSync(childPath)).digest('hex')
  });
  expect(() =>
    resolveBuildSource(configPath, { ...config, ops: 'ops.json' })
  ).toThrow(/exactly one/);
});

test('publishes editable timed animation, source report and integrity inventory', async () => {
  const before = readFileSync(childPath),
    result = await buildProject(configPath);
  expect(result.errors).toEqual([]);
  expect(result.ok).toBe(true);
  const project = JSON.parse(readFileSync(result.artifacts.project, 'utf8')),
    atlas = JSON.parse(readFileSync(result.artifacts.atlas, 'utf8')),
    report = JSON.parse(readFileSync(result.artifacts.animationReport, 'utf8')),
    manifest = JSON.parse(readFileSync(result.artifacts.manifest, 'utf8'));
  expect(project.frameDurations).toEqual({ '0,0': 70, '0,1': 130 });
  expect(project.animationLoops.scene).toBe(false);
  expect(project.cells['0,0'].shapes[0]).toMatchObject({
    name: 'scene:left:body',
    type: 'rect',
    params: { layers: [{ x: 1, y: 1, w: 4, h: 4 }] }
  });
  const tag = atlas.meta.frameTags.find((tag) => tag.name === 'scene');
  expect(
    atlas.frames.slice(tag.from, tag.to + 1).map((f) => f.duration)
  ).toEqual([70, 130]);
  expect(tag.loop).toBe(false);
  expect(report.kind).toBe('animation');
  expect(manifest).toMatchObject({
    source: 'animation',
    kind: 'animation',
    report: 'animation-report.json',
    files: { animationReport: 'animation-report.json' }
  });
  expect(manifest.build.inputs.map((i) => i.path)).toContain(
    'child.project.json'
  );
  expect(manifest.integrity['animation-report.json']).toBeDefined();
  expect(readFileSync(childPath)).toEqual(before);
});

test('rejects output containing an automatic source input before creating or replacing output', async () => {
  mkdirSync(join(dir, 'dist'));
  writeFileSync(
    join(dir, 'dist', 'child.project.json'),
    readFileSync(childPath)
  );
  config.animation.parts.child.project = 'dist/child.project.json';
  writeFileSync(configPath, JSON.stringify(config));
  const result = await buildProject(configPath);
  expect(result.ok).toBe(false);
  expect(result.errors[0].message).toMatch(/contain.*input|contain.*source/);
  expect(existsSync(join(dir, 'scene.png'))).toBe(false);
});

test('rejects child sources changed after generation and preserves the last publication', async () => {
  const first = await buildProject(configPath);
  expect(first.ok).toBe(true);
  const previous = readFileSync(first.artifacts.project),
    original = Project.create;
  const create = vi
    .spyOn(Project, 'create')
    .mockImplementationOnce(function (options) {
      const child = JSON.parse(readFileSync(childPath, 'utf8'));
      child.cells['0,0'].shapes[0].params.x = 3;
      writeFileSync(childPath, JSON.stringify(child));
      return original.call(this, options);
    });
  try {
    const next = await buildProject(configPath);
    expect(next.ok).toBe(false);
    expect(next.errors[0].message).toMatch(/inputs changed/);
    expect(readFileSync(first.artifacts.project)).toEqual(previous);
  } finally {
    create.mockRestore();
  }
});

test('padding cells are reported and excluded from unintended empty-art warnings', async () => {
  config.animation.parts.child = {
    project: 'child.project.json',
    frames: ['first', 'second', 'first']
  };
  writeFileSync(configPath, JSON.stringify(config));
  const result = await buildProject(configPath);
  expect(result.errors).toEqual([]);
  expect(result.ok).toBe(true);
  expect(
    JSON.parse(readFileSync(result.artifacts.animationReport, 'utf8'))
  ).toMatchObject({ count: 3, columns: 2, rows: 2, paddingCells: 1 });
  expect(result.warnings.filter((w) => w.code === 'empty-frame')).toEqual([]);
});
