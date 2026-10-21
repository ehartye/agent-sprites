import { expect, test } from 'vitest';
import { buildTerminalPlaybackPlan, waitForFrame } from '../../server/engine/animation-playback.js';

const project = {
  grid: { rows: 1, cols: 3 }, cells: {},
  groups: { walk: ['0,0', '0,1', '0,2', '0,1'] },
  animationDirections: { walk: 'reverse' }, animationFps: { walk: 20 }, animationLoops: { walk: false },
  frameDurations: { '0,1': 17 },
};

test('terminal playback plan reuses canonical preview order, repeated holds, timing and loop metadata', () => {
  const plan = buildTerminalPlaybackPlan(project, 'walk');
  expect(plan).toMatchObject({ frames: ['0,1', '0,2', '0,1', '0,0'], durations: [17, 50, 17, 50], durationMs: 134, loop: false, loops: 1 });
  expect(buildTerminalPlaybackPlan(project, 'walk', { fps: 10, loops: 2 })).toMatchObject({ durations: [17, 100, 17, 100], loops: 2 });
  expect(buildTerminalPlaybackPlan({ ...project, animationLoops: {} }, 'walk').loops).toBe(3);
  expect(buildTerminalPlaybackPlan(project, 'walk', { loops: 0 }).loops).toBe(0);
  expect(project.animationFps.walk).toBe(20);
});

test('terminal plan rejects invalid rates, loop counts, unknown prototype groups and unsafe cumulative duration', () => {
  for (const fps of [0, -1, Infinity, NaN, 5000, 1e-20]) expect(() => buildTerminalPlaybackPlan(project, 'walk', { fps })).toThrow();
  for (const loops of [-1, 1.5, Infinity, NaN, '1', Number.MAX_SAFE_INTEGER + 1]) expect(() => buildTerminalPlaybackPlan(project, 'walk', { loops })).toThrow();
  expect(() => buildTerminalPlaybackPlan(project, 'constructor')).toThrow(/not found/);
  expect(() => buildTerminalPlaybackPlan({ ...project, frameDurations: { '0,1': Number.MAX_SAFE_INTEGER } }, 'walk')).toThrow(/safe integer/);
});

test('long frame waits are split at the Node timer limit rather than becoming one-millisecond timers', async () => {
  const chunks = [];
  await waitForFrame(2147483650, async ms => { chunks.push(ms); });
  expect(chunks).toEqual([2147483647, 3]);
});
