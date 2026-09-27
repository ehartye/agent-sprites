import { test, expect } from 'vitest';
import { generateCharacterRecipe } from '../../server/authoring/character.js';
import { bodySideRole } from '../../server/authoring/humanoid-poses.js';
import { attachmentFor } from '../../server/build/playback-runtime.mjs';

const frames = (person, mode = 'idle') => generateCharacterRecipe({ people: [person], mode, directions: ['down', 'right', 'up', 'left'] }).report.frames;
const byDir = (list, d) => list.filter(f => f.direction === d);

test('each body side keeps its anatomical identity and gets a facing-derived role', () => {
  expect(['down', 'right', 'up', 'left'].map(d => [bodySideRole('right', d), bodySideRole('left', d)])).toEqual([
    ['front', 'front'], ['near', 'far'], ['back', 'back'], ['far', 'near'],
  ]);
});

for (const [label, person] of [['adult', { id: 'ada' }], ['child', { id: 'kit', body: 'child' }], ['four-armed', { id: 'quad', arms: 4 }]]) {
  test(`${label}: report sides point at the rig limbs with the same anatomical name in every facing and walk phase`, () => {
    for (const f of [...frames(person), ...frames(person, 'walk')]) {
      for (const side of ['left', 'right']) {
        const s = f.sides[side], arm = f.arms.find(a => a.name === side), leg = f.legs.find(l => l.name === side);
        expect(s.role).toBe(bodySideRole(side, f.direction));
        expect(s.shoulder).toEqual(arm.shoulder);
        expect(s.wrist).toEqual(arm.wrist);
        expect(s.hip).toEqual(leg.hip);
        const lower = f.arms.find(a => a.name === `${side}_lower`);
        if (person.arms === 4) expect(s.lowerWrist).toEqual(lower.wrist); else expect(s.lowerWrist).toBeUndefined();
      }
    }
  });
}

test('turning around mirrors a hand: the near hand facing right becomes the far hand facing left', () => {
  const all = frames({ id: 'ada' }), right = byDir(all, 'right')[0], left = byDir(all, 'left')[0];
  expect(right.sides.right.role).toBe('near');
  expect(left.sides.right.role).toBe('far');
  // The mirrored rig swaps labels, so the same body side sits at the mirrored depth.
  expect(left.sides.left.wrist[0]).toBe(40 - right.sides.right.wrist[0]);
  // Front and back views place the character's right hand on opposite image sides.
  const down = byDir(all, 'down')[0], up = byDir(all, 'up')[0];
  expect(down.sides.right.wrist[0]).toBeLessThan(20);
  expect(up.sides.right.wrist[0]).toBeGreaterThan(20);
});

test('attachmentFor gives gear a world point and draw layer from the declared body side', () => {
  const all = frames({ id: 'ada' }), right = byDir(all, 'right')[0], left = byDir(all, 'left')[0];
  const anchor = { x: 20, y: 54 };
  expect(attachmentFor(right, 'right', 'wrist', anchor, 100, 200, { scale: 2 })).toEqual({ x: 100 + (right.sides.right.wrist[0] - 20) * 2, y: 200 + (right.sides.right.wrist[1] - 54) * 2, role: 'near', layer: 'over-body' });
  expect(attachmentFor(left, 'right', 'hip', anchor, 0, 0)).toMatchObject({ role: 'far', layer: 'under-body' });
  expect(attachmentFor(byDir(all, 'up')[0], 'left', 'wrist', anchor, 0, 0)).toMatchObject({ role: 'back', layer: 'over-body' });
  expect(() => attachmentFor(right, 'middle', 'wrist', anchor, 0, 0)).toThrow(/side must be left or right/);
  expect(() => attachmentFor(right, 'left', 'elbow', anchor, 0, 0)).toThrow(/joint must be shoulder, wrist, hip or lowerWrist/);
});
