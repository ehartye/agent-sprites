import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { verifyAtlasFile } from '../../server/engine/atlas-verifier.js';
import { readCensusPalette } from '../../server/engine/palette-census.js';
let dir, atlas, palette, bytes, metadata;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sprite-census-')); atlas = join(dir, 'scene.json'); palette = join(dir, 'palette.json');
  writeFileSync(palette, JSON.stringify(['#000000']));
  const frame = (filename, x) => ({ filename, frame: { x, y: 0, w: 4, h: 2 }, rotated: false,
    spriteSourceSize: { x: 0, y: 0, w: 4, h: 2 }, sourceSize: { w: 4, h: 2 }, duration: 100 });
  metadata = { frames: [frame('art', 0), frame('mask', 4)], meta: { image: 'scene.png', size: { w: 8, h: 2 } } };
  bytes = Buffer.alloc(8 * 2 * 4);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) bytes[(y * 8 + x) * 4 + 3] = 255;
  for (const [x, y, color] of [[0, 0, [255, 0, 0]], [2, 0, [255, 0, 0]], [3, 1, [0, 255, 0]]]) {
    bytes.set([...color, 255], (y * 8 + x) * 4);
    bytes.set([255, 255, 255, 255], (y * 8 + x + 4) * 4);
  }
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
async function save() {
  writeFileSync(atlas, JSON.stringify(metadata));
  await sharp(bytes, { raw: { width: 8, height: 2, channels: 4 } }).png().toFile(join(dir, 'scene.png'));
}
const run = options => verifyAtlasFile(atlas, { palettePath: palette, ...options });
test('three-pixel negative control and explicit mask report exact colors/pixels', async () => {
  await save(); const before = readFileSync(join(dir, 'scene.png'));
  const strict = await run();
  expect(strict.ok).toBe(false);
  expect(strict.paletteCensus.frames[0]).toMatchObject({ filename: 'art', offPalettePixels: 3, offPaletteColors: 2,
    colors: [{ color: '#00ff00', pixels: 1, samples: [{ x: 3, y: 1, alpha: 255 }] },
      { color: '#ff0000', pixels: 2, samples: [{ x: 0, y: 0, alpha: 255 }, { x: 2, y: 0, alpha: 255 }] }] });
  const masked = await run({ maskFrame: 'mask' });
  expect(masked.ok).toBe(true); expect(masked.paletteCensus.frames).toHaveLength(1);
  expect(masked.paletteCensus.frames[0]).toMatchObject({ offPalettePixels: 0, checkedPixels: 5, maskedPixels: 3 });
  expect(readFileSync(join(dir, 'scene.png'))).toEqual(before);
});
test('advisory retains counts without failure; extras do not share hygiene exemptions', async () => {
  await save(); const report = await run({ paletteMode: 'advisory', allowColors: ['#ff0000'] });
  expect(report.ok).toBe(true); expect(report.paletteCensus.frames[0].offPalettePixels).toBe(3);
  expect(report.warnings.some(w => w.code === 'off-palette')).toBe(true);
  expect((await run({ paletteExtra: ['#FF0000'] })).paletteCensus.frames[0].offPalettePixels).toBe(1);
});
test('counts exact nonzero-alpha RGB and ignores transparent RGB', async () => {
  bytes.set([17, 23, 41, 1], 0); bytes.set([99, 98, 97, 0], 4);
  await save(); const row = (await run()).paletteCensus.frames[0];
  expect(row.colors.find(c => c.color === '#111729')).toMatchObject({ pixels: 1, samples: [{ x: 0, y: 0, alpha: 1 }] });
  expect(row.colors.some(c => c.color === '#636261')).toBe(false);
});
test('invalid or mismatched masks fail even in advisory mode', async () => {
  await save(); expect((await run({ maskFrame: 'absent', paletteMode: 'advisory' })).ok).toBe(false);
  bytes.set([255, 255, 255, 128], 16); await save();
  expect((await run({ maskFrame: 'mask' })).errors[0].code).toBe('palette-census');
  bytes.set([255, 255, 255, 255], 16); metadata.frames[1].rotated = true;
  metadata.frames[1].spriteSourceSize = { x: 0, y: 0, w: 2, h: 4 }; metadata.frames[1].sourceSize = { w: 2, h: 4 }; await save();
  expect((await run({ maskFrame: 'mask' })).errors[0].message).toContain('geometry');
});
test('palette formats are strict and normalize supported exports', () => {
  for (const [extension, text] of [['hex', '000000\n#FF0000'], ['gpl', 'GIMP Palette\nName: Test\nColumns: 2\n# comment\n0 0 0 black\n255 0 0 red'],
    ['json', JSON.stringify({ colors: [{ color: '#000000' }, { color: '#FF0000' }] })]]) {
    const path = join(dir, 'colors.' + extension); writeFileSync(path, text);
    expect(readCensusPalette(path)).toEqual(['#000000', '#ff0000']);
  }
  for (const value of [[], ['red'], ['#fff'], ['#ffffff00']]) {
    writeFileSync(palette, JSON.stringify(value)); expect(() => readCensusPalette(palette)).toThrow();
  }
});
test('report/contact output cannot overwrite palette input or its hardlink', async () => {
  await save(); const original = readFileSync(palette); const alias = join(dir, 'alias.json'); linkSync(palette, alias);
  for (const options of [{ reportPath: palette }, { contactPath: alias }]) {
    expect((await run(options)).errors[0].code).toBe('output-path'); expect(readFileSync(palette)).toEqual(original);
  }
});
test('options require palette and missing/invalid palettes fail without a clean census', async () => {
  await save();
  expect((await verifyAtlasFile(atlas, { maskFrame: 'mask' })).ok).toBe(false);
  expect((await run({ paletteMode: 'ignore' })).ok).toBe(false);
  expect((await run({ palettePath: join(dir, 'missing.hex') })).ok).toBe(false);
  expect((await verifyAtlasFile(atlas)).paletteCensus).toBeUndefined();
});
test('profile-bearing PNG is refused instead of silently color-converting', async () => {
  await save();
  await sharp(bytes, { raw: { width: 8, height: 2, channels: 4 } }).withIccProfile('p3').png().toFile(join(dir, 'scene.png'));
  expect((await sharp(join(dir, 'scene.png')).metadata()).icc).toBeTruthy();
  expect((await run({ paletteMode: 'advisory' })).errors[0].message).toContain('ICC');
});
test('real mask aliases are excluded; same-rectangle inconsistent geometry is refused', async () => {
  metadata.frames.push({ ...structuredClone(metadata.frames[1]), filename: 'mask-alias' }); await save();
  expect((await run({ maskFrame: 'mask' })).paletteCensus.frames).toHaveLength(1);
  metadata.frames[2].sourceSize.w = 5; await save();
  expect((await run({ maskFrame: 'mask' })).errors[0].message).toContain('inconsistent geometry');
});
test('matching rotated and trimmed frames preserve packed coordinate counts', async () => {
  for (const frame of metadata.frames) {
    frame.rotated = true; frame.sourceSize = { w: 5, h: 7 };
    frame.spriteSourceSize = { x: 1, y: 2, w: 2, h: 4 };
  }
  await save(); const result = await run({ maskFrame: 'mask' });
  expect(result.ok).toBe(true); expect(result.paletteCensus.frames[0]).toMatchObject({ offPalettePixels: 0, maskedPixels: 3 });
});
