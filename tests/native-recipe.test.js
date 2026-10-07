import { test, expect } from 'vitest';
import { generateNativeRecipe } from '../server/authoring/native-recipe.js';
import { WASTELAND_MOTIFS, MOTIF_NAMES, expandMotifs } from '../server/authoring/native/wasteland-motifs.mjs';
import { NATIVE_PRESETS, PRESET_NAMES, SKIN_RAMPS, HAIR_RAMPS } from '../server/authoring/native/wasteland-presets.mjs';
import { cast, castTemplate } from '../examples/native-character/generate-cast.mjs';

const frames = ops => ops.filter(o => o.command === 'name');
const cellOps = (ops, cell) => ops.filter(o => o.command === 'draw' && o.cell === cell);
const group = (ops, name) => ops.filter(o => o.command === 'group' && o.name === name);
const aliasCell = (ops, alias) => frames(ops).find(f => f.as === alias).cell;
// visible pixels: a later draw at the same position covers an earlier one
const visible = (ops, cell) => new Map(cellOps(ops, cell).map(p => [p.x + ',' + p.y, p]));
const pixels = (ops, cell, mirror = false) => [...visible(ops, cell).values()].map(p => [mirror ? 15 - p.x : p.x, p.y, p.color]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
const ACTION_TAGS = ['swing', 'water', 'hurt'];

test('an inline native recipe reproduces every checked-in cast costume byte for byte', () => {
  for (const profile of cast.characters) {
    const { id, kind, outfit, wig, tone, materials, colors, motifs, replaceHead, bodyMaterial, gear } = profile;
    const { operations } = generateNativeRecipe({ name: `cast-${id}`, id, kind, outfit, wig, tone, materials, colors, motifs, replaceHead, bodyMaterial, gear });
    expect(operations, id).toEqual(castTemplate(id));
  }
});

test('every library motif expands for adult and large bodies, stays inside the cell and keeps rows rectangular', () => {
  for (const kind of ['adult', 'large']) for (const name of MOTIF_NAMES) {
    const ramp = { outline: '#000000', shadow: '#111111', base: '#222222', highlight: '#333333' };
    const { motifs } = expandMotifs([name], { kind, materials: {}, fallbackRamps: { cloth: ramp, trousers: ramp, hair: ramp, skin: ramp } });
    expect(motifs.length, name).toBeGreaterThan(0);
    for (const m of motifs) {
      const width = Math.max(...m.rows.map(r => r.length));
      expect(m.x, `${name} x`).toBeGreaterThanOrEqual(0);
      expect(m.x + width, `${kind}/${name}/${m.directions} extends past the cell`).toBeLessThanOrEqual(16);
      for (const ch of m.rows.join('')) if (ch !== '.') expect(m.colors[ch], `${name}: symbol ${ch} has no colour`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  }
});

test('library motifs compose a costume by name: slot colours override and the character material is followed', () => {
  const a = generateNativeRecipe({ name: 'a', wig: 'short', motifs: ['wide-brim-hat'] });
  const b = generateNativeRecipe({ name: 'b', wig: 'short', motifs: [{ name: 'wide-brim-hat', colors: { band: '#112233' } }] });
  expect(JSON.stringify(a.operations)).not.toContain('#112233');
  expect(JSON.stringify(b.operations)).toContain('#112233');
  const coat = generateNativeRecipe({ name: 'c', materials: { cloth: { outline: '#010203', shadow: '#aa0000', base: '#bb0000', highlight: '#cc0000' } }, motifs: ['duster-coat'] });
  expect(JSON.stringify(coat.operations)).toContain('#bb0000');
  expect(() => generateNativeRecipe({ name: 'x', motifs: ['nope'] })).toThrow(/Unknown wasteland motif "nope"/);
  expect(() => generateNativeRecipe({ name: 'x', motifs: [{ name: 'scarf', colors: { zzz: '#ffffff' } }] })).toThrow(/no colour slot "zzz"/);
  expect(() => generateNativeRecipe({ name: 'x', motifs: [{ name: 'scarf', colors: { base: 'red' } }] })).toThrow(/six-digit hex/);
});

test('a one-sided motif mirrors for the other side and hides on the hidden profile', () => {
  const right = generateNativeRecipe({ name: 'r', motifs: [{ name: 'scrap-pauldron', side: 'right' }] }).operations;
  const left = generateNativeRecipe({ name: 'l', motifs: [{ name: 'scrap-pauldron', side: 'left' }] }).operations;
  const front = ops => cellOps(ops, aliasCell(ops, 'front')).filter(p => p.name.startsWith('costume-'));
  expect(front(left).map(p => 15 - p.x).sort()).toEqual(front(right).map(p => p.x).sort());
  expect(cellOps(left, aliasCell(left, 'right')).some(p => p.name.startsWith('costume-'))).toBe(false);
});

test('every preset builds and exposes the declared actions with consistent aliases, tags and cells', () => {
  for (const name of PRESET_NAMES) {
    const { operations, report } = generateNativeRecipe({ name: `p-${name}`, preset: name });
    const alias = frames(operations).map(f => f.as);
    expect(new Set(alias).size, name).toBe(alias.length);
    const cells = frames(operations).map(f => f.cell);
    expect(new Set(cells).size, name).toBe(cells.length);
    for (const dir of ['front', 'right', 'back', 'left']) {
      for (const a of [dir, ...[0, 1, 2, 3].flatMap(i => [`${dir}_walk_${i}`, `${dir}_swing_${i}`, `${dir}_water_${i}`]), `${dir}_hurt`, `${dir}_down`]) expect(alias, `${name}: ${a}`).toContain(a);
      for (const t of [`walk_${dir}`, `swing_${dir}`, `water_${dir}`, `hurt_${dir}`, `down_${dir}`]) expect(group(operations, t), `${name}: tag ${t}`).toHaveLength(1);
      expect(group(operations, `swing_${dir}`)[0].cells).toHaveLength(4);
      expect(group(operations, `hurt_${dir}`)[0].cells).toHaveLength(1);
    }
    expect(group(operations, 'down')).toHaveLength(1);
    expect(operations[0]).toMatchObject({ size: '16x32', rows: 4, cols: 15 });
    expect(operations.at(-1).command).toBe('pivot');
    expect(report.frames).toHaveLength(frames(operations).length);
    for (const f of operations.filter(o => o.command === 'name')) {
      const pts = cellOps(operations, f.cell);
      expect(pts.length, `${name}/${f.as}`).toBeGreaterThan(20);
      expect(pts.every(p => p.x >= 0 && p.x <= 15 && p.y >= 0 && p.y <= 29), `${name}/${f.as} in cell`).toBe(true);
      // action cells are baked composites: one opaque pixel per position
      if (/_(swing|water|hurt|down)/.test(f.as)) expect(new Set(pts.map(p => p.x + ',' + p.y)).size, `${name}/${f.as} unique pixels`).toBe(pts.length);
    }
  }
});

test('action frames keep the character grounded on the shared pivot and name their own report facts', () => {
  const { operations, report } = generateNativeRecipe({ name: 'w', preset: 'scavenger-rags' });
  const byAlias = Object.fromEntries(report.frames.map(f => [f.alias, f]));
  expect(report.aliases).toMatchObject({ idle: '{direction}', walk: '{direction}_walk_{frame}', swing: '{direction}_swing_{frame}', water: '{direction}_water_{frame}', hurt: '{direction}_hurt', down: '{direction}_down' });
  for (const a of ['right_swing_2', 'front_water_3', 'back_hurt', 'left_down']) {
    expect(byAlias[a].locomotion, a).toBeUndefined();
    expect(byAlias[a].bounds.bottom, a).toBe(29);
  }
  expect(byAlias.right_swing_2).toMatchObject({ action: 'swing', frame: 2, actingSide: 'right' });
  expect(byAlias.left_swing_2).toMatchObject({ action: 'swing', frame: 2, actingSide: 'left' });
  // the report publishes where the acting hand is, so a game can attach held items
  const wrist = byAlias.right_swing_2.sides.right.wrist;
  expect(wrist[0]).toBeGreaterThan(8);
  expect(byAlias.right_walk_1.locomotion).toBeTruthy();
  // left poses are the mirrored right poses in every action
  for (const base of ['swing_0', 'swing_3', 'water_2', 'hurt', 'down']) {
    const r = aliasCell(operations, `right_${base}`), l = aliasCell(operations, `left_${base}`);
    expect(pixels(operations, l), base).toEqual(pixels(operations, r, true));
  }
});

test('action poses draw the chosen tool and never cover the face', () => {
  const colors = tool => {
    const { operations } = generateNativeRecipe({ name: 't', preset: 'scavenger-rags', tool });
    return pixels(operations, aliasCell(operations, 'right_swing_2')).map(p => p.join());
  };
  const hoe = new Set(colors('hoe')), pick = new Set(colors('pick').map(p => p.split(',')[2])), club = new Set(colors('club').map(p => p.split(',')[2]));
  expect([...hoe].sort()).not.toEqual(colors('club').sort());
  expect([...hoe].sort()).not.toEqual(colors('pick').sort());
  expect(pick.has('#c4c3ba')).toBe(true); // metal head
  expect(club.has('#c4c3ba')).toBe(true);
  expect(() => generateNativeRecipe({ name: 't', tool: 'spade', actions: true })).toThrow(/tool must be one of/);
  expect(() => generateNativeRecipe({ name: 't', actions: ['dance'] })).toThrow(/actions must be true or a list of/);
  expect(() => generateNativeRecipe({ name: 't', kind: 'child', outfit: 'jacket', actions: true })).toThrow(/adult and large/);
});

test('a subset of actions packs only those cells, and no actions keeps the plain 4x5 sheet', () => {
  const plain = generateNativeRecipe({ name: 'p', preset: 'zombie', actions: false, posture: undefined });
  const some = generateNativeRecipe({ name: 's', actions: ['hurt'], wig: 'short' });
  const none = generateNativeRecipe({ name: 'n', wig: 'short' });
  expect(none.operations[0]).toMatchObject({ rows: 4, cols: 5 });
  expect(frames(none.operations)).toHaveLength(20);
  expect(some.operations[0]).toMatchObject({ rows: 4, cols: 6 });
  expect(frames(some.operations)).toHaveLength(24);
  expect(plain.operations[0].cols).toBe(5);
});

test('shamble posture reaches both arms forward on every idle and walk frame, keeping legs and gait', () => {
  const normal = generateNativeRecipe({ name: 'n', wig: 'short' }).operations;
  const zombie = generateNativeRecipe({ name: 'z', wig: 'short', posture: 'shamble' }).operations;
  expect(frames(zombie)).toHaveLength(20);
  const lower = (ops, alias) => pixels(ops, aliasCell(ops, alias)).filter(p => p[1] >= 25).map(p => p.join()).sort();
  for (const a of ['front_walk_1', 'right_walk_3', 'back_walk_2']) expect(lower(zombie, a)).toEqual(lower(normal, a));
  // arms forward in profile reach past the torso at shoulder height
  const reach = ops => Math.max(...pixels(ops, aliasCell(ops, 'right_walk_0')).filter(p => p[1] >= 15 && p[1] <= 18).map(p => p[0]));
  expect(reach(zombie)).toBeGreaterThan(reach(normal));
  expect(pixels(zombie, aliasCell(zombie, 'left_walk_1'))).toEqual(pixels(zombie, aliasCell(zombie, 'right_walk_1'), true));
});

test('the large body takes costume motifs and actions with its broader frame', () => {
  const { operations } = generateNativeRecipe({ name: 'b', preset: 'mutant-brute' });
  for (const a of ['front', 'right_swing_1', 'back_hurt', 'front_down']) {
    const pts = cellOps(operations, aliasCell(operations, a));
    expect(pts.every(p => p.x >= 0 && p.x <= 15), a).toBe(true);
  }
  expect(cellOps(operations, aliasCell(operations, 'front')).filter(p => p.name.startsWith('costume-')).length).toBeGreaterThan(30);
  expect(() => generateNativeRecipe({ name: 'b', kind: 'large', outfit: 'jacket' })).toThrow(/large body is bare/);
  expect(() => generateNativeRecipe({ name: 'b', kind: 'adult', outfit: 'none' })).toThrow(/Only the large body/);
});

test('presets merge under the caller: named skin and hair ramps, motif replacement and omission', () => {
  const rags = generateNativeRecipe({ name: 'a', preset: 'scavenger-rags', skin: 'dark', hair: 'red' }).operations;
  const colors = new Set(rags.filter(o => o.command === 'draw').map(o => o.color));
  expect(colors.has(SKIN_RAMPS.dark.base)).toBe(true);
  expect(colors.has(HAIR_RAMPS.red.base)).toBe(true);
  expect(colors.has(SKIN_RAMPS.fair.base)).toBe(false);
  const names = ops => new Set(ops.filter(o => o.command === 'draw' && o.name.startsWith('costume-')).map(o => o.name.split('-')[2]));
  const omitted = generateNativeRecipe({ name: 'o', preset: 'scavenger-rags', omit: ['scarf'] }).operations;
  expect(names(rags).has('scarf')).toBe(true);
  expect(names(omitted).has('scarf')).toBe(false);
  expect(names(generateNativeRecipe({ name: 'x', preset: 'scavenger-rags', motifs: ['respirator'] }).operations).has('respirator')).toBe(true);
  expect(() => generateNativeRecipe({ name: 'x', preset: 'nope' })).toThrow(/Unknown native preset/);
  expect(() => generateNativeRecipe({ name: 'x', skin: 'cyan' })).toThrow(/Unknown skin ramp/);
  expect(NATIVE_PRESETS['scavenger-rags'].motifs).toContain('duster-coat');
});

test('configuration errors are specific', () => {
  expect(() => generateNativeRecipe({})).toThrow(/native.name/);
  expect(() => generateNativeRecipe({ name: 'a b' })).toThrow(/native.name/);
  expect(() => generateNativeRecipe({ name: 'a', mood: 'sad' })).toThrow(/Unknown native field: mood/);
  expect(() => generateNativeRecipe({ name: 'a', kind: 'giant' })).toThrow(/adult, child or large/);
  expect(() => generateNativeRecipe({ name: 'a', tone: 'blue' })).toThrow(/native.tone/);
  expect(() => generateNativeRecipe({ name: 'a', colors: { o: 'black' } })).toThrow(/native.colors.o/);
  expect(() => generateNativeRecipe({ name: 'a', materials: { cloth: { base: '#ffffff' } } })).toThrow(/four hex colour roles/);
  expect(() => generateNativeRecipe({ name: 'a', posture: 'crawl' })).toThrow(/posture must be one of/);
  expect(() => generateNativeRecipe({ name: 'a', motifs: 'scarf' })).toThrow(/motifs must be an array/);
});

test('the recipe is deterministic', () => {
  const a = generateNativeRecipe({ name: 'd', preset: 'raider' }), b = generateNativeRecipe({ name: 'd', preset: 'raider' });
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  expect(MOTIF_NAMES.length).toBeGreaterThanOrEqual(18);
  expect(Object.keys(WASTELAND_MOTIFS)).toEqual(MOTIF_NAMES);
  expect(ACTION_TAGS).toHaveLength(3);
});

test('malformed or conflicting configuration fails with a config error, never a hang or a TypeError', () => {
  expect(() => generateNativeRecipe({ name: 'x', replaceHead: true, actions: true })).toThrow(/replacement head motif/);
  expect(() => generateNativeRecipe({ name: 'x', omit: 5 })).toThrow(/omit must be an array/);
  expect(() => generateNativeRecipe({ name: 'x', materials: 'x' })).toThrow(/materials must be an object/);
  expect(() => generateNativeRecipe({ name: 'x', gear: 'trowel' })).toThrow(/gear must be an array/);
  expect(() => generateNativeRecipe({ name: 'x', motifs: [{ name: 'scarf', directions: 5 }] })).toThrow(/directions/);
  expect(() => generateNativeRecipe({ name: 'x', motifs: [{ name: 'scarf', directions: ['up'] }] })).toThrow(/directions/);
  for (const bad of ['__proto__', 'toString', 'constructor']) expect(() => generateNativeRecipe({ name: 'x', preset: bad })).toThrow(/Unknown native preset/);
  expect(() => generateNativeRecipe({ name: 'x', skin: 'toString' })).toThrow(/Unknown skin ramp/);
  expect(() => generateNativeRecipe({ name: 'x', kind: 'child', outfit: 'jacket', motifs: ['scarf'] })).toThrow(/adult and large/);
  expect(() => generateNativeRecipe({ name: 'x', bodyMaterial: 'Zz Z' })).toThrow(/bodyMaterial/);
});

test('hair on a wigless preset is ignored, and a body override replaces the preset wardrobe default', () => {
  expect(() => generateNativeRecipe({ name: 'x', preset: 'raider', hair: 'black' })).not.toThrow();
  expect(() => generateNativeRecipe({ name: 'x', preset: 'mutant-brute', kind: 'adult', actions: false })).not.toThrow();
});
