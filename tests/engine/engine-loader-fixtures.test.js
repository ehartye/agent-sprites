import { describe, test, expect } from 'vitest';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { atlasSequence } from '../../server/web/public/js/shared/atlas-timeline.js';

// Shared engine-loader fixtures. expected.json is derived from atlasSequence, the single
// definition of playback order. Regenerate with UPDATE_ATLAS_FIXTURES=1 (see the fixtures README).
const FIXTURES = join(fileURLToPath(new URL('../../examples/atlas-fixtures/', import.meta.url)));
const UPDATE = process.env.UPDATE_ATLAS_FIXTURES === '1';
const names = readdirSync(FIXTURES, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const load = name => ({ dir: join(FIXTURES, name), atlas: readJson(join(FIXTURES, name, `${name}.atlas.json`)) });

/** The pivot slice's point, in pixels from the top-left of the untrimmed cell, or null without one. */
function cellPivot(atlas) {
  const slice = (atlas.meta.slices ?? []).find(s => s.name === 'pivot');
  const p = slice?.keys?.[0]?.pivot;
  return p ? { x: p.x, y: p.y } : null;
}

/** Everything an engine loader must reproduce for one fixture, computed from the committed atlas. */
export function computeExpected(name, atlas) {
  const pivot = cellPivot(atlas);
  const tags = (atlas.meta.frameTags ?? []).map(tag => {
    const steps = atlasSequence(atlas, { tag: tag.name });
    const frames = {};
    for (const { index } of steps) {
      const f = atlas.frames[index];
      frames[index] = {
        frame: { x: f.frame.x, y: f.frame.y, w: f.frame.w, h: f.frame.h },
        offset: { x: f.spriteSourceSize.x, y: f.spriteSourceSize.y },
        sourceSize: { w: f.sourceSize.w, h: f.sourceSize.h },
        pivot: pivot && { ...pivot },
      };
    }
    return {
      name: tag.name,
      direction: tag.direction ?? 'forward',
      loop: tag.loop !== false, // loops unless the tag's loop is explicitly false
      steps,
      durationMs: steps.reduce((sum, s) => sum + s.duration, 0),
      frames,
    };
  });
  return {
    note: 'Generated from the atlas by tests/engine/engine-loader-fixtures.test.js. Do not edit by hand.',
    fixture: name,
    image: atlas.meta.image,
    atlas: `${name}.atlas.json`,
    pivot,
    tags,
  };
}

/** Human-readable differences between a recomputed and a committed expected object. */
export function diffExpected(actual, committed) {
  const out = [];
  const want = new Map((committed?.tags ?? []).map(t => [t.name, t]));
  for (const tag of actual.tags) {
    const other = want.get(tag.name);
    if (!other) { out.push(`tag "${tag.name}" is missing from the committed expected file`); continue; }
    if (other.direction !== tag.direction) out.push(`tag "${tag.name}" direction: expected ${other.direction}, computed ${tag.direction}`);
    if (other.loop !== tag.loop) out.push(`tag "${tag.name}" loop: expected ${other.loop}, computed ${tag.loop}`);
    if (other.steps?.length !== tag.steps.length) out.push(`tag "${tag.name}" step count: expected ${other.steps?.length}, computed ${tag.steps.length}`);
    tag.steps.forEach((step, i) => {
      const o = other.steps?.[i];
      if (o?.index !== step.index) out.push(`tag "${tag.name}" step ${i} frame: expected ${o?.index}, computed ${step.index}`);
      else if (o.duration !== step.duration) out.push(`tag "${tag.name}" frame ${step.index} step ${i} duration: expected ${o.duration}, computed ${step.duration}`);
    });
    for (const [index, f] of Object.entries(tag.frames)) {
      if (JSON.stringify(other.frames?.[index]) !== JSON.stringify(f)) out.push(`tag "${tag.name}" frame ${index} placement: expected ${JSON.stringify(other.frames?.[index])}, computed ${JSON.stringify(f)}`);
    }
  }
  for (const name of want.keys()) if (!actual.tags.some(t => t.name === name)) out.push(`tag "${name}" in the committed expected file is not in the atlas`);
  for (const key of ['fixture', 'image', 'atlas', 'pivot']) {
    if (JSON.stringify(actual[key]) !== JSON.stringify(committed?.[key])) out.push(`${key}: expected ${JSON.stringify(committed?.[key])}, computed ${JSON.stringify(actual[key])}`);
  }
  return out;
}

describe('fixture set', () => {
  test('holds the trimmed, blink and directions fixtures', () => {
    expect(names).toEqual(['blink', 'directions', 'trimmed']);
  });
});

describe.each(names)('fixture %s', name => {
  const { dir, atlas } = load(name);
  const expectedPath = join(dir, 'expected.json');
  const expected = computeExpected(name, atlas);

  if (UPDATE) test('regenerates expected.json', () => {
    writeFileSync(expectedPath, JSON.stringify(expected, null, 1) + '\n');
    expect(existsSync(expectedPath)).toBe(true);
  });

  test('committed expected.json matches atlasSequence for every tag', () => {
    expect(existsSync(expectedPath), 'expected.json is missing; run with UPDATE_ATLAS_FIXTURES=1').toBe(true);
    const committed = readJson(expectedPath);
    expect(diffExpected(expected, committed)).toEqual([]);
    expect(committed).toEqual(expected);
  });

  test('sheet PNG exists and matches the atlas size and image name', () => {
    expect(atlas.meta.image).toBe(`${name}.png`);
    const png = readFileSync(join(dir, atlas.meta.image));
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect({ w: png.readUInt32BE(16), h: png.readUInt32BE(20) }).toEqual(atlas.meta.size);
    expect(png.length).toBeLessThan(8192);
  });

  test('every expected frame lies inside the sheet and the untrimmed cell', () => {
    for (const tag of expected.tags) for (const f of Object.values(tag.frames)) {
      expect(f.frame.x + f.frame.w).toBeLessThanOrEqual(atlas.meta.size.w);
      expect(f.frame.y + f.frame.h).toBeLessThanOrEqual(atlas.meta.size.h);
      expect(f.offset.x + f.frame.w).toBeLessThanOrEqual(f.sourceSize.w);
      expect(f.offset.y + f.frame.h).toBeLessThanOrEqual(f.sourceSize.h);
    }
  });
});

describe('what each fixture covers', () => {
  const tagOf = (atlas, tagName) => atlas.meta.frameTags.find(t => t.name === tagName);

  test('trimmed: a trimmed pingpong_reverse tag that plays once, with the cell pivot', () => {
    const { atlas } = load('trimmed');
    expect(atlas.frames.every(f => f.trimmed === true)).toBe(true);
    expect(atlas.meta.frameTags).toEqual([{ name: 'sweep', from: 3, to: 5, direction: 'pingpong_reverse', loop: false }]);
    const exp = computeExpected('trimmed', atlas);
    const sweep = exp.tags[0];
    expect(sweep.loop).toBe(false);
    expect(sweep.steps).toEqual([{ index: 5, duration: 200 }, { index: 4, duration: 125 }, { index: 3, duration: 75 }, { index: 4, duration: 125 }]);
    expect(sweep.frames[3]).toEqual({
      frame: { x: 0, y: 0, w: 30, h: 22 }, offset: { x: 1, y: 1 }, sourceSize: { w: 32, h: 24 }, pivot: { x: 16, y: 22 },
    });
  });

  test('blink: a forward tag after the grid block, with named alias frames', () => {
    const { atlas } = load('blink');
    expect(atlas.meta.frameTags).toEqual([{ name: 'blink', from: 2, to: 5, direction: 'forward' }]);
    expect(atlas.frames.filter(f => !/^\d+$/.test(f.filename)).map(f => [f.filename, f.duration])).toEqual([['open', 125], ['closed', 125]]);
    expect(atlas.frames.every(f => f.trimmed === false)).toBe(true);
    const exp = computeExpected('blink', atlas);
    expect(exp.tags[0].loop).toBe(true);
    expect(exp.pivot).toEqual({ x: 8, y: 15 });
    expect(exp.tags[0].steps.map(s => s.index)).toEqual([2, 3, 4, 5]);
  });

  test('directions: untrimmed, all four directions, differing durations, loop true/false/absent', () => {
    const { atlas } = load('directions');
    expect(atlas.frames.every(f => f.trimmed === false && f.spriteSourceSize.x === 0 && f.spriteSourceSize.y === 0
      && f.sourceSize.w === f.frame.w && f.sourceSize.h === f.frame.h)).toBe(true);
    const tags = atlas.meta.frameTags;
    expect(tags.map(t => t.direction).sort()).toEqual(['forward', 'pingpong', 'pingpong_reverse', 'reverse']);
    const loops = tags.map(t => (Object.hasOwn(t, 'loop') ? t.loop : 'absent'));
    expect(loops).toContain(true);
    expect(loops).toContain(false);
    expect(loops).toContain('absent');
    expect(new Set(atlas.frames.slice(0, 4).map(f => f.duration)).size).toBe(4);
    const exp = computeExpected('directions', atlas);
    const steps = n => exp.tags.find(t => t.name === n).steps.map(s => s.index - tagOf(atlas, n).from);
    expect(steps('forward-run')).toEqual([0, 1, 2, 3]);
    expect(steps('reverse-once')).toEqual([3, 2, 1, 0]);
    expect(steps('pingpong-loop')).toEqual([0, 1, 2, 3, 2, 1]);
    expect(steps('pingpong-reverse-once')).toEqual([2, 1, 0, 1]);
    expect(exp.tags.find(t => t.name === 'forward-run').loop).toBe(true);
    expect(exp.tags.find(t => t.name === 'reverse-once').loop).toBe(false);
    expect(exp.pivot).toEqual({ x: 6, y: 11 });
  });
});

describe('mismatch detection', () => {
  test('a tampered duration is reported with its tag and frame', () => {
    const { atlas } = load('trimmed');
    const expected = computeExpected('trimmed', atlas);
    const tampered = structuredClone(readJson(join(FIXTURES, 'trimmed', 'expected.json')));
    tampered.tags[0].steps[1].duration += 1; // sweep, second step, frame 4
    const problems = diffExpected(expected, tampered);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"sweep"');
    expect(problems[0]).toContain('frame 4');
    expect(problems[0]).toContain('duration');
  });

  test('an untouched copy reports no differences', () => {
    const { atlas } = load('directions');
    const expected = computeExpected('directions', atlas);
    expect(diffExpected(expected, structuredClone(expected))).toEqual([]);
  });
});
