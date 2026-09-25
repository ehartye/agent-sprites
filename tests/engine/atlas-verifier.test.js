import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createCanvas, loadImage } from 'canvas';
import { Project } from '../../server/engine/project.js';
import { validateAtlas, verifyAtlasFile } from '../../server/engine/atlas-verifier.js';
const exec = promisify(execFile);
let dir, atlas, file;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sprite-verify-'));
  const p = Project.create({ name: 'robot', cellSize: 8, rows: 1, cols: 2, palette: 'pico8' });
  p.cells.getCell('0,0').name = 'idle';
  atlas = p.exportAseprite({ imageName: 'robot.png', groups: { blink: ['0,0','0,1','0,0'] }, fpsMap: { blink: 4 } });
  file = join(dir, 'robot.atlas.json');
  writeFileSync(file, JSON.stringify(atlas));
  const canvas = createCanvas(16,8); const ctx = canvas.getContext('2d'); ctx.fillStyle='#ff004d'; ctx.fillRect(1,1,5,5);
  writeFileSync(join(dir,'robot.png'), canvas.toBuffer('image/png'));
});
afterEach(() => rmSync(dir, {recursive:true,force:true}));

test('accepts alias frames and repeated rectangles and validates actual image dimensions', () => {
  expect(validateAtlas(atlas, {width:16,height:8,expectedTags:['blink']}).errors).toEqual([]);
  expect(validateAtlas(atlas, {width:8,height:8}).errors.map(x=>x.code)).toContain('image-size');
});
test.each([
  ['bounds', a=>a.frames[0].frame.x=16, 'frame-bounds'],
  ['duration', a=>a.frames[0].duration=0, 'duration'],
  ['name', a=>a.frames[1].filename='0', 'duplicate-name'],
  ['tag range', a=>a.meta.frameTags[0].to=100, 'tag-range'],
  ['direction', a=>a.meta.frameTags[0].direction='up', 'tag-direction'],
  ['trim bounds', a=>a.frames[0].spriteSourceSize.x=99, 'source-bounds'],
  ['null frame', a=>a.frames[0]=null, 'frame'],
])('rejects %s', (_name, mutate, code) => {
  mutate(atlas);
  expect(validateAtlas(atlas,{width:16,height:8}).errors.map(x=>x.code)).toContain(code);
});
test('requires declared animation names and supports JSON-hash atlases', () => {
  expect(validateAtlas(atlas,{width:16,height:8,expectedTags:['walk']}).errors.map(x=>x.code)).toContain('missing-tag');
  atlas.frames=Object.fromEntries(atlas.frames.map(f=>[f.filename, f]));
  expect(validateAtlas(atlas,{width:16,height:8}).errors).toEqual([]);
});

test('requires exact static frame aliases in array and JSON-hash atlases', () => {
  expect(validateAtlas(atlas, {width:16,height:8,expectedFrames:['idle']}).ok).toBe(true);
  const report = validateAtlas(atlas, {width:16,height:8,expectedFrames:['idle', 'wingnut']});
  expect(report.errors).toContainEqual({code:'missing-frame',path:'frames',message:'Required frame is missing: wingnut'});
  atlas.frames=Object.fromEntries(atlas.frames.map(f=>[f.filename, f]));
  expect(validateAtlas(atlas, {width:16,height:8,expectedFrames:['idle']}).ok).toBe(true);
  expect(validateAtlas(atlas, {width:16,height:8,expectedFrames:['Idle']}).ok).toBe(false);
});

test('offline CLI checks static names and emits a failed report before review output', async () => {
  const cli=join(process.cwd(),'scripts/sprite.js');
  const options={env:{...process.env,SPRITE_PORT:'1'},timeout:10000};
  const good=await exec(process.execPath,[cli,'verify',file,'--expect-frames','idle,0','--json'],options);
  expect(JSON.parse(good.stdout).ok).toBe(true);
  const contact=join(dir,'missing-contact.png');
  const bad=await exec(process.execPath,[cli,'verify',file,'--expect-frames','idle,wingnut','--contact-sheet',contact,'--json'],options).then(r=>({...r,code:0}),e=>e);
  expect(bad.code).toBe(1);
  expect(JSON.parse(bad.stdout).errors.some(x=>x.code==='missing-frame')).toBe(true);
  expect(existsSync(contact)).toBe(false);
});
test('reads exported bytes, warns about empty frames and writes readable review artifacts', async () => {
  const contact = join(dir,'review.png'), reportPath=join(dir,'report.json');
  const report=await verifyAtlasFile(file,{contactPath:contact,reportPath,expectedTags:['blink']});
  expect(report.ok).toBe(true);
  expect(report.warnings.some(x=>x.code==='empty-frame')).toBe(true);
  expect(report.frameCount).toBe(6);
  expect(JSON.parse(readFileSync(reportPath,'utf8')).ok).toBe(true);
  const image=await loadImage(contact); expect(image.width).toBeGreaterThan(16); expect(image.height).toBeGreaterThan(8);
});
test('invalid, missing and corrupt inputs produce actionable failures without a contact sheet', async () => {
  atlas.frames[0].frame.w=999; writeFileSync(file,JSON.stringify(atlas));
  const contact=join(dir,'bad.png');
  expect((await verifyAtlasFile(file,{contactPath:contact})).ok).toBe(false);
  expect(existsSync(contact)).toBe(false);
  writeFileSync(file,'not json'); expect((await verifyAtlasFile(file)).errors[0].code).toBe('atlas-read');
  writeFileSync(file,JSON.stringify(atlas)); writeFileSync(join(dir,'robot.png'),'not png');
  expect((await verifyAtlasFile(file)).errors[0].code).toBe('image-read');
});
test('rejects review output paths that would overwrite source artifacts', async () => {
  const before=readFileSync(file);
  expect((await verifyAtlasFile(file,{reportPath:file})).ok).toBe(false);
  expect(readFileSync(file).equals(before)).toBe(true);
});
test('CLI verification is offline, emits JSON and returns failure for invalid exports', async () => {
  const cli=join(process.cwd(),'scripts/sprite.js');
  const options={env:{...process.env,SPRITE_PORT:'1'},timeout:10000};
  const good=await exec(process.execPath,[cli,'verify',file,'--expect-tags','blink','--json'],options);
  expect(JSON.parse(good.stdout).ok).toBe(true);
  const bad=await exec(process.execPath,[cli,'verify',file,'--expect-tags','missing','--json'],options).then(r=>({...r,code:0}),e=>e);
  expect(bad.code).toBe(1); expect(JSON.parse(bad.stdout).errors.some(x=>x.code==='missing-tag')).toBe(true);
});

test.each(['reportPath', 'contactPath'])('review %s cannot overwrite PNGs through hard links', async (option) => {
  const png=join(dir,'robot.png'), reportPath=join(dir,'linked-report.json'), before=readFileSync(png);
  linkSync(png,reportPath);
  const result=await verifyAtlasFile(file,{[option]:reportPath});
  expect(result.ok).toBe(false);
  expect(result.errors[0].code).toBe('output-path');
  expect(readFileSync(png).equals(before)).toBe(true);
});
