// State marks for the `tileset` recipe: the repetitive frame families a game would otherwise generate with a script.
//
//   @pips <prefix> count=<n> pip=<w>x<h> [gap=<n>] [x= y=] lit=<char|#hex> empty=<char|#hex> [outline|outline=#hex]
//       a row of count pips, one frame per fill level: <prefix>_0 .. <prefix>_<count> has that many pips lit from the
//       left. The row is centred in the cell unless x= places its left edge. Draw it over a prop (a trough, a battery).
//   @cracks <prefix> stages=<n> [seed=<n>] dark=<char|#hex> light=<char|#hex>
//       cumulative damage overlays <prefix>_1 .. <prefix>_<stages> on a transparent cell: each stage keeps the last stage's
//       cracks and grows or adds more, so a wall visibly gets worse. A crack is one dark pixel with a light pixel on its
//       lower right (it reads on any material). Deterministic for a seed, hard alpha, nothing touches the cell border
//       except where a crack runs off it, so overlays stack on any tile.
const grid = (w, h) => Array.from({length: h}, () => Array(w).fill(null));

/** count+1 grids of 'lit' | 'empty' | null, the row of pips with 0..count lit. */
export function pipFrames({cellW, cellH, count, pipW, pipH, gap = 1, x, y = 1}) {
  for (const [k, v] of Object.entries({count, pipW, pipH})) if (!Number.isInteger(v) || v < 1) throw Error(`@pips ${k === 'count' ? 'count=' : 'pip='} must be a positive integer${k === 'count' ? '' : ' size (<w>x<h>)'}.`);
  if (!Number.isInteger(gap) || gap < 0) throw Error('@pips gap= must be a non-negative integer.');
  const width = count * pipW + (count - 1) * gap, left = x ?? Math.floor((cellW - width) / 2);
  if (!Number.isInteger(left) || !Number.isInteger(y) || left < 0 || y < 0 || left + width > cellW || y + pipH > cellH) throw Error(`@pips: a row of ${count} pips (${width}x${pipH}) at ${left},${y} does not fit a ${cellW}x${cellH} cell.`);
  return Array.from({length: count + 1}, (_, lit) => {
    const g = grid(cellW, cellH);
    for (let p = 0; p < count; p++) for (let dy = 0; dy < pipH; dy++) for (let dx = 0; dx < pipW; dx++) g[y + dy][left + p * (pipW + gap) + dx] = p < lit ? 'lit' : 'empty';
    return g;
  });
}

// mulberry32: a tiny seeded generator, so a seed always gives the same cracks.
function rng(seed) { let a = (seed + 0x9e3779b9) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function line(a, b) {
  const pts = []; let [x, y] = a; const dx = Math.abs(b[0] - x), dy = -Math.abs(b[1] - y), sx = x < b[0] ? 1 : -1, sy = y < b[1] ? 1 : -1;
  let err = dx + dy;
  for (;;) { pts.push([x, y]); if (x === b[0] && y === b[1]) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x += sx; } if (e2 <= dx) { err += dx; y += sy; } }
  return pts;
}

/** 'dark' | 'light' | null grids for stage 1..stages. */
export function crackFrames({cellW, cellH, stages, seed = 0}) {
  if (!Number.isInteger(stages) || stages < 1 || stages > 8) throw Error('@cracks stages= must be an integer from 1 to 8.');
  if (!Number.isInteger(seed) || seed < 0) throw Error('@cracks seed= must be a non-negative integer.');
  const random = rng(seed), inside = ([x, y]) => x >= 0 && y >= 0 && x < cellW && y < cellH;
  // a stroke is a list of corner points; it appears at `from` (1-based stage) and has grown to its full length by the last stage
  const walk = (start, dir, steps) => {
    const pts = [start]; let [x, y] = start;
    for (let i = 0; i < steps; i++) {
      x += dir[0] * (1 + (random() < .4 ? 1 : 0)) + (random() < .5 ? (random() < .5 ? -1 : 1) : 0);
      y += dir[1] * (1 + (random() < .5 ? 1 : 0));
      pts.push([Math.max(0, Math.min(cellW - 1, x)), Math.max(0, Math.min(cellH - 1, y))]);
    }
    return pts;
  };
  const strokes = [];
  const main = walk([2 + Math.floor(random() * (cellW - 4)), 0], [0, 1], Math.max(4, Math.round(cellH / 2.2)));
  strokes.push({from: 1, pts: main});
  for (let s = 2; s <= stages; s++) {
    const count = s === 2 ? 1 : 2;
    for (let c = 0; c < count; c++) {
      const base = strokes[Math.floor(random() * strokes.length)].pts, at = base[1 + Math.floor(random() * (base.length - 1))];
      strokes.push({from: s, pts: walk(at, [random() < .5 ? -1 : 1, 1], 2 + Math.floor(random() * 3))});
    }
  }
  return Array.from({length: stages}, (_, k) => {
    const stage = k + 1, dark = new Set(), g = grid(cellW, cellH);
    for (const {from, pts} of strokes) {
      if (from > stage) continue;
      const shown = from === 1 && stages > 1 ? Math.max(2, Math.ceil(pts.length * (.5 + .5 * (stage - 1) / (stages - 1)))) : Math.max(2, Math.ceil(pts.length * Math.min(1, (stage - from + 1) / Math.max(1, stages - from + 1))));
      const part = pts.slice(0, Math.min(pts.length, shown));
      for (let i = 0; i + 1 < part.length; i++) for (const p of line(part[i], part[i + 1])) if (inside(p)) dark.add(`${p[0]},${p[1]}`);
    }
    for (const key of dark) { const [x, y] = key.split(',').map(Number); if (x + 1 < cellW && y + 1 < cellH && !dark.has(`${x + 1},${y + 1}`)) g[y + 1][x + 1] = 'light'; }
    for (const key of dark) { const [x, y] = key.split(',').map(Number); g[y][x] = 'dark'; }
    return g;
  });
}
