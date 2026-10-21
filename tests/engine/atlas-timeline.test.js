import { test, expect } from 'vitest';
import { atlasSequence, composeTimeline, anchorPoint } from '../../server/web/public/js/shared/atlas-timeline.js';

const atlas = { frames: [0, 1, 2].map((n) => ({ filename: `f${n}`, duration: [125, 75, 100][n] })), meta: { frameTags: [] } };
test.each([
  ['forward', [0,1,2]], ['reverse', [2,1,0]], ['pingpong', [0,1,2,1]], ['pingpong_reverse', [2,1,0,1]],
])('selects %s tags without repeated endpoint holds', (direction, indices) => {
  const a = structuredClone(atlas); a.meta.frameTags = [{ name: 'run', from: 0, to: 2, direction }];
  expect(atlasSequence(a, { tag: 'run' }).map(f => f.index)).toEqual(indices);
});
test('preserves named selectors, repeats, durations and hash insertion order', () => {
  expect(atlasSequence(atlas, { frames: ['f2', 0, 0] })).toEqual([{index:2,duration:100},{index:0,duration:125},{index:0,duration:125}]);
  expect(atlasSequence({ frames: { a: {duration:20}, b:{duration:30} } }, {frames:['b']})).toEqual([{index:1,duration:30}]);
  expect(() => atlasSequence(atlas, {frames:['missing']})).toThrow(/missing/);
  expect(() => atlasSequence(atlas, {frames:[0],tag:'x'})).toThrow(/exactly one/);
  expect(() => atlasSequence({ frames:[{filename:'x',duration:1.5}] }, {frames:[0]})).toThrow(/integer/);
});
test('composes the complete joint period with mixed durations and static tracks', () => {
  const timeline = composeTimeline([
    {sequence:[{index:0,duration:100},{index:1,duration:100}],loop:true},
    {sequence:[{index:2,duration:150},{index:3,duration:150}],loop:true},
    {sequence:[{index:9,duration:17}],loop:false},
  ]);
  expect(timeline.durationMs).toBe(600); expect(timeline.loop).toBe(false);
  expect(timeline.steps).toEqual([
    {atMs:0,durationMs:100,frames:[0,2,9]}, {atMs:100,durationMs:50,frames:[1,2,9]},
    {atMs:150,durationMs:50,frames:[1,3,9]}, {atMs:200,durationMs:100,frames:[0,3,9]},
    {atMs:300,durationMs:100,frames:[1,2,9]}, {atMs:400,durationMs:50,frames:[0,2,9]},
    {atMs:450,durationMs:50,frames:[0,3,9]}, {atMs:500,durationMs:100,frames:[1,3,9]},
  ]);
});
test('one-shot tracks hold their final frame and repeated holds stay explicit', () => {
  const result = composeTimeline([
    {sequence:[{index:0,duration:100},{index:1,duration:100}],loop:false},
    {sequence:[{index:2,duration:100},{index:2,duration:100},{index:3,duration:100}],loop:true},
  ]);
  expect(result).toEqual({durationMs:300,loop:false,steps:[
    {atMs:0,durationMs:100,frames:[0,2]}, {atMs:100,durationMs:100,frames:[1,2]}, {atMs:200,durationMs:100,frames:[1,3]},
  ]});
});
test('rejects overlong joint periods, unsafe arithmetic, invalid inputs and excessive steps', () => {
  const track = (a,b) => ({sequence:[{index:0,duration:a},{index:1,duration:b}],loop:true});
  expect(() => composeTimeline([track(30000,1),track(30000,3)])).toThrow(/duration|period/);
  expect(() => composeTimeline([track(Number.MAX_SAFE_INTEGER,1)])).toThrow(/safe|duration|period/);
  expect(() => composeTimeline([track(1,1)],{maxSteps:1})).toThrow(/steps/);
  expect(() => composeTimeline([{sequence:[]}])).toThrow(/sequence/);
});
test('output loop override changes playback policy while keeping the full track horizon', () => {
  const tracks=[{sequence:[{index:0,duration:100},{index:1,duration:100}],loop:true},{sequence:[{index:2,duration:150},{index:3,duration:150}],loop:true}];
  expect(composeTimeline(tracks,{loop:false}).durationMs).toBe(600);
  tracks[0].loop=false;
  expect(composeTimeline(tracks,{loop:true}).durationMs).toBe(300);
});
test('mixed playback completes looping joint cycles beyond the longest one-shot', () => {
  const t=(a,b,loop=true)=>({sequence:[{index:0,duration:a},{index:1,duration:b}],loop});
  expect(composeTimeline([t(100,100),t(150,150),t(125,125,false)]).durationMs).toBe(600);
  expect(composeTimeline([t(150,150),t(200,200,false)]).durationMs).toBe(600);
  expect(composeTimeline([t(100,100,false),t(200,200,false)]).durationMs).toBe(400);
});
test('explicit repetitions of one index remain separate timed holds', () => {
  const result=composeTimeline([{sequence:Array.from({length:3},()=>({index:0,duration:125})),loop:false}]);
  expect(result.durationMs).toBe(375);expect(result.steps.map(s=>s.durationMs)).toEqual([125,125,125]);expect(result.loop).toBe(false);
});
test('anchor presets match the authoring pivot coordinate convention', () => {
  expect(anchorPoint('top-left',8,6)).toEqual({x:0,y:0});
  expect(anchorPoint('center',8,6)).toEqual({x:4,y:3});
  expect(anchorPoint('top-center',8,6)).toEqual({x:4,y:0});
  expect(anchorPoint('bottom-center',8,6)).toEqual({x:4,y:5});
  expect(anchorPoint('bottom-left',8,6)).toEqual({x:0,y:5});
  expect(anchorPoint('bottom-right',8,6)).toEqual({x:7,y:5});
  expect(anchorPoint({x:-1,y:2},8,6)).toEqual({x:-1,y:2});
  expect(() => anchorPoint({x:.5,y:2},8,6)).toThrow(/integer/);
});

