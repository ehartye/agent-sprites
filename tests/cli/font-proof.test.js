import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadImage, createCanvas } from 'canvas';
import { buildProject } from '../../server/build/project-build.js';

let dir, path;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sprite-font-proof-')); path = join(dir, 'sprite-project.json'); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const build = async config => { writeFileSync(path, JSON.stringify({ version: 1, output: 'dist', scale: 2, ...config })); const r = await buildProject(path); expect(r.errors).toEqual([]); return r; };
const uniqueRects = atlas => new Set(atlas.frames.map(f => JSON.stringify([f.frame, f.rotated, f.spriteSourceSize, f.sourceSize]))).size;

test.each([['small', ' Ag?'], ['complete', undefined]])('%s font proof shows every glyph in every tone plus multiline sample text', async (_, characters) => {
  const result = await build({ ui: { name: 'proof', kind: 'font', ...(characters ? { characters } : {}) } });
  const report = JSON.parse(readFileSync(result.artifacts.uiReport, 'utf8'));
  const proof = JSON.parse(readFileSync(result.artifacts.fontProofReport, 'utf8'));
  const glyphs = Object.keys(report.glyphs).filter(c => c !== ' ');
  expect(proof.glyphs.map(g => g.character).sort()).toEqual(glyphs.sort());
  expect(proof.tones).toEqual(['cream', 'muted', 'gold', 'ink']);
  expect(proof.sample.lines.length).toBeGreaterThan(1);
  const img = await loadImage(result.artifacts.fontProof);
  expect([img.width, img.height]).toEqual([proof.width, proof.height]);
  // Each glyph cell is really painted with its tone color, not left blank.
  const c = createCanvas(img.width, img.height), ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  const hex = (x, y) => '#' + [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)].map(v => v.toString(16).padStart(2, '0')).join('');
  for (const g of proof.glyphs) for (const tone of proof.tones) {
    const box = g.boxes[tone], seen = new Set();
    for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) seen.add(hex(x, y));
    expect(seen.has(report.colors[tone]), `${g.character} ${tone}`).toBe(true);
  }
  const manifest = JSON.parse(readFileSync(result.artifacts.manifest, 'utf8'));
  expect(manifest.files).toMatchObject({ fontProof: 'font-proof.png', fontProofReport: 'font-proof.json' });
}, 60000);

test('contact sheets show each unique source rectangle once while alias validation still runs', async () => {
  const result = await build({ ui: { name: 'proof', kind: 'font', characters: ' Ag?' }, expectedFrames: ['glyph_0041_cream'] });
  const atlas = JSON.parse(readFileSync(result.artifacts.atlas, 'utf8'));
  const verification = JSON.parse(readFileSync(result.artifacts.verification, 'utf8'));
  expect(verification.contactSheet.tiles).toBe(uniqueRects(atlas));
  expect(verification.contactSheet.frames).toBe(atlas.frames.length);
  expect(verification.contactSheet.tiles).toBeLessThan(atlas.frames.length);
  const missing = await (async () => { writeFileSync(path, JSON.stringify({ version: 1, output: 'dist2', scale: 2, ui: { name: 'proof', kind: 'font', characters: ' A' }, expectedFrames: ['glyph_0067_cream'] })); return buildProject(path); })();
  expect(missing.ok).toBe(false);
}, 60000);

test('skins do not get a font proof', async () => {
  const result = await build({ ui: { name: 'skin', kind: 'skin' } });
  expect(result.artifacts.fontProof).toBeUndefined();
}, 60000);

// Pixel and report digests of the 0.97.0 proof of a small font; an omitted option must reproduce them.
const proofDigests = async result => {
  const img = await loadImage(result.artifacts.fontProof), c = createCanvas(img.width, img.height), ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  const sha = data => createHash('sha256').update(data).digest('hex');
  return { px: sha(Buffer.from(ctx.getImageData(0, 0, img.width, img.height).data)), report: sha(JSON.stringify(JSON.parse(readFileSync(result.artifacts.fontProofReport, 'utf8')))) };
};
const smallFont = { name: 'proof', kind: 'font', characters: ' Ag?' };
const hexAt = (ctx, x, y) => '#' + [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)].map(v => v.toString(16).padStart(2, '0')).join('');

test('proof surfaces omitted keep the 0.97.0 proof bytes', async () => {
  const digests = await proofDigests(await build({ ui: smallFont }));
  expect(digests).toEqual({ px: '3cbadbf6e0f74f5aad6c0f52d4bee77250f216f377bab5e73d1b2444d846a72f', report: '2986206b85e042b4623c69b52051b7c9467b8fb059afacd7dc56e0a92c30dd6d' });
  // An empty declaration is the same as none.
  expect(await proofDigests(await build({ ui: smallFont, output: 'dist-empty', proof: { surfaces: {} } }))).toEqual(digests);
}, 60000);

test('proof.surfaces paints a declared tone on its background and reports the sampled pairings', async () => {
  const surface = '#E8DCC0';
  const result = await build({ ui: smallFont, proof: { surfaces: { muted: surface } } });
  const report = JSON.parse(readFileSync(result.artifacts.uiReport, 'utf8'));
  const proof = JSON.parse(readFileSync(result.artifacts.fontProofReport, 'utf8'));
  expect(proof.pairings.find(p => p.tone === 'muted')).toMatchObject({ surface: '#e8dcc0', declared: true });
  expect(proof.pairings.find(p => p.tone === 'gold')).toMatchObject({ surface: report.colors.deep, declared: false });
  expect(proof.pairings.find(p => p.tone === 'ink')).toMatchObject({ surface: report.colors.paper, declared: false });
  expect(proof.pairings.map(p => p.tone)).toEqual(proof.tones);
  for (const p of proof.pairings) expect(p.contrast).toBeGreaterThan(1);
  const img = await loadImage(result.artifacts.fontProof), c = createCanvas(img.width, img.height), ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  const box = proof.glyphs[0].boxes.muted, seen = new Set();
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) seen.add(hexAt(ctx, x, y));
  expect(seen.has(report.colors.muted)).toBe(true);
  expect(seen.has('#e8dcc0')).toBe(true);
  expect(seen.has(report.colors.deep)).toBe(false);
  // Undeclared tones stay on the default surface.
  const gold = proof.glyphs[0].boxes.gold;
  expect(hexAt(ctx, gold.x, gold.y)).not.toBe('#e8dcc0');
}, 60000);

test.each([
  ['a non-hex value', { muted: 'paper' }],
  ['a short hex value', { muted: '#fff' }],
  ['a non-string value', { muted: 12 }],
  ['an unknown tone', { shiny: '#ffffff' }],
  ['a list instead of a map', ['#ffffff']],
])('proof.surfaces rejects %s with a message naming proof.surfaces', async (_, surfaces) => {
  writeFileSync(path, JSON.stringify({ version: 1, output: 'dist', scale: 2, ui: smallFont, proof: { surfaces } }));
  const r = await buildProject(path);
  expect(r.ok).toBe(false);
  expect(r.errors.map(e => e.message).join(' ')).toMatch(/proof\.surfaces/);
}, 60000);
