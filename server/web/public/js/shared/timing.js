/** One timing policy for editable cells, groups, browser playback and exports. */
function coordinates(project, cellRef) {
  const match = typeof cellRef === 'string' && cellRef.match(/^(0|[1-9]\d*),(0|[1-9]\d*)$/);
  const rows = project.cells?.rows ?? project.grid?.rows, cols = project.cells?.cols ?? project.grid?.cols;
  if (!Number.isSafeInteger(rows) || rows < 1 || !Number.isSafeInteger(cols) || cols < 1 || !match || Number(match[1]) >= rows || Number(match[2]) >= cols || !Number.isSafeInteger(Number(match[1])) || !Number.isSafeInteger(Number(match[2]))) throw new Error(`Unknown timing cell: ${cellRef}`);
}
function milliseconds(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Frame duration must be positive safe-integer milliseconds');
  return value;
}
export function validateFrameDurations(value, project) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('frameDurations must map cells to milliseconds');
  const result = {};
  for (const [cellRef, ms] of Object.entries(value)) { coordinates(project, cellRef); result[cellRef] = milliseconds(ms); }
  return result;
}
export function validateAnimationLoops(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.entries(value).some(([name, loop]) => !name.length || typeof loop !== 'boolean')) throw new Error('animationLoops must map group names to booleans');
  return Object.fromEntries(Object.entries(value));
}
export function resolveAnimationLoop(project, group) {
  return group !== undefined && Object.hasOwn(project.animationLoops ?? {}, group) ? project.animationLoops[group] : true;
}
export const ANIMATION_DIRECTIONS = Object.freeze(['forward', 'reverse', 'pingpong', 'pingpong_reverse']);
export function resolveAnimationDirection(project, group, directionMap = project.animationDirections ?? {}) {
  return group !== undefined && Object.hasOwn(directionMap, group) ? directionMap[group] : 'forward';
}
export function resolveGroupFps(project, group, { defaultFps = 8, fpsMap = project.animationFps ?? {} } = {}) {
  return group !== undefined && Object.hasOwn(fpsMap, group) ? fpsMap[group] : defaultFps;
}
export function durationFromFps(fps) {
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('Animation FPS must be positive and finite');
  return milliseconds(Math.round(1000 / fps));
}
export function validateAnimationFps(value) {
  if(value===undefined)return {};
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('animationFps must map group names to positive FPS');
  for(const [name,fps] of Object.entries(value)) {
    if(!name.length)throw new Error('Animation FPS requires a group name');
    durationFromFps(fps);
  }
  return Object.fromEntries(Object.entries(value));
}
export function resolveFrameTiming(project, cellRef, { group, defaultFps = 8, fpsMap = project.animationFps ?? {} } = {}) {
  coordinates(project, cellRef);
  if (Object.hasOwn(project.frameDurations ?? {}, cellRef)) return { ms: milliseconds(project.frameDurations[cellRef]), source: 'frame' };
  const fromGroup = group !== undefined && Object.hasOwn(fpsMap, group);
  const fps = resolveGroupFps(project, group, { defaultFps, fpsMap });
  return { ms: durationFromFps(fps), source: fromGroup ? 'group' : 'default', fps };
}
export function resolveFrameDurationMs(project, cellRef, options) { return resolveFrameTiming(project, cellRef, options).ms; }
