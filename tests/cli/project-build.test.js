import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProject } from '../../server/build/project-build.js';
import { Project } from '../../server/engine/project.js';
import { SessionDB } from '../../server/db/session.js';
import { startWebServer } from '../../server/web/http.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

let dir, config, ops;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sprite-build-'));
  config = join(dir, 'sprite-project.json');
  ops = [
    { command: 'new', name: 'robot', size: 16, rows: 1, cols: 2 },
    { command: 'draw', type: 'rect', cell: '0,0', name: 'body', x: 4, y: 3, w: 8, h: 10, color: '#29adff', filled: true },
    { command: 'clone-cell', from: '0,0', to: ['0,1'] },
    { command: 'name', cell: '0,0', as: 'idle' },
    { command: 'group', sub: 'create', name: 'blink', cells: ['0,0','0,1'], fps: 4 },
    { command: 'shape-group', sub: 'create', cell: '0,0', name: 'character', shapes: ['body'] },
  ];
  writeFileSync(join(dir, 'ops.json'), JSON.stringify(ops));
  writeFileSync(config, JSON.stringify({ version: 1, ops: 'ops.json', output: 'dist', expectedTags: ['blink'] }));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('build emits portable editable metadata and review artifacts with reproducible pixels', async () => {
  const result = await buildProject(config);
  expect(result.ok).toBe(true);
  for (const file of ['robot.png','robot.atlas.json','robot.project.json','contact.png','preview.html','verification.json','operations.json']) expect(existsSync(join(dir,'dist',file))).toBe(true);
  const project = Project.load(join(dir,'dist','robot.project.json'));
  expect(project.animationFps.blink).toBe(4);
  expect(project.shapeGroups['0,0'].character).toEqual(['body']);
  expect(project.exportAseprite().meta.frameTags[0].name).toBe('blink');
  expect(project.exportAseprite().frames[2].duration).toBe(250);
  const png = readFileSync(join(dir,'dist','robot.png'));
  expect((await buildProject(config)).ok).toBe(true);
  expect(readFileSync(join(dir,'dist','robot.png')).equals(png)).toBe(true);
  expect(readFileSync(join(dir,'dist','preview.html'),'utf8')).toContain('data:image/png;base64,');
  expect(readFileSync(join(dir,'dist','verification.json'),'utf8')).not.toContain('.staging-');
});

test('failed operations and missing tags preserve last successful output', async () => {
  expect((await buildProject(config)).ok).toBe(true);
  const old = readFileSync(join(dir,'dist','robot.png'));
  ops.push({ command: 'draw', type: 'rect', cell: '20,20', x:0,y:0,w:2,h:2,color:'#fff',filled:true });
  writeFileSync(join(dir,'ops.json'),JSON.stringify(ops));
  expect((await buildProject(config)).ok).toBe(false);
  expect(readFileSync(join(dir,'dist','robot.png')).equals(old)).toBe(true);
  ops.pop(); writeFileSync(join(dir,'ops.json'),JSON.stringify(ops));
  writeFileSync(config,JSON.stringify({version:1,ops:'ops.json',output:'dist',expectedTags:['walk']}));
  expect((await buildProject(config)).ok).toBe(false);
  expect(readFileSync(join(dir,'dist','robot.png')).equals(old)).toBe(true);
});

test('required static frames reject a renamed alias and preserve the last successful output', async () => {
  writeFileSync(config,JSON.stringify({version:1,ops:'ops.json',output:'dist',expectedFrames:['idle']}));
  expect((await buildProject(config)).ok).toBe(true);
  const old = readFileSync(join(dir,'dist','robot.atlas.json'));
  ops.find(op=>op.command==='name').as='renamed';
  writeFileSync(join(dir,'ops.json'),JSON.stringify(ops));
  const result = await buildProject(config);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result.errors)).toContain('Required frame is missing: idle');
  expect(readFileSync(join(dir,'dist','robot.atlas.json')).equals(old)).toBe(true);
});

test.each(['idle', [42], ['']])('rejects invalid expectedFrames %j before publishing', async expectedFrames => {
  writeFileSync(config,JSON.stringify({version:1,ops:'ops.json',output:'dist',expectedFrames}));
  const result=await buildProject(config);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result.errors)).toContain('expectedFrames must be an array of frame names');
  expect(existsSync(join(dir,'dist'))).toBe(false);
});

test('refuses lifecycle writes and non-build-owned output directories', async () => {
  ops.push({command:'export',dest:join(dir,'escaped')});
  writeFileSync(join(dir,'ops.json'),JSON.stringify(ops));
  expect((await buildProject(config)).ok).toBe(false);
  expect(existsSync(join(dir,'escaped'))).toBe(false);
  ops.pop(); writeFileSync(join(dir,'ops.json'),JSON.stringify(ops));
  mkdirSync(join(dir,'dist')); writeFileSync(join(dir,'dist','mine.txt'),'keep');
  expect((await buildProject(config)).ok).toBe(false);
  expect(readFileSync(join(dir,'dist','mine.txt'),'utf8')).toBe('keep');
});

