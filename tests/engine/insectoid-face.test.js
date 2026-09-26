import { describe, expect, it } from 'vitest';
import { drawInsectoidHead } from '../../server/authoring/insectoid-face.js';
import { EXPRESSION_NAMES } from '../../server/authoring/humanoid-face.js';

const colors = { skin: '#277e83', skinLight: '#60bcad', skinShade: '#33446b', hair: '#263551', hairLight: '#567299', outline: '#192538', iris: '#dfa34b', signal: '#f9dc91' };
function draw(options = {}) {
  const ops = [];
  const pen = Object.fromEntries(['rect', 'poly', 'line', 'ellipse'].map(type => [type, (name, ...args) => ops.push({ type, name, args })]));
  return { ...drawInsectoidHead(pen, { colors, ...options }), ops };
}
function extent({ type, args }) {
  if (type === 'rect') return [args[0], args[1], args[0] + args[2] - 1, args[1] + args[3] - 1];
  if (type === 'line') return [Math.min(args[0], args[2]), Math.min(args[1], args[3]), Math.max(args[0], args[2]), Math.max(args[1], args[3])];
  if (type === 'ellipse') return [args[0] - args[2], args[1] - args[3], args[0] + args[2], args[1] + args[3]];
  return [Math.min(...args[0].map(p => p[0])), Math.min(...args[0].map(p => p[1])), Math.max(...args[0].map(p => p[0])), Math.max(...args[0].map(p => p[1]))];
}

describe('reusable insectoid head', () => {
  it('has broad compound eyes, independently named optical layers, and alien anatomy', () => {
    for (const headSize of [14, 15, 16]) {
      const { ops } = draw({ headSize });
      for (const side of ['right', 'left']) {
        for (const layer of ['compound', 'facet_light', 'facet_shade', 'iris', 'pupil', 'catchlight', 'upper_lid']) {
          expect(ops.find(op => op.name === `${side}_eye_${layer}`)).toBeDefined();
        }
        const e = extent(ops.find(op => op.name === `${side}_eye_compound`));
        expect(e[2] - e[0] + 1).toBeGreaterThanOrEqual(5);
        expect(e[3] - e[1] + 1).toBeGreaterThanOrEqual(5);
      }
      expect(ops.some(op => /mandible/.test(op.name))).toBe(true);
      expect(ops.some(op => /antenna/.test(op.name))).toBe(true);
      expect(ops.some(op => /hair|ear|nose|sclera/.test(op.name))).toBe(false);
      expect(draw({ headSize, hair: 'bun' }).ops).toEqual(ops);
    }
  });

  it('uses one eye in profile and only segmented shell anatomy at the back', () => {
    const profile = draw({ direction: 'right' }).ops;
    expect(profile.some(op => op.name === 'right_eye_compound')).toBe(true);
    expect(profile.some(op => op.name.startsWith('left_eye'))).toBe(false);
    const back = draw({ direction: 'up' }).ops;
    expect(back.some(op => /eye|mandible/.test(op.name))).toBe(false);
    expect(back.some(op => /chitin_back/.test(op.name))).toBe(true);
  });

  it('keeps anatomical antenna labels correct when facing away', () => {
    for(const direction of ['down','up']){
      const ops=draw({direction}).ops;
      const right=ops.find(o=>o.name==='antenna_right_stalk').args[0];
      const left=ops.find(o=>o.name==='antenna_left_stalk').args[0];
      expect(direction==='up'?right>left:right<left).toBe(true);
    }
  });

  it('changes visible geometry for all eight expressions, including profile', () => {
    for (const direction of ['down', 'right']) {
      const signatures = EXPRESSION_NAMES.map(expression => JSON.stringify(draw({ direction, expression }).ops
        .filter(op => /eye|mandible/.test(op.name)).map(({ type, args }) => ({ type, args }))));
      expect(new Set(signatures).size).toBe(EXPRESSION_NAMES.length);
    }
  });

  it('preserves fixed helmet bounds and folds all antenna geometry inside a hood', () => {
    for (const top of [8, 9, 12, 24]) for (const headSize of [14, 15, 16]) for (const direction of ['down', 'right', 'up']) for (const hood of [false, true]) for (const expression of EXPRESSION_NAMES) {
      const { ops, bounds, eyeY, chinY } = draw({ top, headSize, direction, hood, expression });
      const left = 20 - Math.floor(headSize / 2);
      expect(bounds).toEqual({ left, top, right: left + headSize - 1, bottom: top + headSize - 1 });
      expect(eyeY).toBe(top + Math.floor(headSize / 2));
      expect(chinY).toBe(bounds.bottom - 1);
      for (const op of ops) {
        const e = extent(op);
        const uncovered = !hood && /antenna/.test(op.name);
        expect(e[0], op.name).toBeGreaterThanOrEqual(bounds.left - (uncovered ? 4 : 0));
        expect(e[1], op.name).toBeGreaterThanOrEqual(bounds.top - (uncovered ? 5 : 0));
        expect(e[2], op.name).toBeLessThanOrEqual(bounds.right + (uncovered ? 4 : 0));
        expect(e[3], op.name).toBeLessThanOrEqual(bounds.bottom);
        expect(e[0]).toBeGreaterThanOrEqual(0);
        expect(e[1]).toBeGreaterThanOrEqual(0);
        expect(e[2]).toBeLessThan(40);
        expect(e[3]).toBeLessThan(56);
      }
      expect(new Set(ops.map(op => op.name)).size).toBe(ops.length);
    }
  });
});
