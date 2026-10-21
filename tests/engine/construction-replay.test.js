import { test, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { Image, createCanvas } from 'canvas';
import { Project } from '../../server/engine/project.js';
import { Shape } from '../../server/engine/shape.js';
import { CanvasRenderer } from '../../server/engine/canvas-renderer.js';
import * as replay from '../../server/engine/construction-replay.js';

const hash = text => createHash('sha256').update(text).digest('hex');
function setup(options = {}) {
  const operations = [{ command: 'new' }, { command: 'draw' }, { command: 'delete' }];
  const project = Project.create({ name: 'trace', cellSize: 8, rows: 1, cols: 2 });
  const recorder = replay.createConstructionRecorder({ cells: ['0,0'], ...options }, {
    operations, source: { kind: 'ops', path: 'ops.json' },
    inputs: [{ path: 'ops.json', sha256: hash('[]') }], sourceContents: { 'ops.json': '[]' },
  });
  recorder.capture(project, 0);
  return { project, recorder, cell: project.cells.getCell('0,0') };
}
function raw(png) {
  const image = new Image(); image.src = png;
  const canvas = createCanvas(image.width, image.height), ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  return [...ctx.getImageData(0, 0, image.width, image.height).data];
}

test('records actual changed selected states, deep snapshots and read-only erased contribution', () => {
  const { project, recorder, cell } = setup();
  project.cells.getCell('0,1').draw('point', { x: 1, y: 1 }, '#ffffff');
  recorder.capture(project, 1); // unselected edit is not construction evidence for this cell
  cell.draw('rect', { x: 1, y: 1, w: 2, h: 2, filled: true }, '#ff0000', 'detail');
  recorder.capture(project, 1);
  cell.deleteShape('detail'); recorder.capture(project, 2); recorder.finish(project);
  const metadata = replay.constructionReplayMetadata(project);
  expect(metadata).toMatchObject({ kind: 'construction', cells: ['0,0'] });
  expect(metadata.steps.map(s => s.operationIndex)).toEqual([0, 1, 2]);
  expect(metadata.steps[1]).toMatchObject({ source: { kind: 'ops', path: 'ops.json', pointer: '/1' } });
  expect(metadata.steps[1].id).toMatch(/^[a-f0-9]{64}$/);
  const before = JSON.stringify(project.toJSON()), history = cell._undoStack.length;
  const priorId = Number(new Shape('point', {}, '#fff').id.slice(1));
  const view = replay.renderConstructionReplay(project, { cell: '0,0', step: 2 });
  expect(view).toMatchObject({ kind: 'construction', width: 8, height: 8, changedPixels: 4, clearedPixels: 4,
    changedBounds: { x: 1, y: 1, w: 2, h: 2 }, current: { sameState: true, samePixels: true } });
  expect(raw(view.images.before).filter((_, i) => i % 4 === 3 && raw(view.images.before)[i])).toHaveLength(4);
  expect(raw(view.images.contribution).every(n => n === 0)).toBe(true);
  expect(raw(view.images.changedMask).filter((n, i) => i % 4 === 3 && n)).toHaveLength(4);
  expect(Number(new Shape('point', {}, '#fff').id.slice(1))).toBe(priorId + 1);
  expect(JSON.stringify(project.toJSON())).toBe(before); expect(cell._undoStack.length).toBe(history);
  cell.undo();
  expect(replay.renderConstructionReplay(project, { cell: '0,0', step: 1 }).current).toEqual({ sameState: false, samePixels: false });
  expect(project.constructionReplay.records[2].cells['0,0'].shapes).toEqual([]);
});

test('canonical rendering preserves primitives, patterns, flood fills, z-order, erasers and backgrounds', () => {
  const { project, recorder, cell } = setup();
  const shapes = [
    ['rect', { x: 0, y: 0, w: 8, h: 8, filled: true, pattern: 'checker', color2: '#0000ff' }],
    ['circle', { cx: 3, cy: 3, r: 2, filled: true }],
    ['ellipse', { cx: 4, cy: 3, rx: 2, ry: 1, filled: false }],
    ['polygon', { points: [{x:1,y:1},{x:5,y:1},{x:3,y:5}], filled: true }],
    ['polyline', { points: [{x:1,y:1},{x:5,y:5},{x:7,y:1}] }],
    ['line', { x1: 0, y1: 7, x2: 7, y2: 0 }], ['point', { x: 7, y: 7 }],
    ['fill', { x: 0, y: 0 }], ['rect', { x: 2, y: 2, w: 2, h: 2, erase: true }],
  ];
  for (const [type, params] of shapes) cell.draw(type, params, '#00ff00');
  project.background = { mode: 'chroma', color: '#333333' };
  recorder.capture(project, 1); recorder.finish(project);
  const normal = new CanvasRenderer(project.palette, { background: project.background }).renderCell(cell);
  const view = replay.renderConstructionReplay(project, { cell: '0,0', step: 1, scale: 1 });
  expect(view.images.after.equals(normal)).toBe(true);
  const serialized = project.toJSON(), restored = Project.fromJSON(serialized);
  expect(restored.toJSON()).toEqual(serialized);
  serialized.constructionReplay.records[1].cells['0,0'].shapes.length = 0;
  expect(restored.constructionReplay.records[1].cells['0,0'].shapes).toHaveLength(shapes.length);
  expect(Object.isFrozen(restored.constructionReplay.records[1].cells['0,0'].shapes)).toBe(true);
});

test('rejects missing trace, invalid queries, capture limits and malformed imported evidence', () => {
  const empty = Project.create({ name:'empty', cellSize:8, rows:1, cols:1 });
  expect(() => replay.constructionReplayMetadata(empty)).toThrow(/no construction replay/i);
  const { project, recorder, cell } = setup({ maxSteps: 1 });
  cell.draw('point', { x:1,y:1 }, '#fff');
  expect(() => recorder.capture(project, 1)).toThrow(/maxSteps/);
  const built = setup(); built.recorder.finish(built.project);
  for (const query of [{ cell:'0,1',step:0 }, {cell:'0,0',step:2}, {cell:'0,0',step:0,scale:9}]) {
    expect(() => replay.renderConstructionReplay(built.project, query)).toThrow();
  }
  const data = built.project.toJSON();
  data.constructionReplay.records[0].source.sha256 = '0'.repeat(64);
  expect(() => Project.fromJSON(data)).toThrow(/source.*hash/i);
  const malformed = built.project.toJSON();
  malformed.constructionReplay.records[0].cells['0,0'].shapes = [{ type:'made-up' }];
  expect(() => Project.fromJSON(malformed)).toThrow(/shape/i);
});

test('palette/background changes are recorded and preserve the live undo history independently', () => {
  const { project, recorder, cell } = setup();
  project.palette.add('ink', '#ff0000');
  cell.draw('point', {x:1,y:1}, 'ink', 'dot'); recorder.capture(project,1);
  project.palette.update('ink','#0000ff'); project.background={mode:'chroma',color:'#333333'};
  recorder.capture(project,2); recorder.finish(project);
  expect(replay.constructionReplayMetadata(project).steps).toHaveLength(3);
  const view=replay.renderConstructionReplay(project,{cell:'0,0',step:2});
  expect(view.changedPixels).toBe(64); expect(view.clearedPixels).toBe(0);
  expect(raw(view.images.after).slice(36,40)).toEqual([0,0,255,255]);
  const original=JSON.stringify(project.constructionReplay);cell.moveShape('dot',1,1);cell.undo();
  expect(JSON.stringify(project.constructionReplay)).toBe(original);
});

test('imported oversized raster geometry is rejected before canonical rendering can loop', () => {
  const {project,recorder}=setup();recorder.finish(project);
  const data=project.toJSON();
  data.constructionReplay.records[0].cells['0,0'].shapes=[{id:'s1',name:null,type:'circle',params:{cx:0,cy:0,r:1e100,filled:true},color:'#fff',zIndex:0,visible:true}];
  expect(()=>Project.fromJSON(data)).toThrow(/shape.*bound|raster.*budget/i);
});

test('malformed live ellipse cannot cancel a huge circle out of the replay raster budget', () => {
  const {project,recorder,cell}=setup();recorder.finish(project);
  cell.draw('ellipse',{cx:0,cy:0,rx:1,ry:1,filled:true},'#fff','ellipse');
  cell.draw('circle',{cx:0,cy:0,r:1,filled:true},'#fff','circle');
  cell.updateShapeParams('ellipse',{rx:100000,ry:-100000});
  cell.updateShapeParams('circle',{r:100000});
  // Stop at the rendering boundary so this regression cannot execute billions of pixels.
  const raster=vi.spyOn(CanvasRenderer.prototype,'renderCellRaw').mockImplementation(()=>{throw new Error('canonical renderer reached');});
  try {
    expect(()=>replay.renderConstructionReplay(project,{cell:'0,0',step:0})).toThrow(/negative shape geometry/);
    expect(raster).not.toHaveBeenCalled();
  } finally { raster.mockRestore(); }
});

test('recording rejects hard cell/record, cumulative snapshot pixel and serialized byte limits',()=>{
  expect(()=>setup({maxSteps:2049})).toThrow(/2048/);
  const operations=[{command:'new'}], inputs=[{path:'ops.json',sha256:hash('[]')}], source={kind:'ops',path:'ops.json'};
  const recorder=replay.createConstructionRecorder({cells:['0,0']},{operations,inputs,source});
  const huge=Project.create({name:'large',cellSize:8001,rows:1,cols:1});
  expect(()=>recorder.capture(huge,0)).toThrow(/snapshot pixel budget/);
  const bytes=replay.createConstructionRecorder({cells:['0,0']},{operations:[{command:'new',payload:'x'.repeat(32*1024*1024)}],inputs,source});
  expect(()=>bytes.capture(Project.create({name:'bytes',cellSize:1,rows:1,cols:1}),0)).toThrow(/32 MiB/);
  // Indentation in the published trace counts too; compact JSON alone is below the cap.
  const indented=replay.createConstructionRecorder({cells:['0,0']},{operations:[{command:'new',payload:Array(3_000_000).fill(0)}],inputs,source});
  expect(()=>indented.capture(Project.create({name:'indent',cellSize:1,rows:1,cols:1}),0)).toThrow(/32 MiB/);
});

test.each(['checker','stripes','sparse','scatter'])('canonical %s pattern replay retains exact final pixels',pattern=>{
  const {project,recorder,cell}=setup();
  cell.draw('rect',{x:0,y:0,w:8,h:8,filled:true,pattern,color2:'#6688aa'},'#eecc00');
  recorder.capture(project,1);recorder.finish(project);
  expect(replay.renderConstructionReplay(project,{cell:'0,0',step:1}).images.after.equals(new CanvasRenderer(project.palette).renderCell(cell))).toBe(true);
});