test('runs an explicit Node generator relative to config and captures its operations', async () => {
  writeFileSync(join(dir,'generate.mjs'), `console.log(JSON.stringify(${JSON.stringify(ops)}));`);
  writeFileSync(config, JSON.stringify({version:1,generator:'generate.mjs',output:'dist'}));
  expect((await buildProject(config)).ok).toBe(true);
  expect(JSON.parse(readFileSync(join(dir,'dist','operations.json'),'utf8'))).toEqual(ops);
});

test.skipIf(process.platform !== 'win32')('Windows config path casing does not change output ownership', async () => {
  expect((await buildProject(config)).ok).toBe(true);
  expect((await buildProject(config.toLowerCase())).ok).toBe(true);
});

test('a copied project rebuilds its dedicated output without changing relative layout', async () => {
  expect((await buildProject(config)).ok).toBe(true);
  const destination = join(dir, 'relocated');
  mkdirSync(destination);
  cpSync(config, join(destination, 'sprite-project.json'));
  cpSync(join(dir, 'ops.json'), join(destination, 'ops.json'));
  cpSync(join(dir, 'dist'), join(destination, 'dist'), { recursive: true });
  const png = readFileSync(join(destination, 'dist', 'robot.png'));
  const result = await buildProject(join(destination, 'sprite-project.json'));
  expect(result.errors).toEqual([]);
  expect(result.ok).toBe(true);
  expect(readFileSync(join(destination, 'dist', 'robot.png')).equals(png)).toBe(true);
  const marker = JSON.parse(readFileSync(join(destination, 'dist', '.agent-sprites-build.json'), 'utf8'));
  expect(marker.version).toBe(2);
  expect(marker.config).toBe('../sprite-project.json');
});

test('legacy absolute ownership is upgraded only at its original location', async () => {
  expect((await buildProject(config)).ok).toBe(true);
  const markerPath = join(dir, 'dist', '.agent-sprites-build.json');
  const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
  writeFileSync(markerPath, JSON.stringify({ ...marker, version: 1, config }));
  expect((await buildProject(config)).ok).toBe(true);
  const upgraded = JSON.parse(readFileSync(markerPath, 'utf8'));
  expect(upgraded.version).toBe(2);
  expect(upgraded.config).toBe('../sprite-project.json');

  const foreignOwner = join(dir, 'previous-location', 'sprite-project.json');
  writeFileSync(markerPath, JSON.stringify({ ...marker, version: 1, config: foreignOwner }));
  const oldMarker = readFileSync(markerPath, 'utf8');
  expect((await buildProject(config)).ok).toBe(false);
  expect(readFileSync(markerPath, 'utf8')).toBe(oldMarker);
});

test('portable ownership rejects another config and preserves unexpected files', async () => {
  expect((await buildProject(config)).ok).toBe(true);
  const alternate = join(dir, 'different-project.json');
  cpSync(config, alternate);
  const png = readFileSync(join(dir, 'dist', 'robot.png'));
  expect((await buildProject(alternate)).ok).toBe(false);
  expect(readFileSync(join(dir, 'dist', 'robot.png')).equals(png)).toBe(true);
  writeFileSync(join(dir, 'dist', 'notes.txt'), 'keep my notes');
  expect((await buildProject(config)).ok).toBe(false);
  expect(readFileSync(join(dir, 'dist', 'notes.txt'), 'utf8')).toBe('keep my notes');
  expect(readFileSync(join(dir, 'dist', 'robot.png')).equals(png)).toBe(true);
});

test('CLI build ignores the live server; portable files reopen with timing and shape groups', async () => {
  const db = new SessionDB(':memory:'), state = {db,project:null,sessionId:null};
  const server = await startWebServer(state,0), url=`http://127.0.0.1:${server.port}`;
  const api=async (path,body)=> (await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
  try {
    await api('/api/session/new',{name:'live',rows:1,cols:1});
    const id=state.sessionId, before=JSON.stringify(state.project.toJSON());
    const built=await exec(process.execPath,[join(process.cwd(),'scripts/sprite.js'),'build',config,'--json'],{cwd:tmpdir(),env:{...process.env,SPRITE_PORT:String(server.port)}});
    expect(JSON.parse(built.stdout).ok).toBe(true);
    expect(state.sessionId).toBe(id); expect(JSON.stringify(state.project.toJSON())).toBe(before);
    const saved=join(dir,'dist','robot.project.json');
    expect((await api('/api/session/open',{path:saved})).ok).toBe(true);
    expect(db.getCellGroupFps(state.sessionId)).toEqual({blink:4});
    expect(db.getShapeGroups(state.sessionId,'0,0')).toEqual({character:['body']});
    expect((await api('/api/session/save',{})).ok).toBe(true);
    expect(Project.load(saved).animationFps.blink).toBe(4);
    expect((await api('/api/session/export',{dest:join(dir,'reopened')})).ok).toBe(true);
    const atlas=JSON.parse(readFileSync(join(dir,'reopened','robot.atlas.json'),'utf8'));
    expect(atlas.frames[2].duration).toBe(250);
  } finally { server.wss.close(); await new Promise(r=>{server.httpServer.close(r);server.httpServer.closeAllConnections()}); db.close(); }
}, 20000);
