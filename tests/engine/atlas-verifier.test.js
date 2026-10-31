import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, linkSync, readdirSync, lstatSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
  const cli=fileURLToPath(new URL('../../scripts/sprite.js', import.meta.url));
  const options={env:{...process.env,SPRITE_PORT:'1'},timeout:10000};
  const good=await exec(process.execPath,[cli,'verify',file,'--expect-frames','idle,0','--json'],options);
  expect(JSON.parse(good.stdout).ok).toBe(true);
  const contact=join(dir,'missing-contact.png');
  const bad=await exec(process.execPath,[cli,'verify',file,'--expect-frames','idle,wingnut','--contact-sheet',contact,'--json'],options).then(r=>({...r,code:0}),e=>e);
  expect(bad.code).toBe(1);
  expect(JSON.parse(bad.stdout).errors.some(x=>x.code==='missing-frame')).toBe(true);
  expect(existsSync(contact)).toBe(false);
});

function verificationSnapshot() {
  return readdirSync(dir).sort().map(name => {
    const path = join(dir, name), stat = lstatSync(path, { bigint: true });
    return { name, size: stat.size, mtime: stat.mtimeNs, bytes: stat.isFile() ? readFileSync(path).toString('hex') : null };
  });
}
async function verifyCLI(...args) {
  const cli = fileURLToPath(new URL('../../scripts/sprite.js', import.meta.url));
  return exec(process.execPath, [cli, 'verify', file, ...args, '--json'], {
    cwd: dir, windowsHide: true, env: { ...process.env, SPRITE_PORT: '1' }, timeout: 10000,
  }).then(result => ({ ...result, code: 0 }), error => error);
}

test('offline expected-frame files enforce required IDs through the existing verifier without writes', async () => {
  const expected = join(dir, 'expected frames.json');
  writeFileSync(expected, JSON.stringify(['idle', 'wingnut']));
  const before = verificationSnapshot();
  const bad = await verifyCLI('--expect-frames-file', 'expected frames.json');
  expect(bad.code).toBe(1);
  expect(JSON.parse(bad.stdout).errors).toContainEqual({ code: 'missing-frame', path: 'frames', message: 'Required frame is missing: wingnut' });
  expect(verificationSnapshot()).toEqual(before);
  writeFileSync(expected, JSON.stringify(['idle', '0']));
  const goodBefore = verificationSnapshot();
  const good = await verifyCLI('--expect-frames-file', 'expected frames.json');
  expect(good.code).toBe(0);
  expect(JSON.parse(good.stdout)).toMatchObject({ ok: true, frameCount: 6 });
  expect(verificationSnapshot()).toEqual(goodBefore);
});

test('expected-frame files carry a list exceeding Windows argv length using a tiny unchanged PNG', async () => {
  const names = Array.from({ length: 1400 }, (_, n) => `lantern-shoal-required-frame-${String(n).padStart(4, '0')}`);
  expect(names.join(',').length).toBeGreaterThan(32767);
  atlas.frames.push(...names.map(filename => ({ ...atlas.frames[0], filename })));
  writeFileSync(file, JSON.stringify(atlas));
  const expected = join(dir, 'large-expectations.json');
  writeFileSync(expected, JSON.stringify(names));
  const before = verificationSnapshot();
  const good = await verifyCLI('--expect-frames-file', expected);
  expect(good.code).toBe(0);
  expect(JSON.parse(good.stdout)).toMatchObject({ ok: true, frameCount: atlas.frames.length });
  expect(verificationSnapshot()).toEqual(before);
  names[names.length - 1] += '-missing';
  writeFileSync(expected, JSON.stringify(names));
  const badBefore = verificationSnapshot();
  const bad = await verifyCLI('--expect-frames-file', expected);
  expect(bad.code).toBe(1);
  expect(JSON.parse(bad.stdout).errors.map(error => error.message)).toContain(`Required frame is missing: ${names[names.length - 1]}`);
  expect(verificationSnapshot()).toEqual(badBefore);
});

