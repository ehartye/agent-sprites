import { describe, it, expect } from 'vitest';
import { Project } from '../../server/engine/project.js';

// Returns a list of layout defects in an exported atlas (empty when sound).
// Contract: grid and tag-range frames are keyed by their array index, named
// aliases come after every tag range, tags carry no `repeat`, and `loop` is
// present only when set.
function findLayoutDefects(atlas) {
  const defects = [];
  const { frames, meta } = atlas;
  const lastTagEnd = Math.max(-1, ...meta.frameTags.map(t => t.to));
  frames.forEach((f, i) => {
    if (i <= lastTagEnd && f.filename !== String(i)) {
      defects.push(`frame ${i} inside a tag range has filename "${f.filename}"`);
    }
  });
  for (const t of meta.frameTags) {
    if ('repeat' in t) defects.push(`tag "${t.name}" has a repeat key`);
  }
  return defects;
}

function makeProject() {
  return Project.create({ name: 'hero', cellSize: 16, rows: 2, cols: 2, palette: 'pico8' });
}

function exportContractProject() {
  const p = makeProject();
  p.cells.getCell('0,0').name = 'idle';
  p.animationLoops = { once: false };
  return p.exportAseprite({
    imageName: 'hero.png',
    groups: { once: ['0,0', '0,1'], walk: ['1,0', '1,1'] },
  });
}

describe('atlas frame key and tag contract', () => {
  it('keys grid and tag-range frames by index, with aliases after every tag range', () => {
    const atlas = exportContractProject();
    const { frames } = atlas;
    const lastTagEnd = Math.max(...atlas.meta.frameTags.map(t => t.to));

    // 4 grid cells, then two 2-frame tag runs, then one alias
    expect(frames).toHaveLength(9);
    expect(frames.slice(0, 4).map(f => f.filename)).toEqual(['0', '1', '2', '3']);
    for (const tag of atlas.meta.frameTags) {
      for (let i = tag.from; i <= tag.to; i++) expect(frames[i].filename).toBe(String(i));
    }
    const aliasIndexes = frames.flatMap((f, i) => (f.filename === String(i) ? [] : [i]));
    expect(aliasIndexes).toEqual([8]);
    expect(aliasIndexes.every(i => i > lastTagEnd)).toBe(true);
    expect(findLayoutDefects(atlas)).toEqual([]);
  });

  it('emits no repeat key and only emits loop when set', () => {
    const atlas = exportContractProject();
    const once = atlas.meta.frameTags.find(t => t.name === 'once');
    const walk = atlas.meta.frameTags.find(t => t.name === 'walk');
    for (const tag of atlas.meta.frameTags) expect(tag).not.toHaveProperty('repeat');
    expect(once.loop).toBe(false);
    expect(walk).not.toHaveProperty('loop');
  });

  it('reports an alias moved inside a tag range', () => {
    const atlas = exportContractProject();
    const alias = atlas.frames.pop();
    atlas.frames.splice(5, 0, alias); // inside the first tag run
    const defects = findLayoutDefects(atlas);
    expect(defects.length).toBeGreaterThan(0);
    expect(defects[0]).toMatch(/inside a tag range/);
  });
});
