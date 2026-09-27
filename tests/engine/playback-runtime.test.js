import { describe, test, expect } from 'vitest';
import { generateCharacterRecipe } from '../../server/authoring/character.js';
import { generateEnvironmentRecipe } from '../../server/authoring/environment.js';
import { createWalker, groundAnchor, drawAtGround, facingFor, hitBounds } from '../../server/build/playback-runtime.mjs';

const CAST = [
  ['adult', { id: 'ada' }, 'casual'],
  ['child', { id: 'kit', body: 'child' }, 'casual'],
  ['suit', { id: 'sol' }, 'phase-suit'],
  ['four-armed', { id: 'quad', arms: 4 }, 'casual'],
];
const reportsFor = (person, outfit) => ['idle', 'walk'].map(mode => generateCharacterRecipe({ people: [person], outfits: [outfit], mode, directions: ['down', 'right', 'up', 'left'] }).report);

describe('grounded playback adapter', () => {
  test('facing follows dominant actual displacement; a diagonal tie keeps the current facing', () => {
    expect(facingFor(3, 1, 'down')).toBe('right');
    expect(facingFor(-1, -4, 'right')).toBe('up');
    expect(facingFor(2, 2, 'right')).toBe('right');
    expect(facingFor(2, 2, 'down')).toBe('down');
    expect(facingFor(0, 0, 'left')).toBe('left');
  });

  for (const [label, person, outfit] of CAST) {
    test(`${label}: authored-contact profile walking keeps each planted heel and toe fixed in the world`, () => {
      for (const facing of ['right', 'left']) {
        const walker = createWalker(reportsFor(person, outfit), { person: person.id, outfit, mode: 'authored-contact', facing });
        const sign = facing === 'right' ? 1 : -1, cycle = walker.gait(facing).cycleDistance;
        const planted = new Map();
        let rootX = 0, previous = null;
        for (let step = 0; step < cycle * 2; step++) {
          const s = walker.update(sign, 0);
          rootX += sign;
          expect(s.facing).toBe(facing);
          expect(s.contactsCalibrated).toBe(true);
          const frame = walker.frame(s.alias);
          for (const c of frame.locomotion.contacts) {
            const world = mark => rootX - 20 + c[mark][0] + s.offset[0];
            const key = `${c.name}`;
            if (!c.contact) { planted.delete(key); continue; }
            const prior = planted.get(key) ?? {};
            if (['heel', 'flat'].includes(c.state)) { if (prior.heel !== undefined) expect(world('heel'), `${label} ${facing} ${c.name} heel`).toBe(prior.heel); prior.heel = world('heel'); }
            else delete prior.heel;
            if (['flat', 'toe'].includes(c.state)) { if (prior.toe !== undefined) expect(world('toe'), `${label} ${facing} ${c.name} toe`).toBe(prior.toe); prior.toe = world('toe'); }
            else delete prior.toe;
            planted.set(key, prior);
          }
          previous = s;
        }
        expect(previous.moving).toBe(true);
      }
    });

    test(`${label}: stopping returns the true idle frame, not a paused walk pose`, () => {
      const walker = createWalker(reportsFor(person, outfit), { person: person.id, outfit, mode: 'continuous-root' });
      walker.update(0, 2);
      const s = walker.update(0, 0);
      expect(s).toMatchObject({ alias: `${person.id}_${outfit}_down_idle`, moving: false, offset: [0, 0] });
    });
  }

  test('continuous-root mode never offsets the body and does not claim calibrated contacts', () => {
    const walker = createWalker(reportsFor({ id: 'ada' }, 'casual'), { person: 'ada', outfit: 'casual', mode: 'continuous-root', facing: 'right' });
    for (let i = 0; i < 30; i++) expect(walker.update(1, 0)).toMatchObject({ offset: [0, 0], contactsCalibrated: false });
  });

  test('diagonal travel advances phase by facing-axis displacement, not Euclidean distance', () => {
    const walker = createWalker(reportsFor({ id: 'ada' }, 'casual'), { person: 'ada', outfit: 'casual', mode: 'authored-contact', facing: 'right' });
    const fd = walker.gait('right').frameDistance;
    let s;
    for (let i = 0; i < fd * 3; i++) s = walker.update(1, 0.9);
    expect(s.alias).toBe('ada_casual_right_walk_3');
    expect(s.distance).toBeCloseTo(fd * 3);
  });

  test('collision-resolved displacement drives the walk: a blocked axis slides, a full block idles, turning resets phase', () => {
    const walker = createWalker(reportsFor({ id: 'ada' }, 'casual'), { person: 'ada', outfit: 'casual', mode: 'authored-contact', facing: 'right' });
    for (let i = 0; i < 7; i++) walker.update(1, 0);
    // The game resolved (1, 1) against a wall to (0, 1): slide downward.
    const slide = walker.update(0, 1);
    expect(slide).toMatchObject({ facing: 'down', distance: 1, alias: 'ada_casual_down_walk_0' });
    expect(walker.update(0, 0)).toMatchObject({ moving: false, alias: 'ada_casual_down_idle' });
  });

  test('world and source scales are explicit: 2x world travel advances the same phase as 1x source travel', () => {
    const at = scale => { const w = createWalker(reportsFor({ id: 'ada' }, 'casual'), { person: 'ada', outfit: 'casual', mode: 'authored-contact', facing: 'right', scale }); let s; for (let i = 0; i < 4; i++) s = w.update(scale, 0); return s; };
    expect(at(2).alias).toBe(at(1).alias);
    expect(at(2).offset[0]).toBe(at(1).offset[0] * 2);
  });

  test('draw-at-ground places the semantic ground on the world point for characters and furniture', () => {
    const calls = [];
    const ctx = { drawImage: (...a) => calls.push(a) };
    const character = reportsFor({ id: 'ada' }, 'casual')[0];
    const atlasFrame = { frame: { x: 80, y: 0, w: 40, h: 56 } };
    expect(groundAnchor(character, character.frames[0])).toEqual({ x: 20, y: 54 });
    drawAtGround(ctx, 'img', atlasFrame, groundAnchor(character, character.frames[0]), 100, 200, { scale: 2, offset: [-3, 0] });
    expect(calls[0]).toEqual(['img', 80, 0, 40, 56, 100 - 40 - 3, 200 - 108, 80, 112]);
    const furniture = generateEnvironmentRecipe({ name: 'f', kind: 'furniture' }).report;
    expect(groundAnchor(furniture, furniture.frames[0])).toEqual({ x: 32, y: 62 });
  });

  test('visual hit bounds come from frame bounds and stay separate from the ground point', () => {
    const character = reportsFor({ id: 'ada' }, 'casual')[0], frame = character.frames[0];
    const box = hitBounds(frame, groundAnchor(character, frame), 100, 200, { scale: 2 });
    expect(box).toEqual({ x: 100 + (frame.bounds.left - 20) * 2, y: 200 + (frame.bounds.top - 54) * 2, w: (frame.bounds.right - frame.bounds.left + 1) * 2, h: (frame.bounds.bottom - frame.bounds.top + 1) * 2 });
  });

  test('unknown modes and missing idle frames fail clearly', () => {
    const walk = reportsFor({ id: 'ada' }, 'casual')[1];
    expect(() => createWalker([walk], { person: 'ada', outfit: 'casual', mode: 'fast' })).toThrow(/mode must be authored-contact or continuous-root/);
    const walker = createWalker([walk], { person: 'ada', outfit: 'casual', mode: 'continuous-root' });
    expect(() => walker.update(0, 0)).toThrow(/no idle frame ada_casual_down_idle: include an idle-mode report/);
  });
});

test('draw-at-ground honors trimmed atlas offsets', () => {
  const calls = [], ctx = { drawImage: (...a) => calls.push(a) };
  drawAtGround(ctx, 'img', { frame: { x: 5, y: 7, w: 18, h: 42 }, spriteSourceSize: { x: 12, y: 13, w: 18, h: 42 } }, { x: 20, y: 54 }, 100, 200, { scale: 2 });
  expect(calls[0]).toEqual(['img', 5, 7, 18, 42, 100 - 40 + 24, 200 - 108 + 26, 36, 84]);
});