test('expected-frame files preserve exact IDs, including commas, whitespace and case', async () => {
  const name = ' precise, comma ';
  atlas.frames.push({ ...atlas.frames[0], filename: name });
  writeFileSync(file, JSON.stringify(atlas));
  const expected = join(dir, 'exact.json');
  writeFileSync(expected, JSON.stringify([name]));
  expect(JSON.parse((await verifyCLI('--expect-frames-file', expected)).stdout).ok).toBe(true);
  atlas.frames = Object.fromEntries(atlas.frames.map(frame => [frame.filename, frame]));
  writeFileSync(file, JSON.stringify(atlas));
  expect(JSON.parse((await verifyCLI('--expect-frames-file', expected)).stdout).ok).toBe(true);
  for (const wrong of ['precise, comma', ' Precise, comma ']) {
    writeFileSync(expected, JSON.stringify([wrong]));
    const before = verificationSnapshot();
    const bad = await verifyCLI('--expect-frames-file', expected);
    expect(bad.code).toBe(1);
    expect(JSON.parse(bad.stdout).errors.map(error => error.code)).toContain('missing-frame');
    expect(verificationSnapshot()).toEqual(before);
  }
});

test('expected-frame file parse, shape, uniqueness and bounded-size failures precede review writes', async () => {
  const expected = join(dir, 'invalid.json'), report = join(dir, 'review.json'), contact = join(dir, 'review.png');
  const tooMany = JSON.stringify(Array.from({ length: 100001 }, (_, n) => `f${n}`));
  const tooLarge = Buffer.alloc(2 * 1024 * 1024 + 1, 32); tooLarge.write('[]');
  const cases = [
    ['malformed JSON', '{'], ['invalid UTF8', Buffer.from([0xff])],
    ...[null, {}, 'idle', 7, ['idle', null], ['idle', 7], ['idle', true], ['idle', {}], ['idle', []], [''], ['idle', 'idle']].map(value => [JSON.stringify(value), JSON.stringify(value)]),
    ['more than 100000 IDs', tooMany], ['more than 2MiB', tooLarge],
  ];
  for (const [label, bytes] of cases) {
    writeFileSync(expected, bytes);
    const before = verificationSnapshot();
    const bad = await verifyCLI('--expect-frames-file', expected, '--report', report, '--contact-sheet', contact);
    expect(bad.code, label).toBe(1);
    expect(bad.stderr, label).toContain('--expect-frames-file');
    expect(verificationSnapshot(), label).toEqual(before);
  }
}, 20000);

test('expected-frame file options reject missing paths and mutually exclusive flags without writes', async () => {
  const expected = join(dir, 'expected.json'); writeFileSync(expected, JSON.stringify(['idle']));
  const cases = [
    ['--expect-frames-file'], ['--expect-frames-file', ''], ['--expect-frames-file', join(dir, 'missing.json')],
    ['--expect-frames-file', dir], ['--expect-frames', 'idle', '--expect-frames-file', expected],
    ['--expect-frames', '', '--expect-frames-file', expected],
  ];
  for (const args of cases) {
    const before = verificationSnapshot();
    const bad = await verifyCLI(...args);
    expect(bad.code, JSON.stringify(args)).toBe(1);
    expect(bad.stderr, JSON.stringify(args)).toContain('--expect-frames-file');
    expect(verificationSnapshot()).toEqual(before);
  }
});

test('expected-frame file permits an empty explicit contract and preserves explicit report mode', async () => {
  const expected = join(dir, 'none.json'); writeFileSync(expected, '[]');
  const report = join(dir, 'report.json'), contact = join(dir, 'contact.png');
  const good = await verifyCLI('--expect-frames-file', expected, '--report', report, '--contact-sheet', contact);
  expect(good.code).toBe(0);
  expect(JSON.parse(readFileSync(report, 'utf8')).ok).toBe(true);
  expect(existsSync(contact)).toBe(true);
  expect(readFileSync(expected, 'utf8')).toBe('[]');
});

