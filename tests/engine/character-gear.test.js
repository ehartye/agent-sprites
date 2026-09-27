import { test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadImage, createCanvas } from 'canvas';
import { buildProject } from '../../server/build/project-build.js';
import { generateCharacterRecipe } from '../../server/authoring/character.js';

// Cells: idle row = down, right, up, left; walk rows are the same facings, 8 frames each.
let dir;
const sheets = {};
async function build(name, mode, gear) {
  const d = join(dir, name); writeFileSync(join(dir, `${name}.json`), JSON.stringify({ version: 1, output: name, scale: 1, character: { name, mode, people: [{ id: 'ada', gear }], directions: ['down', 'right', 'up', 'left'] } }));
  const r = await buildProject(join(dir, `${name}.json`));
  expect(r.errors).toEqual([]);
  const img = await loadImage(r.artifacts.sheet), ctx = createCanvas(img.width, img.height).getContext('2d'); ctx.drawImage(img, 0, 0);
  return { r, width: img.width, data: ctx.getImageData(0, 0, img.width, img.height).data, report: JSON.parse(readFileSync(r.artifacts.characterReport, 'utf8')) };
}
// Changed pixels versus the no-gear sheet, per cell, with their mean x within the cell.
function diff(a, b) {
  const cells = {};
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i] === b.data[i] && a.data[i + 1] === b.data[i + 1] && a.data[i + 2] === b.data[i + 2] && a.data[i + 3] === b.data[i + 3]) continue;
    const x = (i / 4) % a.width, y = Math.floor(i / 4 / a.width), key = `${Math.floor(y / 56)},${Math.floor(x / 40)}`;
    (cells[key] ??= []).push(x % 40);
  }
  return Object.fromEntries(Object.entries(cells).map(([k, xs]) => [k, { count: xs.length, meanX: xs.reduce((s, v) => s + v, 0) / xs.length }]));
}
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sprite-gear-'));
  for (const [key, mode, gear] of [['none_idle', 'idle', []], ['right_idle', 'idle', [{ item: 'trowel', side: 'right' }]], ['left_idle', 'idle', [{ item: 'trowel', side: 'left' }]], ['none_walk', 'walk', []], ['right_walk', 'walk', [{ item: 'trowel', side: 'right' }]]])
    sheets[key] = await build(key, mode, gear);
}, 120000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test('a right-hand trowel stays in the right hand: shown when that side is near, hidden when far', () => {
  const d = diff(sheets.right_idle, sheets.none_idle);
  expect(d['0,1'].count).toBeGreaterThanOrEqual(15);   // facing right: right side near
  expect(d['0,3']?.count ?? 0).toBeLessThanOrEqual(4);  // facing left: behind the body
  expect(d['0,0'].meanX).toBeLessThan(20);              // from the front: image left
  expect(d['0,2'].meanX).toBeGreaterThan(20);           // from behind: image right
});

test('a left-hand trowel is the mirror case', () => {
  const d = diff(sheets.left_idle, sheets.none_idle);
  expect(d['0,3'].count).toBeGreaterThanOrEqual(15);
  expect(d['0,1']?.count ?? 0).toBeLessThanOrEqual(4);
  expect(d['0,0'].meanX).toBeGreaterThan(20);
  expect(d['0,2'].meanX).toBeLessThan(20);
});

test('the near-side trowel stays visible through every walk frame and stays in the cell', () => {
  const d = diff(sheets.right_walk, sheets.none_walk);
  for (let f = 0; f < 8; f++) expect(d[`1,${f}`]?.count ?? 0, `right walk ${f}`).toBeGreaterThanOrEqual(15);
  for (const frame of sheets.right_walk.report.frames) expect(frame.checks).toEqual([]);
});

test('report frames carry the gear with its facing-derived role, and shapes are an editable group', () => {
  const frames = sheets.right_idle.report.frames;
  expect(frames.map(f => f.gear[0].role)).toEqual(['front', 'near', 'back', 'far']);
  const project = JSON.parse(readFileSync(sheets.right_idle.r.artifacts.project, 'utf8'));
  const groups = project.shapeGroups['0,1'];
  expect(groups.gear.every(n => n.startsWith('gear_trowel_right_'))).toBe(true);
});

test('gear is validated', () => {
  const make = gear => () => generateCharacterRecipe({ people: [{ id: 'ada', gear }] });
  expect(make({ item: 'trowel', side: 'right' })).toThrow(/Gear must be an array/);
  expect(make([{ item: 'sword', side: 'right' }])).toThrow(/gear item/);
  expect(make([{ item: 'trowel', side: 'middle' }])).toThrow(/gear side/);
  expect(make([{ item: 'trowel', side: 'right' }, { item: 'trowel', side: 'right' }])).toThrow(/Only one hand item per side/);
  expect(make([{ item: 'trowel', side: 'right', color: '#fff' }])).toThrow();
  expect(make([{ item: 'trowel', side: 'right' }, { item: 'trowel', side: 'left' }])).not.toThrow();
});
