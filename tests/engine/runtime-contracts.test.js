import { test, expect } from 'vitest';
import { atlasEntry, createWalker } from '../../server/build/playback-runtime.mjs';
import { FONT_TONES } from '../../server/build/ui-runtime.mjs';
import { generateCharacterRecipe } from '../../server/authoring/character.js';
import { generateUIRecipe } from '../../server/authoring/ui.js';

test('atlasEntry finds a whole frame entry by name in array and hash atlases', () => {
  const entry = { filename: 'idle', frame: { x: 1, y: 2, w: 3, h: 4 }, spriteSourceSize: { x: 5, y: 6, w: 3, h: 4 } };
  expect(atlasEntry({ frames: [entry] }, 'idle')).toBe(entry);
  expect(atlasEntry({ frames: { idle: entry } }, 'idle')).toBe(entry);
  expect(() => atlasEntry({ frames: [entry] }, 'walk')).toThrow(/Missing atlas frame: walk/);
});

test('character reports publish their alias patterns and the walker follows them', () => {
  const idle = generateCharacterRecipe({ people: [{ id: 'ada' }], directions: ['right'] }).report;
  expect(idle.aliases).toEqual({ idle: '{person}_{outfit}_{direction}_idle', walk: '{person}_{outfit}_{direction}_walk_{frame}', expressions: '{person}_{outfit}_{direction}_{expression}' });
  // A report with its own naming drives the walker without code changes.
  const walk = generateCharacterRecipe({ people: [{ id: 'ada' }], mode: 'walk', directions: ['right'] }).report;
  const rename = r => ({ ...r, aliases: { idle: 'I-{direction}', walk: 'W-{direction}-{frame}' }, frames: r.frames.map(f => ({ ...f, alias: f.alias.replace(/^ada_casual_right_idle$/, 'I-right').replace(/^ada_casual_right_walk_(\d)$/, 'W-right-$1') })) });
  const walker = createWalker([rename(idle), rename(walk)], { person: 'ada', outfit: 'casual', mode: 'continuous-root', facing: 'right' });
  expect(walker.update(1, 0).alias).toBe('W-right-0');
  expect(walker.update(0, 0).alias).toBe('I-right');
});

test('font tones come from one exported list', () => {
  expect(FONT_TONES).toEqual(['cream', 'muted', 'gold', 'ink']);
  const { report } = generateUIRecipe({ name: 'f', kind: 'font', characters: ' A' });
  expect(Object.keys(report.glyphs.A.frames).sort()).toEqual([...FONT_TONES].sort());
});