test('expected-frame file reads remain bounded when the file grows after its size observation', async () => {
  const expected = join(dir, 'growing.json'); writeFileSync(expected, '[]');
  const preload = join(dir, 'grow-after-fstat.mjs');
  writeFileSync(preload, `import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
    const open=fs.openSync,stat=fs.fstatSync;let target;
    fs.openSync=function(path,...args){const fd=open.call(this,path,...args);if(String(path)===${JSON.stringify(expected)})target=fd;return fd;};
    fs.fstatSync=function(fd,...args){const result=stat.call(this,fd,...args);if(fd===target){target=undefined;fs.appendFileSync(${JSON.stringify(expected)},Buffer.alloc(2*1024*1024+1,32));}return result;};
    syncBuiltinESMExports();`);
  const before = verificationSnapshot().filter(entry => entry.name !== 'growing.json');
  const cli = fileURLToPath(new URL('../../scripts/sprite.js', import.meta.url));
  const bad = await exec(process.execPath, ['--import', pathToFileURL(preload).href, cli, 'verify', file, '--expect-frames-file', expected, '--json'], {
    cwd: dir, windowsHide: true, env: { ...process.env, SPRITE_PORT: '1' }, timeout: 10000,
  }).then(result => ({ ...result, code: 0 }), error => error);
  expect(bad.code).toBe(1);
  expect(bad.stderr).toContain('--expect-frames-file: input exceeds the 2 MiB limit');
  expect(verificationSnapshot().filter(entry => entry.name !== 'growing.json')).toEqual(before);
});

