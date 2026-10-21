import { test, expect } from 'vitest';
import { resolveFrameDurationMs, validateFrameDurations } from '../../server/web/public/js/shared/timing.js';
import { Project } from '../../server/engine/project.js';

test.each(['constructor', '__proto__'])('prototype-shaped group %s exports default forward timing', name => {
  const project = Project.create({ name: 'defaults', cellSize: 8, rows: 1, cols: 1 });
  project.groups.create(name, ['0,0']);
  const atlas = Project.fromJSON(project.toJSON()).exportAseprite({ imageName: 'defaults.png' });
  expect(atlas.meta.frameTags[0]).toMatchObject({ name, direction: 'forward' });
  expect(atlas.frames.map(frame => frame.duration)).toEqual([125,125]);
});

test('explicit cell milliseconds own timing across groups, base frames and named aliases', () => {
  const project = Project.create({ name: 'timing', cellSize: 8, rows: 1, cols: 2, palette: 'pico8' });
  project.cells.getCell('0,0').name = 'first'; project.frameDurations = { '0,0': 75 };
  project.groups.create('slow', ['0,0','0,1']); project.groups.create('fast', ['0,0','0,1']);
  project.animationFps = { slow: 4, fast: 10 };
  expect(resolveFrameDurationMs(project, '0,0', { group: 'slow' })).toBe(75);
  expect(resolveFrameDurationMs(project, '0,1', { group: 'slow' })).toBe(250);
  expect(resolveFrameDurationMs(project, '0,1', { group: 'fast' })).toBe(100);
  const atlas = project.exportAseprite({ imageName: 'timing.png' });
  expect(atlas.frames.map(f => f.duration)).toEqual([75,125,75,250,75,100,75]);
  expect(Project.fromJSON(project.toJSON()).frameDurations).toEqual({ '0,0': 75 });
});
test('timing maps reject unknown cells, explicit null and invalid or unrepresentable durations', () => {
  const project = { grid: { rows: 1, cols: 2 }, frameDurations: {}, animationFps: {} };
  for (const map of [null, [], { '0,2': 50 }, { '00,0': 50 }, { '0,0': 0 }, { '0,0': 1.5 }, { '0,0': Number.MAX_SAFE_INTEGER + 1 }]) expect(() => validateFrameDurations(map, project)).toThrow();
  expect(resolveFrameDurationMs(project, '0,0')).toBe(125);
  expect(() => resolveFrameDurationMs({ ...project, animationFps: { fast: 5000 } }, '0,0', { group: 'fast' })).toThrow(/duration|millisecond/i);
});
test('explicit one-shot group behavior survives serialization and owned atlas metadata', () => {
  const project = Project.create({ name: 'one-shot', cellSize: 8, rows: 1, cols: 2 });
  project.groups.create('scene', ['0,0','0,1']); project.animationLoops = { scene: false };
  const restored = Project.fromJSON(project.toJSON());
  expect(restored.animationLoops.scene).toBe(false);
  expect(restored.exportAseprite({ imageName: 'once.png' }).meta.frameTags[0].loop).toBe(false);
});

test('portable timing rejects malformed FPS maps even when cell overrides would hide them',()=>{
  const project=Project.create({name:'validation',cellSize:8,rows:1,cols:1});
  project.frameDurations={'0,0':75};
  for(const fps of [null,[],{idle:0},{idle:5000},{idle:1e-100},{idle:'8'}]) {
    expect(()=>Project.fromJSON({...project.toJSON(),animationFps:fps})).toThrow(/FPS|fps|millisecond/);
  }
});

test('timing maps round-trip independent of cell artwork and support reverse ping-pong groups',()=>{
  const project=Project.create({name:'timing-owner',cellSize:8,rows:1,cols:3});
  project.groups.create('bounce',['0,0','0,1','0,2']);project.animationDirections={bounce:'pingpong_reverse'};
  project.frameDurations={'0,0':75,'0,1':125,'0,2':200};
  const restored=Project.fromJSON(project.toJSON());
  restored.cells.copyCell('0,0','0,2');restored.cells.getCell('0,1').clear();
  expect(restored.frameDurations).toEqual(project.frameDurations);
  const saved=restored.toJSON();saved.frameDurations['0,0']=999;
  expect(restored.frameDurations['0,0']).toBe(75);
  expect(restored.exportAseprite({imageName:'timing.png'}).meta.frameTags[0].direction).toBe('pingpong_reverse');
});

test('named group members persist and export as canonical coordinates without losing repeated holds',()=>{
  const project=Project.create({name:'aliases',cellSize:8,rows:1,cols:2});
  project.cells.getCell('0,0').name='first';project.cells.getCell('0,1').name='second';
  project.groups.create('hold',['first','second','first']);project.frameDurations={'0,0':75};project.animationFps={hold:4};
  const data=project.toJSON();expect(data.groups.hold).toEqual(['0,0','0,1','0,0']);
  const restored=Project.fromJSON({...data,groups:{hold:['first','second','first']}});
  expect(restored.groups.get('hold')).toEqual(['0,0','0,1','0,0']);
  const atlas=project.exportAseprite({imageName:'aliases.png'}),tag=atlas.meta.frameTags[0];
  expect(atlas.frames.slice(tag.from,tag.to+1).map(frame=>frame.duration)).toEqual([75,250,75]);
});
