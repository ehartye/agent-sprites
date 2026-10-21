import { test, expect } from 'vitest';
import { resolveFrameDurationMs, validateFrameDurations } from '../../server/web/public/js/shared/timing.js';
import { Project } from '../../server/engine/project.js';

test('explicit cell milliseconds own timing across groups, base frames and named aliases', () => {
  const project = Project.create({ name: 'timing', cellSize: 8, rows: 1, cols: 2, palette: 'pico8' });
  project.cells.getCell('0,0').name = 'first'; project.frameDurations = { '0,0': 75 };
  project.groups.create('slow', ['0,0','0,1']); project.groups.create('fast', ['0,0','0,1']);
  project.animationFps = { slow: 4, fast: 10 };
  expect(resolveFrameDurationMs(project, '0,0', { group: 'slow' })).toBe(75);
  expect(resolveFrameDurationMs(project, '0,1', { group: 'slow' })).toBe(250);
  expect(resolveFrameDurationMs(project, '0,1', { group: 'fast' })).toBe(100);
  const atlas = project.exportAseprite({ imageName: 'timing.png' });
  expect(atlas.frames.map(f => f.duration)).toEqual([75,125,75,250,75,100,75]);
  expect(Project.fromJSON(project.toJSON()).frameDurations).toEqual({ '0,0': 75 });
});
test('timing maps reject unknown cells, explicit null and invalid or unrepresentable durations', () => {
  const project = { grid: { rows: 1, cols: 2 }, frameDurations: {}, animationFps: {} };
  for (const map of [null, [], { '0,2': 50 }, { '00,0': 50 }, { '0,0': 0 }, { '0,0': 1.5 }, { '0,0': Number.MAX_SAFE_INTEGER + 1 }]) expect(() => validateFrameDurations(map, project)).toThrow();
  expect(resolveFrameDurationMs(project, '0,0')).toBe(125);
  expect(() => resolveFrameDurationMs({ ...project, animationFps: { fast: 5000 } }, '0,0', { group: 'fast' })).toThrow(/duration|millisecond/i);
});
test('explicit one-shot group behavior survives serialization and owned atlas metadata', () => {
  const project = Project.create({ name: 'one-shot', cellSize: 8, rows: 1, cols: 2 });
  project.groups.create('scene', ['0,0','0,1']); project.animationLoops = { scene: false };
  const restored = Project.fromJSON(project.toJSON());
  expect(restored.animationLoops.scene).toBe(false);
  expect(restored.exportAseprite({ imageName: 'once.png' }).meta.frameTags[0].loop).toBe(false);
});