test('review destinations cannot overwrite expected-frame input files or their hard links', async () => {
  const expected = join(dir, 'expectations.json'); writeFileSync(expected, JSON.stringify(['idle']));
  const alias = join(dir, 'expectations-hardlink.json'); linkSync(expected, alias);
  for (const option of ['--report', '--contact-sheet']) for (const destination of [expected, alias]) {
    const before = verificationSnapshot();
    const bad = await verifyCLI('--expect-frames-file', expected, option, destination);
    expect(bad.code, `${option} ${destination}`).toBe(1);
    expect(bad.stderr).toContain('--expect-frames-file');
    expect(verificationSnapshot()).toEqual(before);
  }
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
  const cli=fileURLToPath(new URL('../../scripts/sprite.js', import.meta.url));
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

import { contactTiles } from '../../server/engine/atlas-verifier.js';
test('contact tiles merge a rectangle shared by numeric frames and aliases, naming it by alias only', () => {
  const f = (filename, x, duration = 100) => ({ filename, frame: { x, y: 0, w: 8, h: 8 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 8, h: 8 }, sourceSize: { w: 8, h: 8 }, duration });
  const tiles = contactTiles([f('0', 0), f('1', 8), f('2', 0, 125), f('idle', 0), f('10', 8)]);
  expect(tiles.map(t => ({ indices: t.indices, names: t.names, durations: [...t.durations] }))).toEqual([
    { indices: [0, 2, 3], names: ['idle'], durations: [100, 125] },
    { indices: [1, 4], names: [], durations: [100] },
  ]);
});

// A grid atlas of `n` distinct 16x16 frames (a big tileset) to exercise the contact sheet size limit.
function gridAtlas(n, cols = 128) {
  const rows = Math.ceil(n / cols), canvas = createCanvas(cols * 16, rows * 16), ctx = canvas.getContext('2d');
  const frames = [];
  for (let i = 0; i < n; i++) {
    const x = (i % cols) * 16, y = Math.floor(i / cols) * 16;
    ctx.fillStyle = `rgb(${i % 251},${(i * 7) % 251},${(i * 13) % 251})`; ctx.fillRect(x + 2, y + 2, 12, 12);
    frames.push({ filename: String(i), frame: { x, y, w: 16, h: 16 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 }, sourceSize: { w: 16, h: 16 }, duration: 100 });
  }
  writeFileSync(join(dir, 'big.png'), canvas.toBuffer('image/png'));
  const path = join(dir, 'big.atlas.json');
  writeFileSync(path, JSON.stringify({ frames, meta: { app: 'test', version: '1', image: 'big.png', format: 'RGBA8888', size: { w: cols * 16, h: rows * 16 }, scale: '1', frameTags: [] } }));
  return path;
}
test('a very large tileset gets a compact contact sheet instead of failing verification', async () => {
  const path = gridAtlas(3300);
  const contact = join(dir, 'big-contact.png');
  const report = await verifyAtlasFile(path, { contactPath: contact });
  expect(report.errors).toEqual([]);
  expect(report.ok).toBe(true);
  expect(report.contactSheet).toMatchObject({ compact: true, tiles: 3300, frames: 3300 });
  expect(existsSync(contact)).toBe(true);
}, 60000);
test('a contact sheet that cannot fit even compactly is truncated with a warning, never an error', async () => {
  const path = gridAtlas(24000, 160);
  const contact = join(dir, 'huge-contact.png');
  const report = await verifyAtlasFile(path, { contactPath: contact });
  expect(report.ok).toBe(true);
  expect(report.contactSheet.tiles).toBeLessThan(24000);
  expect(report.warnings.map((w) => w.code)).toContain('contact-sheet-truncated');
  expect(existsSync(contact)).toBe(true);
}, 120000);

test('contactFrames limits the contact sheet to the named frames (exact or prefix*) and fails when nothing matches', async () => {
  const all = join(dir, 'all.png'), one = join(dir, 'one.png');
  const full = await verifyAtlasFile(file, { contactPath: all });
  const some = await verifyAtlasFile(file, { contactPath: one, contactFrames: ['idle'] });
  expect(some.ok).toBe(true);
  expect(some.contactSheet.tiles).toBe(1);
  expect(full.contactSheet.tiles).toBeGreaterThan(1);
  const none = await verifyAtlasFile(file, { contactPath: join(dir, 'none.png'), contactFrames: ['nope*'] });
  expect(none.ok).toBe(false);
  expect(none.errors[0].message).toMatch(/No atlas frame matches/);
});

test('maxAspect rejects a long strip atlas and passes a squarer one, only when asked', () => {
  const strip = { ...atlas, meta: { ...atlas.meta, size: { w: 48, h: 1992 } } };
  expect(validateAtlas(strip, {width:48,height:1992}).errors.map(e => e.code)).not.toContain('atlas-shape');
  const bad = validateAtlas(strip, {width:48,height:1992,maxAspect:3}).errors.find(e => e.code === 'atlas-shape');
  expect(bad.message).toMatch(/48 x 1992.*41\.5:1/);
  expect(validateAtlas(atlas, {width:16,height:8,maxAspect:3}).errors.map(e => e.code)).not.toContain('atlas-shape');
  expect(validateAtlas(atlas, {width:16,height:8,maxAspect:0.5}).errors.map(e => e.code)).toContain('max-aspect');
});

test('tag-frame-key flags a named alias inside a tag range, names the tag and frame, and ignores aliases after every range', () => {
  const sheet = (aliasAt, tagTo) => ({
    frames: Array.from({ length: 6 }, (_, i) => ({ ...atlas.frames[0], filename: i === aliasAt ? 'sway' : String(i) })),
    meta: { ...atlas.meta, frameTags: [{ name: 'walk', from: 2, to: tagTo, direction: 'forward' }] },
  });
  const keyErrors = a => validateAtlas(a, { width: 16, height: 8 }).errors.filter(e => e.code === 'tag-frame-key');
  const bad = keyErrors(sheet(3, 4));
  expect(bad).toHaveLength(1);
  expect(bad[0].path).toContain('"walk"');
  expect(bad[0].path).toContain('frames[3]');
  expect(keyErrors(sheet(5, 4))).toEqual([]);
  expect(keyErrors(sheet(-1, 5))).toEqual([]);
  expect(keyErrors({ ...sheet(-1, 5), meta: { ...atlas.meta, frameTags: [] } })).toEqual([]);
});

test('the invalid frame-key fixture fails verify with exactly one tag-frame-key error', async () => {
  const fixture = fileURLToPath(new URL('../fixtures/atlas-invalid/frame-key.atlas.json', import.meta.url));
  const report = await verifyAtlasFile(fixture);
  expect(report.ok).toBe(false);
  expect(report.errors.map(e => e.code)).toEqual(['tag-frame-key']);
});
