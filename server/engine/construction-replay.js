import { createHash } from 'node:crypto';
import { createCanvas } from 'canvas';
import { CanvasRenderer } from './canvas-renderer.js';
import { Palette } from './palette.js';
import { patternTest } from './patterns.js';
import { buildLayerTree } from '../web/public/js/shared/shape-layers.js';

export const CONSTRUCTION_REPLAY_LIMITS = Object.freeze({ maxCells: 16, maxRecords: 2048, maxBytes: 32 * 1024 * 1024, maxPixels: 64_000_000 });
const geometry = { point:['x','y'], fill:['x','y'], line:['x1','y1','x2','y2'], rect:['x','y','w','h'], circle:['cx','cy','r'], ellipse:['cx','cy','rx','ry'], polygon:['points'], polyline:['points'] };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = value => typeof value === 'string' && value.length > 0;
const positive = value => Number.isSafeInteger(value) && value > 0;
const fail = message => { throw new Error(`Construction replay: ${message}`); };
function freeze(value) {
  if (object(value) || Array.isArray(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
function relativePath(path) {
  return text(path) && !path.includes('\\') && !/^(?:\/|[a-z]:)/i.test(path) && !path.includes('\0');
}
function settings(config) {
  if (!object(config) || Object.keys(config).some(key => !['cells','maxSteps'].includes(key))) fail('replay requires cells and optional maxSteps');
  if (!Array.isArray(config.cells) || !config.cells.length || config.cells.length > CONSTRUCTION_REPLAY_LIMITS.maxCells || new Set(config.cells).size !== config.cells.length || config.cells.some(ref => typeof ref !== 'string' || !/^(0|[1-9]\d*),(0|[1-9]\d*)$/.test(ref))) fail('replay cells must select 1–16 unique R,C coordinates');
  const maxSteps = config.maxSteps ?? 512;
  if (!positive(maxSteps) || maxSteps > CONSTRUCTION_REPLAY_LIMITS.maxRecords) fail('maxSteps must be an integer from 1 through 2048');
  return { cells: [...config.cells], maxSteps };
}
function validateInputs(inputs) {
  if (!Array.isArray(inputs) || !inputs.length) fail('declared hashed source inputs are required');
  const seen = new Set();
  for (const input of inputs) {
    if (!object(input) || !relativePath(input.path) || !hash(input.sha256) || seen.has(input.path)) fail('invalid declared source input/hash');
    seen.add(input.path);
  }
}
function validateSource(source, inputs) {
  if (!object(source) || !['ops','generator','recipe'].includes(source.kind) || !relativePath(source.path)) fail('invalid source identity');
  if (!hash(source.sha256) || inputs.find(input => input.path === source.path)?.sha256 !== source.sha256) fail('source hash does not match declared input');
  if (source.kind === 'ops' && (typeof source.pointer !== 'string' || !/^\/\d+$/.test(source.pointer))) fail('ops source requires a JSON pointer');
  if (source.kind === 'generator' && (!Number.isSafeInteger(source.expandedOperationIndex) || source.expandedOperationIndex < 0)) fail('generator source requires an expanded operation index');
  if (source.kind === 'recipe' && (typeof source.pointer !== 'string' || !/^\/[a-z]+$/.test(source.pointer))) fail('recipe source requires its config pointer');
  if (('line' in source || 'column' in source) && (!positive(source.line) || !positive(source.column))) fail('source line/column must be positive integers');
  if (source.declaration) validateSource(source.declaration, inputs);
}
function operationIdentity(operation, operationIndex, source) { return digest({ operationIndex, operation, source }); }
function stepMetadata(record, step) {
  return { step, operationIndex:record.operationIndex, id:record.id, label:record.label, command:record.command, source:structuredClone(record.source) };
}
function selectedState(project, refs) {
  return { cells:Object.fromEntries(refs.map(ref => [ref, structuredClone(project.cells.getCell(ref).toJSON())])), palette:project.palette.toJSON(), background:structuredClone(project.background) };
}

/** Capture only after the real mapped API operation has successfully executed. */
export function createConstructionRecorder(config, { operations, source, inputs, sourceContents = {} }) {
  const { cells, maxSteps } = settings(config);
  validateInputs(inputs);
  const declared = inputs.find(input => input.path === source.path);
  if (!declared) fail('build source must be a declared hashed input');
  const identities = operations.map((operation, operationIndex) => {
    const identity = { ...source, sha256:declared.sha256,
      ...(source.kind === 'ops' ? { pointer:`/${operationIndex}` } : source.kind === 'generator' ? { expandedOperationIndex:operationIndex } : {}) };
    const annotation = operation.replay;
    if (annotation !== undefined) {
      if (!object(annotation) || Object.keys(annotation).some(key => !['label','source'].includes(key)) || ('label' in annotation && (!text(annotation.label) || annotation.label.length > 1024))) fail(`operation ${operationIndex} replay annotation requires a bounded label and optional source`);
      if (annotation.source !== undefined) {
        const position = annotation.source;
        if (!object(position) || Object.keys(position).some(key => !['path','line','column'].includes(key)) || !relativePath(position.path) || !positive(position.line) || !positive(position.column)) fail(`operation ${operationIndex} source annotation requires relative path and positive line/column`);
        const input = inputs.find(input => input.path === position.path), content = sourceContents[position.path];
        if (!input || typeof content !== 'string' || createHash('sha256').update(content).digest('hex') !== input.sha256) fail(`operation ${operationIndex} source annotation must reference a declared hashed input`);
        const lines = content.split(/\r\n|\n|\r/);
        if (position.line > lines.length || position.column > lines[position.line - 1].length) fail(`operation ${operationIndex} source position is outside the actual source`);
        if (position.path !== identity.path) identity.declaration = { ...identity };
        Object.assign(identity, position, { sha256:input.sha256 });
      }
    }
    validateSource(identity, inputs);
    return { operation:structuredClone(operation), operationIndex, command:operation.command,
      label:annotation?.label ?? [operation.command, operation.name ?? operation.shape ?? operation.type].filter(Boolean).join(' '), source:identity,
      id:operationIdentity(operation, operationIndex, identity) };
  });
  const trace = { format:'agent-sprites-construction-replay', version:1, source:{ ...source, sha256:declared.sha256 }, inputs:structuredClone(inputs), operationsSha256:digest(operations), cells, maxSteps, records:[] };
  let previous, bytes = 0;
  return {
    capture(project, operationIndex) {
      if (!identities[operationIndex]) fail('invalid operation index');
      const state = selectedState(project, cells), serialized = JSON.stringify(state);
      if (serialized === previous) return false;
      const width = project.cellWidth, height = project.cellHeight;
      if (trace.records.length >= maxSteps) fail(`maxSteps (${maxSteps}) exceeded; increase the explicit replay budget`);
      if ((trace.records.length + 1) * cells.length * width * height > CONSTRUCTION_REPLAY_LIMITS.maxPixels) fail('64 million logical snapshot pixel budget exceeded');
      const record = { ...identities[operationIndex], ...state };
      // Match the published two-space JSON exactly, including record indentation.
      const recordJson = JSON.stringify(record,null,2);
      const recordBytes = Buffer.byteLength(recordJson) + 4 * recordJson.split('\n').length;
      const baseBytes = bytes || Buffer.byteLength(JSON.stringify({...trace,width,height},null,2)+'\n');
      const nextBytes = baseBytes + recordBytes + (trace.records.length ? 2 : 4);
      if (nextBytes > CONSTRUCTION_REPLAY_LIMITS.maxBytes) fail('32 MiB serialized trace budget exceeded');
      trace.width = width; trace.height = height; trace.records.push(record);
      previous = serialized; bytes = nextBytes;
      return true;
    },
    finish(project) { project.constructionReplay = validateConstructionReplay(trace, project); return project.constructionReplay; },
  };
}

function snapshotWork(snapshot, width, height) {
  let work = buildLayerTree(snapshot.shapes, width, height).rasterWork;
  for (const shape of snapshot.shapes) {
    const p = shape.params;
    if (shape.visible === false) continue;
    if (shape.type === 'point') work++;
    else if (shape.type === 'fill') {const surface=p.layers?.at(-1);work += surface ? surface.w*surface.h : width*height;}
    else if (shape.type === 'line') work += Math.max(Math.abs(p.x2-p.x1),Math.abs(p.y2-p.y1))+1;
    else if (shape.type === 'rect') work += p.pattern && p.filled !== false ? Math.abs(p.w*p.h) : 4;
    else if (shape.type === 'circle') work += (2*p.r+1)**2 + 8*(p.r+1);
    else if (shape.type === 'ellipse') work += (2*p.rx+1)*(2*p.ry+1) + 8*(p.rx+p.ry+1);
    else {
      const xs=p.points.map(point=>point.x),ys=p.points.map(point=>point.y);
      const w=Math.max(...xs)-Math.min(...xs)+1,h=Math.max(...ys)-Math.min(...ys)+1;
      work += w*h + (w+h)*p.points.length;
    }
    if (!Number.isFinite(work) || work < 0 || work > CONSTRUCTION_REPLAY_LIMITS.maxPixels) fail('shape raster work budget exceeded');
  }
  return work;
}
function validateSnapshot(cell, width, height) {
  if (!object(cell) || !Array.isArray(cell.shapes) || (cell.name !== null && typeof cell.name !== 'string')) fail('invalid cell snapshot');
  const ids = new Set(), names = new Set();
  for (const shape of cell.shapes) {
    if (!object(shape) || !text(shape.id) || ids.has(shape.id) || !Object.hasOwn(geometry, shape.type) || !object(shape.params) || !text(shape.color) || !Number.isFinite(shape.zIndex) || typeof shape.visible !== 'boolean' || (shape.name !== null && typeof shape.name !== 'string')) fail('invalid shape snapshot');
    ids.add(shape.id);
    if (shape.name) { if (names.has(shape.name)) fail('duplicate shape name in snapshot'); names.add(shape.name); }
    const p = shape.params;
    for (const key of geometry[shape.type]) {
      if (key === 'points') {
        if (!Array.isArray(p.points) || p.points.length < 2 || p.points.length > 65536 || p.points.some(point => !object(point) || ![point.x,point.y].every(n => Number.isFinite(n) && Math.abs(n) <= 1_048_576))) fail('invalid shape points/bounds');
      } else if (!Number.isFinite(p[key]) || Math.abs(p[key]) > 1_048_576) fail(`invalid shape geometry/bounds ${key}`);
    }
    for (const key of ['w','h','r','rx','ry']) if (key in p && p[key] < 0) fail('negative shape geometry');
    for (const key of ['erase','filled']) if (key in p && typeof p[key] !== 'boolean') fail(`invalid shape ${key}`);
    if (p.pattern !== undefined) patternTest(p.pattern);
    if (p.color2 !== undefined && !text(p.color2)) fail('invalid shape secondary color');
  }
  snapshotWork(cell,width,height);
}

/** Validate portable evidence without allocating Shape objects or consulting local source files. */
export function validateConstructionReplay(value, project) {
  if (!object(value) || value.format !== 'agent-sprites-construction-replay' || value.version !== 1) fail('unsupported trace schema');
  const { cells, maxSteps } = settings({ cells:value.cells, maxSteps:value.maxSteps });
  if (!positive(value.width) || !positive(value.height) || (project && (value.width !== project.cellWidth || value.height !== project.cellHeight))) fail('snapshot dimensions do not match project');
  if (!Array.isArray(value.records) || !value.records.length || value.records.length > maxSteps) fail('invalid trace record count/maxSteps');
  if (value.records.length * cells.length * value.width * value.height > CONSTRUCTION_REPLAY_LIMITS.maxPixels) fail('64 million logical snapshot pixel budget exceeded');
  if (Buffer.byteLength(JSON.stringify(value,null,2)+'\n') > CONSTRUCTION_REPLAY_LIMITS.maxBytes) fail('32 MiB serialized trace budget exceeded');
  validateInputs(value.inputs);
  if (!hash(value.operationsSha256)) fail('invalid expanded operations hash');
  if (!object(value.source) || !['ops','generator','recipe'].includes(value.source.kind) || value.inputs.find(input => input.path === value.source.path)?.sha256 !== value.source.sha256) fail('invalid build source hash');
  if (project) for (const ref of cells) project.cells.getCell(ref);
  let lastIndex = -1;
  for (const record of value.records) {
    if (!object(record) || !Number.isSafeInteger(record.operationIndex) || record.operationIndex <= lastIndex || !text(record.command) || typeof record.label !== 'string' || record.label.length > 1024 || !object(record.operation) || record.command !== record.operation.command) fail('invalid operation record');
    lastIndex = record.operationIndex;
    validateSource(record.source, value.inputs);
    if (record.id !== operationIdentity(record.operation, record.operationIndex, record.source)) fail('operation identity hash does not match evidence');
    if (!object(record.cells) || Object.keys(record.cells).length !== cells.length || cells.some(ref => !Object.hasOwn(record.cells, ref))) fail('invalid selected cell snapshots');
    for (const ref of cells) validateSnapshot(record.cells[ref], value.width, value.height);
    if (!Array.isArray(record.palette) || record.palette.some(color => !object(color) || !text(color.name) || !text(color.color))) fail('invalid palette snapshot');
    if (!object(record.background) || !['transparent','chroma'].includes(record.background.mode) || (record.background.mode === 'chroma' && !text(record.background.color))) fail('invalid background snapshot');
  }
  if (value.records[0].operationIndex !== 0 || value.records[0].command !== 'new') fail('trace must start after the initial new operation');
  return freeze(structuredClone(value));
}

function traceFor(project) {
  if (!project.constructionReplay) fail('no construction replay exists for this project; enable replay in an isolated build');
  return project.constructionReplay;
}
export function constructionReplayMetadata(project) {
  const trace = traceFor(project);
  return { kind:'construction', source:structuredClone(trace.source), cells:[...trace.cells], width:trace.width, height:trace.height,
    operationsSha256:trace.operationsSha256, inputs:structuredClone(trace.inputs), limits:{ ...CONSTRUCTION_REPLAY_LIMITS, maxSteps:trace.maxSteps },
    steps:trace.records.map(stepMetadata), contributionPolicy:'Canonical after RGBA at changed pixels; cleared pixels are transparent and explicitly identified by changedMask and clearedPixels.' };
}
function descriptor(snapshot, trace) {
  return { width:trace.width, height:trace.height, shapes:{ listByZ:() => snapshot.shapes.toSorted((a,b) => a.zIndex - b.zIndex) } };
}
function raster(record, ref, trace) {
  return new CanvasRenderer(Palette.fromJSON(record.palette), { background:record.background }).renderCellRaw(descriptor(record.cells[ref], trace));
}
function png(data, width, height, scale) {
  const canvas = createCanvas(width,height), ctx = canvas.getContext('2d'), image = ctx.createImageData(width,height);
  image.data.set(data); ctx.putImageData(image,0,0);
  if (scale === 1) return canvas.toBuffer('image/png');
  const scaled = createCanvas(width*scale,height*scale), sctx = scaled.getContext('2d');
  sctx.imageSmoothingEnabled = false; sctx.drawImage(canvas,0,0,scaled.width,scaled.height);
  return scaled.toBuffer('image/png');
}
function equal(a,b) { return a.length === b.length && a.every((value,index) => value === b[index]); }

export function renderConstructionReplay(project, { cell, step, scale = 1 } = {}) {
  const trace = traceFor(project);
  if (!trace.cells.includes(cell)) fail('cell was not selected in this construction trace');
  if (!Number.isSafeInteger(step) || step < 0 || step >= trace.records.length) fail('step must select an existing recorded step');
  if (!Number.isInteger(scale) || scale < 1 || scale > 8) fail('scale must be an integer from 1 through 8');
  const {width,height} = trace;
  // Four encoded views plus the final/current comparisons share one query budget.
  if (width * height * (4 * scale * scale + 4) > CONSTRUCTION_REPLAY_LIMITS.maxPixels) fail('64 million replay query pixel budget exceeded');
  const record = trace.records[step], final = trace.records.at(-1);
  const previous = step ? trace.records[step-1] : { ...record, cells:{ [cell]:{ shapes:[] } } };
  const liveCell = project.cells.getCell(cell), current = selectedState(project,[cell]);
  // Live resize/edit operations can introduce geometry that was never part of
  // the validated construction trace. Validate it before estimating any work.
  validateSnapshot(current.cells[cell],width,height);
  const work=[record.cells[cell],previous.cells[cell],final.cells[cell],current.cells[cell]].reduce((sum,snapshot)=>sum+snapshotWork(snapshot,width,height),4*width*height*scale*scale);
  if (!Number.isFinite(work) || work < 0 || work > CONSTRUCTION_REPLAY_LIMITS.maxPixels) fail('64 million replay query raster work budget exceeded');
  const after = raster(record, cell, trace);
  const before = raster(previous, cell, trace), contribution = new Uint8ClampedArray(after.length), mask = new Uint8ClampedArray(after.length);
  let changedPixels = 0, clearedPixels = 0, minX=width, minY=height, maxX=-1, maxY=-1;
  for (let i=0; i<after.length; i+=4) {
    if (after[i]===before[i] && after[i+1]===before[i+1] && after[i+2]===before[i+2] && after[i+3]===before[i+3]) continue;
    changedPixels++;
    if (!after[i+3]) clearedPixels++;
    else contribution.set(after.subarray(i,i+4),i);
    mask.set([255,255,255,255],i);
    const x=i/4%width,y=Math.floor(i/4/width); minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
  }
  const sameState = JSON.stringify(current) === JSON.stringify({cells:{[cell]:final.cells[cell]},palette:final.palette,background:final.background});
  const live = new CanvasRenderer(project.palette,{background:project.background}).renderCellRaw(liveCell);
  return { kind:'construction', cell, step:stepMetadata(record,step), width:width*scale, height:height*scale, changedPixels, clearedPixels,
    changedBounds:changedPixels ? {x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1} : null,
    current:{sameState,samePixels:equal(live,raster(final,cell,trace))},
    images:{before:png(before,width,height,scale),after:png(after,width,height,scale),contribution:png(contribution,width,height,scale),changedMask:png(mask,width,height,scale)} };
}
