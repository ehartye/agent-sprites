import { describe, expect, it } from 'vitest';
import { drawHumanoidHead, EXPRESSION_NAMES } from '../../server/authoring/humanoid-face.js';

const colors = { skin: '#805039', skinLight: '#a46a48', skinShade: '#533328', hair: '#363343', hairLight: '#696579', outline: '#242436', iris: '#587f77' };
const hairs = ['short', 'bun', 'bob', 'waves', 'puffs', 'tousled'];
function draw(options = {}) {
  const ops = [];
  const pen = Object.fromEntries(['rect', 'poly', 'line', 'ellipse'].map(type => [type, (name, ...args) => ops.push({ type, name, args })]));
  const result = drawHumanoidHead(pen, { cx: 20, top: 12, headSize: 16, direction: 'down', hair: 'short', expression: 'neutral', colors, hood: false, ...options });
  return { ops, ...result };
}
function extent({ type, args }) {
  if (type === 'rect') return [args[0], args[1], args[0] + args[2] - 1, args[1] + args[3] - 1];
  if (type === 'line') return [Math.min(args[0], args[2]), Math.min(args[1], args[3]), Math.max(args[0], args[2]), Math.max(args[1], args[3])];
  if (type === 'ellipse') return [args[0] - args[2], args[1] - args[3], args[0] + args[2], args[1] + args[3]];
  return [Math.min(...args[0].map(p => p[0])), Math.min(...args[0].map(p => p[1])), Math.max(...args[0].map(p => p[0])), Math.max(...args[0].map(p => p[1]))];
}

describe('reusable humanoid face', () => {
  it('draws compact independently named eye layers with anatomical sides', () => {
    for (const headSize of [14, 15, 16]) {
      const { ops } = draw({ headSize });
      for (const side of ['right', 'left']) {
        for (const layer of ['sclera', 'iris', 'pupil', 'catchlight', 'upper_lid', 'brow']) {
          expect(ops.find(op => op.name === `${side}_eye_${layer}`)).toBeDefined();
        }
        const sclera = ops.find(op => op.name === `${side}_eye_sclera`);
        expect(sclera.args[2]).toBeGreaterThanOrEqual(3);
        expect(sclera.args[2]).toBeLessThanOrEqual(4);
        expect(sclera.args[3]).toBeLessThanOrEqual(3);
      }
      expect(ops.find(op => op.name === 'right_eye_sclera').args[0]).toBeLessThan(ops.find(op => op.name === 'left_eye_sclera').args[0]);
      expect(ops.find(op => op.name === 'right_ear').args[0]).toBeLessThan(ops.find(op => op.name === 'left_ear').args[0]);
    }
  });

  it('uses the face highlight color when lids occlude eyes on dark skin', () => {
    for (const expression of ['half_blink', 'tired', 'worried']) {
      const { ops } = draw({ expression });
      const covers = ops.filter(op => /lowered_lid|outer_lid_drop/.test(op.name));
      expect(covers.length).toBeGreaterThan(0);
      for (const cover of covers) expect(cover.args.at(-1)).toBe(colors.skinLight);
    }
  });

  it('has a distinct face for every expression and keeps a quiet chin row', () => {
    const signatures = EXPRESSION_NAMES.map(expression => {
      const { ops, chinY } = draw({ expression });
      const features = ops.filter(op => /eye|mouth|nose/.test(op.name));
      for (const op of features) expect(extent(op)[3]).toBeLessThan(chinY);
      return JSON.stringify(features);
    });
    expect(new Set(signatures).size).toBe(8);
  });

  it('uses only the visible right eye in profile and no eyes on the back', () => {
    const profile = draw({ direction: 'right' }).ops;
    expect(profile.some(op => op.name === 'right_eye_sclera')).toBe(true);
    expect(profile.some(op => op.name.startsWith('left_eye'))).toBe(false);
    const back = draw({ direction: 'up' }).ops;
    expect(back.some(op => /eye|mouth|nose/.test(op.name))).toBe(false);
    expect(back.find(op => op.name === 'left_ear').args[0]).toBeLessThan(back.find(op => op.name === 'right_ear').args[0]);
  });

  it('gives each uncovered hairstyle distinct geometry', () => {
    const signatures = hairs.map(hair => JSON.stringify(draw({ hair }).ops.filter(op => op.name.startsWith('hair')).map(({ type, args }) => ({ type, args }))));
    expect(new Set(signatures).size).toBe(hairs.length);
  });

  it('keeps small-head worried brows clear of the fringe', () => {
    for (const hair of hairs) {
      const { ops } = draw({ headSize: 14, hair, expression: 'worried' });
      const fringeBottom = extent(ops.find(op => op.name === 'hair_fringe'))[3];
      for (const brow of ops.filter(op => op.name.endsWith('_brow'))) {
        expect(extent(brow)[1]).toBeGreaterThan(fringeBottom);
      }
    }
  });

  it('contains all geometry within the declared head envelope plus the allowed hair allowance', () => {
    for (const headSize of [14, 15, 16]) for (const direction of ['down', 'right', 'up']) for (const hair of hairs) for (const hood of [false, true]) for (const expression of EXPRESSION_NAMES) {
      const { ops, bounds } = draw({ headSize, direction, hair, hood, expression });
      expect(bounds).toEqual({ left: 20 - Math.floor(headSize / 2), top: 12, right: 20 - Math.floor(headSize / 2) + headSize - 1, bottom: 12 + headSize - 1 });
      for (const op of ops) {
        const [left, top, right, bottom] = extent(op);
        const allowance = !hood && op.name.startsWith('hair') ? 3 : 0;
        expect(left, op.name).toBeGreaterThanOrEqual(bounds.left - allowance);
        expect(top, op.name).toBeGreaterThanOrEqual(bounds.top - allowance);
        expect(right, op.name).toBeLessThanOrEqual(bounds.right + allowance);
        expect(bottom, op.name).toBeLessThanOrEqual(bounds.bottom);
      }
      expect(new Set(ops.map(op => op.name)).size).toBe(ops.length);
    }
  });
});
