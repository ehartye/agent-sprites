import { readFileSync } from "node:fs";
export const C = JSON.parse(
  readFileSync(new URL("./palette.json", import.meta.url), "utf8"),
);
export const flat = { normal: { mode: "flat" } };
export const unlit = { normal: { mode: "flat" }, material: { unlit: true } };
export const fur = {
  normal: { mode: "dome", depth: 1.2 },
  material: { solid: true },
};
export const soft = { normal: { mode: "dome", depth: 0.8 } };
export const bevel = {
  normal: { mode: "bevel", width: 2, depth: 0.65 },
  material: { solid: true },
};
export const pt = ([x, y]) => ({ x: Math.round(x), y: Math.round(y) });
export const poly = (name, color, points, surface = flat) => ({
  name,
  type: "polygon",
  color: C[color] ?? color,
  params: { points: points.map(pt), filled: true, surface },
});
export const line = (name, color, points, surface = flat) => ({
  name,
  type: "polyline",
  color: C[color] ?? color,
  params: { points: points.map(pt), surface },
});
export const rect = (name, color, x, y, w, h, surface = flat) => ({
  name,
  type: "rect",
  color: C[color] ?? color,
  params: {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
    filled: true,
    surface,
  },
});
export const oval = (cx, cy, rx, ry, n = 36) =>
  Array.from({ length: n }, (_, i) => [
    cx + Math.cos((i * Math.PI * 2) / n) * rx,
    cy + Math.sin((i * Math.PI * 2) / n) * ry,
  ]);
export const ellipse = (name, color, cx, cy, rx, ry, surface = flat) =>
  poly(name, color, oval(cx, cy, rx, ry), surface);
export const mix = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
export const ribbon = (points, width) => {
  const edge = points.map(([x, y], i) => {
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)],
      d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1,
      w = typeof width === "number" ? width : width[i];
    return [(-(b[1] - a[1]) * w) / (2 * d), ((b[0] - a[0]) * w) / (2 * d)];
  });
  return points
    .map(([x, y], i) => [x + edge[i][0], y + edge[i][1]])
    .concat(
      points.map(([x, y], i) => [x - edge[i][0], y - edge[i][1]]).reverse(),
    );
};
export function bezier(points, steps = 20) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps,
      u = 1 - t;
    return [
      u * u * u * points[0][0] +
        3 * u * u * t * points[1][0] +
        3 * u * t * t * points[2][0] +
        t * t * t * points[3][0],
      u * u * u * points[0][1] +
        3 * u * u * t * points[1][1] +
        3 * u * t * t * points[2][1] +
        t * t * t * points[3][1],
    ];
  });
}
// Convex clipping happens in the anatomical local space BEFORE the articulated
// pose transform. Thus every stripe remains contained even while the cat rolls.
export function clipPolygon(subject, clip) {
  let output = subject;
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i],
      b = clip[(i + 1) % clip.length],
      input = output;
    output = [];
    const side = (p) =>
      (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const intersection = (s, e) => {
      const d1 = side(s),
        d2 = side(e),
        t = d1 / (d1 - d2);
      return [mix(s[0], e[0], t), mix(s[1], e[1], t)];
    };
    for (let j = 0; j < input.length; j++) {
      const e = input[j],
        s = input[(j + input.length - 1) % input.length],
        ei = side(e) >= -0.0001,
        si = side(s) >= -0.0001;
      if (ei) {
        if (!si) output.push(intersection(s, e));
        output.push(e);
      } else if (si) output.push(intersection(s, e));
    }
    if (!output.length) break;
  }
  return output;
}
export const hashNoise = (a, b = 0) => {
  let n = (a * 374761393 + b * 668265263) >>> 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
