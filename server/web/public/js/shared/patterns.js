/**
 * Two-color fill patterns for filled shapes. A pattern decides, per pixel of a
 * shape's fill, whether the second color paints that pixel. Outlines are never
 * patterned. The export and the browser views both load this file, so it must
 * stay free of the DOM and of Node: pure functions only.
 */
export const PATTERNS = {
  checker: (x, y) => (x + y) % 2 === 0,          // classic 50% dither
  stripes: (x, y) => y % 2 === 0,                // horizontal 1px stripes
  sparse: (x, y) => x % 2 === 0 && y % 2 === 0,  // 25% grid dots
  scatter: (x, y) => ((x * 3 + y * 5) % 7) === 0, // ~14% scattered dots, pointillism
};

export const PATTERN_NAMES = Object.keys(PATTERNS);

export function patternTest(name) {
  const test = PATTERNS[name];
  if (!test) throw new Error(`Unknown pattern "${name}" (expected one of ${PATTERN_NAMES.join(', ')})`);
  return test;
}
