// Named 20×20 cells covering every primitive, pattern and flag the renderers draw.
// Shared by the raster parity test; `opaque` marks entries without translucent colours.
const S = (type, params, color, zIndex = 0) => ({ type, params, color, visible: true, zIndex });
const TRI = [{ x: 2, y: 1 }, { x: 18, y: 6 }, { x: 5, y: 18 }];
const STAR = [{ x: 10, y: 0 }, { x: 13, y: 19 }, { x: 0, y: 7 }, { x: 19, y: 7 }, { x: 6, y: 19 }];
const FRAC = [{ x: 1.4, y: 1.5 }, { x: 17.6, y: 3.2 }, { x: 9.5, y: 16.5 }];

export const CELL = 20;
export const CORPUS = [];
for (const [tag, color] of [['opaque', '#3a7bd5'], ['alpha', '#c8282880']]) {
  const add = (name, shapes) => CORPUS.push({ name: `${name}-${tag}`, opaque: tag === 'opaque', shapes });
  for (const r of [0, 1, 2, 3, 5, 8]) for (const filled of [true, false]) add(`circle-${r}-${filled}`, [S('circle', { cx: 10, cy: 10, r, filled }, color)]);
  for (const [rx, ry] of [[1, 1], [2, 1], [1, 3], [4, 2], [6, 3], [3, 7], [8, 8]]) for (const filled of [true, false]) add(`ellipse-${rx}x${ry}-${filled}`, [S('ellipse', { cx: 10, cy: 10, rx, ry, filled }, color)]);
  for (const filled of [true, false]) add(`rect-${filled}`, [S('rect', { x: 2, y: 3, w: 9, h: 6, filled }, color)]);
  add('rect-1x1', [S('rect', { x: 2, y: 3, w: 1, h: 1, filled: false }, color)]);
  for (const [x1, y1, x2, y2] of [[0, 0, 19, 7], [19, 2, 1, 15], [5, 5, 5, 5], [3, 18, 17, 1], [0, 10, 19, 10]]) add(`line-${x1}-${y1}-${x2}-${y2}`, [S('line', { x1, y1, x2, y2 }, color)]);
  add('line-frac', [S('line', { x1: 0.4, y1: 1.6, x2: 12.5, y2: 7.49 }, color)]);
  for (const [name, points] of [['tri', TRI], ['star', STAR], ['frac', FRAC]]) {
    for (const filled of [true, false]) add(`polygon-${name}-${filled}`, [S('polygon', { points, filled }, color)]);
    add(`polyline-${name}`, [S('polyline', { points }, color)]);
  }
  for (const pattern of ['checker', 'stripes', 'sparse', 'scatter']) {
    const pat = { pattern, color2: '#f0c040' };
    add(`pattern-rect-${pattern}`, [S('rect', { x: 1, y: 1, w: 15, h: 11, filled: true, ...pat }, color)]);
    add(`pattern-circle-${pattern}`, [S('circle', { cx: 10, cy: 10, r: 7, filled: true, ...pat }, color)]);
    add(`pattern-ellipse-${pattern}`, [S('ellipse', { cx: 10, cy: 10, rx: 8, ry: 5, filled: true, ...pat }, color)]);
    add(`pattern-polygon-${pattern}`, [S('polygon', { points: STAR, filled: true, ...pat }, color)]);
    add(`pattern-outline-${pattern}`, [S('circle', { cx: 10, cy: 10, r: 7, filled: false, ...pat }, color)]);
  }
  add('fill-in-ring', [S('circle', { cx: 10, cy: 10, r: 6, filled: false }, '#222222'), S('fill', { x: 10, y: 10 }, color, 1)]);
  add('fill-background', [S('rect', { x: 4, y: 4, w: 8, h: 8, filled: false }, '#222222'), S('fill', { x: 0, y: 0 }, color, 1)]);
  add('erase', [S('rect', { x: 0, y: 0, w: 20, h: 20, filled: true }, color), S('circle', { cx: 10, cy: 10, r: 4, filled: true, erase: true }, '#000000', 1), S('line', { x1: 0, y1: 19, x2: 19, y2: 0, erase: true }, '#000000', 2), S('point', { x: 10, y: 10 }, '#ffffff', 3)]);
  add('points', [0, 1, 2, 3].map(i => S('point', { x: i * 5, y: 19 - i * 6 }, color, i)));
  add('mixed', [S('ellipse', { cx: 10, cy: 12, rx: 7, ry: 5, filled: true }, '#556b2f'), S('ellipse', { cx: 10, cy: 12, rx: 7, ry: 5, filled: false }, '#222222', 1), S('circle', { cx: 7, cy: 7, r: 2, filled: true }, color, 2), S('polygon', { points: TRI, filled: false }, color, 3), S('fill', { x: 1, y: 1 }, '#aaccee', 4)]);
}
