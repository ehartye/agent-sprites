import { previewSequences } from '../web/public/js/preview-sequences.js';
import { durationFromFps } from '../web/public/js/shared/timing.js';

/** Plan terminal playback from the same portable metadata used by the browser. */
export function buildTerminalPlaybackPlan(project, group, { fps, loops } = {}) {
  if (fps !== undefined) durationFromFps(fps);
  if (loops !== undefined && (!Number.isSafeInteger(loops) || loops < 0)) throw new Error('Animation loops must be a nonnegative safe integer (0 means infinite)');
  if (!Object.hasOwn(project.groups ?? {}, group) || !project.groups[group].length) throw new Error(`Group "${group}" not found or empty`);
  const source = fps === undefined ? project : { ...project, animationFps: { ...project.animationFps, [group]: fps } };
  const option = previewSequences(source).find(option => option.group === group);
  const durationMs = option.durations.reduce((total, ms) => total + ms, 0);
  if (!Number.isSafeInteger(durationMs)) throw new Error('Animation duration exceeds safe integer milliseconds');
  return { ...option, durationMs, loops: loops ?? (option.loop ? 3 : 1) };
}

/** Node clamps overflowing timer delays to 1 ms; long holds must be chunked. */
export async function waitForFrame(ms, sleep = delay => new Promise(resolve => setTimeout(resolve, delay))) {
  if (!Number.isSafeInteger(ms) || ms < 1) throw new Error('Frame duration must be positive safe-integer milliseconds');
  let remaining = ms;
  while (remaining > 0) {
    const delay = Math.min(remaining, 2147483647);
    await sleep(delay);
    remaining -= delay;
  }
}
