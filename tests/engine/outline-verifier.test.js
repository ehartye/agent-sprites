import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createCanvas } from 'canvas';
import { Project } from '../../server/engine/project.js';
import { verifyAtlasFile } from '../../server/engine/atlas-verifier.js';

const exec = promisify(execFile), outline = '#39283f';
let dir, file, canvas, ctx;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sprite-outline-'));
  file = join(dir, 'actor.atlas.json');
  const project = Project.create({name:'actor',cellSize:8,rows:1,cols:2,palette:'pico8'});
  project.cells.getCell('0,0').name = 'front';
  writeFileSync(file, JSON.stringify(project.exportAseprite({imageName:'actor.png',groups:{idle:['0,0']}})));
  canvas = createCanvas(16,8); ctx = canvas.getContext('2d');
  ctx.fillStyle = outline; ctx.fillRect(1,1,5,5);
  ctx.fillStyle = '#efac83'; ctx.fillRect(2,2,3,3);
});
afterEach(() => rmSync(dir, {recursive:true,force:true}));
function save() { writeFileSync(join(dir,'actor.png'), canvas.toBuffer('image/png')); }

test('outline checking is opt-in and catches a fill overwriting the final contour once per packed rectangle', async () => {
  ctx.fillRect(1,3,1,1); save();
  expect((await verifyAtlasFile(file)).ok).toBe(true);
  const result = await verifyAtlasFile(file, {outlineColors:[outline]});
  expect(result.ok).toBe(false);
  const gaps = result.errors.filter(e => e.code==='outline-gap');
  expect(gaps).toHaveLength(1); // Numeric, static and tag aliases share pixels.
  expect(gaps[0]).toMatchObject({path:'frames[0]',count:1,pixels:[{x:1,y:3}]});
});

test('accepts a closed outline, arbitrary interior colors and declared multiple contour tones', async () => {
  ctx.fillStyle = '#795263'; ctx.fillRect(1,2,1,1); save();
  expect((await verifyAtlasFile(file,{outlineColors:[outline,'#795263']})).ok).toBe(true);
  expect((await verifyAtlasFile(file,{outlineColors:[outline]})).ok).toBe(false);
  ctx.fillStyle = outline; ctx.fillRect(1,2,1,1); save();
  expect((await verifyAtlasFile(file,{outlineColors:['#39283F']})).ok).toBe(true);
});

test('frame edges are exterior even when an adjacent packed frame is opaque', async () => {
  ctx.fillStyle = outline; ctx.fillRect(0,0,16,8);
  ctx.fillStyle = '#efac83'; ctx.fillRect(7,3,1,1); save();
  const result = await verifyAtlasFile(file,{outlineColors:[outline]});
  expect(result.errors.find(e=>e.code==='outline-gap')).toMatchObject({count:1,pixels:[{x:7,y:3}]});
});

test('checks transparent interior holes and rejects translucent contour pixels', async () => {
  ctx.clearRect(3,3,1,1); save();
  expect((await verifyAtlasFile(file,{outlineColors:[outline]})).errors.find(e=>e.code==='outline-gap').count).toBe(4);
  ctx.fillStyle = '#efac83'; ctx.fillRect(3,3,1,1);
  ctx.clearRect(1,3,1,1); ctx.fillStyle='rgba(57,40,63,0.5)'; ctx.fillRect(1,3,1,1); save();
  expect((await verifyAtlasFile(file,{outlineColors:[outline]})).ok).toBe(false);
});

test.each([[],null,'#39283f',['plum'],['#fff'],[42]].map(value=>[value]))('rejects invalid outline colors %j', async outlineColors => {
  save();
  const result = await verifyAtlasFile(file,{outlineColors});
  expect(result.ok).toBe(false);
  expect(result.errors[0].code).toBe('outline-colors');
});

test('CLI passes outline colors through and exits nonzero on a broken contour without a server', async () => {
  ctx.fillRect(1,3,1,1); save();
  const cli=join(process.cwd(),'scripts/sprite.js');
  const result=await exec(process.execPath,[cli,'verify',file,'--outline-colors',outline,'--json'],{env:{...process.env,SPRITE_PORT:'1'},timeout:10000}).then(r=>({...r,code:0}),e=>e);
  expect(result.code).toBe(1);
  expect(JSON.parse(result.stdout).errors.some(e=>e.code==='outline-gap')).toBe(true);
});
