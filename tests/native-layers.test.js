import { test, expect } from 'vitest';
import { generateNativeRecipe } from '../server/authoring/native-recipe.js';
import { WARDROBE_MOTIFS, WARDROBE_MOTIF_NAMES } from '../server/authoring/native/wardrobe-motifs.mjs';
import { MOTIF_NAMES } from '../server/authoring/native/wasteland-motifs.mjs';

const KEY = { outline: '#004080', shadow: '#0060c0', base: '#0080ff', highlight: '#60b0ff' };
const draws = (ops, cell) => ops.filter(o => o.command === 'draw' && o.cell === cell);
const frames = ops => ops.filter(o => o.command === 'name');
const hair = name => ({ name, colors: { outline: KEY.outline, shadow: KEY.shadow, base: KEY.base, light: KEY.highlight } });

test('the wardrobe motifs are part of the library', () => {
  for (const n of ['hair-cropped', 'hair-short', 'hair-tied', 'hair-long', 'hair-curls', 'hair-mohawk', 'facial-stubble', 'facial-moustache', 'facial-goatee', 'facial-beard', 'goggles-up', 'overalls', 'field-jacket', 'bandolier']) {
    expect(WARDROBE_MOTIF_NAMES).toContain(n);
    expect(MOTIF_NAMES).toContain(n);
  }
});

test('every wardrobe motif draws in front, right and back, in a rectangle that stays in the cell on a bald body', () => {
  for (const name of WARDROBE_MOTIF_NAMES) {
    const dirs = new Set(WARDROBE_MOTIFS[name].parts.flatMap(p => p.directions));
    expect([...dirs].sort(), name).toEqual(['back', 'front', 'right'].filter(d => dirs.has(d)));
    expect(dirs.has('front') && dirs.has('right'), `${name} has front and right`).toBe(true);
    const { operations } = generateNativeRecipe({ name: `t-${name}`, wig: 'none', motifs: [name === 'overalls' || name === 'field-jacket' || name === 'bandolier' || name === 'goggles-up' ? name : hair(name)] });
    expect(draws(operations, frames(operations)[0].cell).length, name).toBeGreaterThan(0);
  }
});

test('native.only keeps just the named motif: the same frames and cells, nothing else drawn', () => {
  const full = generateNativeRecipe({ name: 'full', wig: 'none', actions: true, motifs: [hair('hair-long'), 'scarf'] });
  const only = generateNativeRecipe({ name: 'only', wig: 'none', actions: true, motifs: [hair('hair-long'), 'scarf'], only: ['hair-long'] });
  expect(frames(only.operations)).toEqual(frames(full.operations));
  expect(only.operations.filter(o => o.command === 'group')).toEqual(full.operations.filter(o => o.command === 'group'));
  for (const f of frames(only.operations)) {
    const names = draws(only.operations, f.cell).map(p => p.name);
    expect(names.length, f.as).toBeGreaterThan(0);
    expect(names.every(n => /^costume-\d+-hair-long-/.test(n)), f.as).toBe(true);
    // every overlay pixel is also a pixel of the full character (a later motif or an edge outline may recolour it, never move it)
    const fullAt = new Map(draws(full.operations, f.cell).map(p => [`${p.x},${p.y}`, p.color]));
    for (const p of draws(only.operations, f.cell)) expect(fullAt.get(`${p.x},${p.y}`), `${f.as} ${p.x},${p.y}`).toBeDefined();
  }
  for (const g of only.operations.filter(o => o.command === 'shape-group')) expect(g.name).toMatch(/^costume-\d+-hair-long/);
  // the report still describes the whole character
  expect(only.report.frames.length).toBe(full.report.frames.length);
});

test('overlays line up with their body in every action pose (hair follows the head the body draws)', () => {
  const bodyOnly = generateNativeRecipe({ name: 'b', wig: 'none', actions: true, tool: 'hoe', motifs: ['scarf'] });
  const overlay = generateNativeRecipe({ name: 'o', wig: 'none', actions: true, tool: 'hoe', motifs: [hair('hair-short')], only: ['hair-short'] });
  const together = generateNativeRecipe({ name: 't', wig: 'none', actions: true, tool: 'hoe', motifs: [hair('hair-short'), 'scarf'] });
  for (const f of frames(together.operations)) {
    const merged = new Map();
    for (const p of [...draws(bodyOnly.operations, f.cell), ...draws(overlay.operations, f.cell)]) merged.set(`${p.x},${p.y}`, p.color);
    const direct = new Map(draws(together.operations, f.cell).map(p => [`${p.x},${p.y}`, p.color]));
    // hair is drawn after the body in the combined character too, so the merged overlay equals it except at motif-outline pixels
    const diff = [...direct].filter(([k, c]) => merged.get(k) !== c).length;
    expect(diff / direct.size, `${f.as}: ${diff} of ${direct.size} pixels differ`).toBeLessThan(0.1);
  }
});

test('native.only rejects a bad list and a motif the character does not have', () => {
  expect(() => generateNativeRecipe({ name: 'x', wig: 'none', motifs: ['scarf'], only: [] })).toThrow(/non-empty array/);
  expect(() => generateNativeRecipe({ name: 'x', wig: 'none', motifs: ['scarf'], only: ['goggles'] })).toThrow(/not one of the character's motifs/);
  expect(() => generateNativeRecipe({ name: 'x', wig: 'none', motifs: ['scarf'], only: 'scarf' })).toThrow(/non-empty array/);
});

test('hair and facial hair take their colours from the hair material or from explicit slot colours', () => {
  const viaMaterial = generateNativeRecipe({ name: 'm', wig: 'none', materials: { hair: KEY }, motifs: ['hair-short'], only: ['hair-short'] });
  const viaSlots = generateNativeRecipe({ name: 's', wig: 'none', motifs: [hair('hair-short')], only: ['hair-short'] });
  expect(viaSlots.operations).not.toEqual([]);
  const colours = ops => new Set(ops.filter(o => o.command === 'draw').map(o => o.color));
  // the shared outline replaces the exposed edge, so the three inner roles are the key colours in both builds
  for (const c of [KEY.shadow, KEY.base, KEY.highlight]) { expect(colours(viaMaterial.operations).has(c)).toBe(true); expect(colours(viaSlots.operations).has(c)).toBe(true); }
});