test('phase advances loops, delay lags loops, and one-shots clamp before and after playback', () => {
  const sequence=[{index:0,duration:100},{index:1,duration:200}];
  const result=composeTimeline([{sequence,phaseMs:150},{sequence,delayMs:50},{sequence,delayMs:150,loop:false}]);
  expect(result.durationMs).toBe(600);
  expect(result.steps.slice(0,3)).toEqual([
    {atMs:0,durationMs:50,frames:[1,1,0]},
    {atMs:50,durationMs:100,frames:[1,0,0]},
    {atMs:150,durationMs:100,frames:[0,1,0]},
  ]);
  expect(result.steps.at(-1).frames[2]).toBe(1);
  expect(composeTimeline([{sequence,phaseMs:100,loop:false}]).durationMs).toBe(200);
});

test('explicit duration completes all joint cycles and delayed one-shots without truncation', () => {
  const tracks=[{sequence:[{index:0,duration:100},{index:1,duration:100}]},{sequence:[{index:0,duration:70},{index:1,duration:80}],loop:false,delayMs:250}];
  expect(composeTimeline(tracks,{durationMs:600}).durationMs).toBe(600);
  expect(()=>composeTimeline(tracks,{durationMs:300})).toThrow(/complete|boundary/);
  expect(()=>composeTimeline(tracks,{durationMs:200})).toThrow(/complete|one-shot/);
  expect(()=>composeTimeline(tracks,{durationMs:0})).toThrow(/integer/);
});

test('101 and 103 ms child holds retain the full 20806 ms event-boundary period', () => {
  const make=n=>({sequence:[{index:0,duration:n},{index:1,duration:n}]});
  const result=composeTimeline([make(101),make(103)]);
  expect(result.durationMs).toBe(20806);
  expect(result.steps.length).toBeLessThan(420);
  expect(result.steps.reduce((sum,s)=>sum+s.durationMs,0)).toBe(20806);
});

test('configurable bounded track count retains the proof default and ignores static periods', () => {
  const tracks=Array.from({length:17},()=>({sequence:[{index:3,duration:999999}],phaseMs:123,delayMs:5}));
  expect(()=>composeTimeline(tracks)).toThrow(/16/);
  expect(composeTimeline(tracks,{maxTracks:1024,durationMs:125}).steps).toEqual([{atMs:0,durationMs:125,frames:Array(17).fill(3)}]);
  expect(()=>composeTimeline(tracks,{maxTracks:0})).toThrow(/integer/);
  expect(()=>composeTimeline([{sequence:[{index:0,duration:2},{index:1,duration:2}],phaseMs:0.5}])).toThrow(/integer/);
});

test('large safe loop offsets wrap before timeline arithmetic',()=>{
  const sequence=[{index:0,duration:2},{index:1,duration:3}],phaseMs=Number.MAX_SAFE_INTEGER;
  expect(composeTimeline([{sequence,phaseMs}])).toEqual(composeTimeline([{sequence,phaseMs:phaseMs%5}]));
  expect(composeTimeline([{sequence,delayMs:phaseMs}])).toEqual(composeTimeline([{sequence,delayMs:phaseMs%5}]));
});

test('static selections ignore period arithmetic while retaining explicit one-shot playback policy',()=>{
  expect(composeTimeline([{sequence:[{index:7,duration:125}],loop:false}])).toEqual({durationMs:125,loop:false,steps:[{atMs:0,durationMs:125,frames:[7]}]});
});

test('a delayed single-pose one-shot finishes its hold alongside a repeating animation',()=>{
  const tracks=[{sequence:[{index:0,duration:100},{index:1,duration:100}]},{sequence:[{index:2,duration:500}],loop:false,delayMs:700}];
  const result=composeTimeline(tracks);
  expect(result.durationMs).toBe(1200);expect(result.loop).toBe(false);
  expect(result.steps.map(step=>step.frames[1])).toEqual(Array(12).fill(2));
  expect(()=>composeTimeline(tracks,{durationMs:200})).toThrow(/one-shot/);
  expect(composeTimeline([tracks[1]]).durationMs).toBe(1200);
});
