import { test, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProject } from '../../server/build/project-build.js';

const font = () => {
  const tones = { cream: '#eceddb', muted: '#a8bcb9', gold: '#eed09b', ink: '#172f35', rare: '#1234ab' };
  const operations = [{ command: 'new', name: 'custom-font', size: '6x9', cols: 5, rows: 1, palette: 'pico8' }];
  const frames = [], glyph = { advance: 5, frames: {}, bounds: { left: 1, top: 2, right: 3, bottom: 6 } };
  Object.entries(tones).forEach(([tone, color], i) => {
    const cell = `0,${i}`, alias = 'question_' + tone;
    operations.push({ command: 'draw', type: 'rect', cell, x: 1, y: 2, w: 3, h: 5, color, filled: true, name: 'ink' }, { command: 'name', cell, as: alias });
    frames.push({ alias, cell, bounds: glyph.bounds }); glyph.frames[tone] = alias;
  });
  return { operations, report: { version: 1, kind: 'font', cellSize: { width: 6, height: 9 }, lineHeight: 11, baseline: 8, fallback: '?', tones, colors: { ...tones, paper: '#eeeeee', deep: '#111111' }, frames, glyphs: { '?': glyph, ' ': { advance: 3, frames: {}, bounds: null } } } };
};
async function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), 'generated-ui-'));
  const config = join(dir, 'sprite-project.json'), generator = join(dir, 'generate.mjs');
  const write = generated => writeFileSync(generator, `console.log(${JSON.stringify(JSON.stringify(generated))});`);
  writeFileSync(config, JSON.stringify({ version: 1, generator: 'generate.mjs', output: 'dist', trim: true, scale: 1 }));
  try { await run({ dir, config, write }); } finally { rmSync(dir, { recursive: true, force: true }); }
}
test('custom generator publishes UI reports, custom palette and exact trimmed glyph offsets through the supported build', async () => fixture(async ({ config, write }) => {
  write(font()); const result = await buildProject(config);
  expect(result.errors).toEqual([]); expect(result.ok).toBe(true);
  for (const key of ['uiReport', 'uiRuntime', 'uiPhaser', 'uiBoot', 'fontProof']) expect(existsSync(result.artifacts[key])).toBe(true);
  const data = JSON.parse(readFileSync(result.artifacts.uiPhaser));
  expect(Object.keys(data.tones)).toEqual(['cream', 'muted', 'gold', 'ink', 'rare']);
  expect(data.tones.rare.chars[63]).toMatchObject({ width: 3, height: 5, xOffset: 1, yOffset: 2, xAdvance: 5 });
  expect(data.cell).toEqual({ width: 6, height: 9 }); expect(data.metrics['?']).toEqual({ advance: 5, bounds: { left: 1, top: 2, right: 3, bottom: 6 } }); expect(data.colors.rare).toBe('#1234ab');
  expect(JSON.parse(readFileSync(result.artifacts.manifest))).toMatchObject({ source: 'generator', kind: 'font', report: 'ui-report.json' });
}), 20000);
test.each(['bounds', 'advance', 'palette', 'frame', 'trim'])('inconsistent generated font %s is rejected before replacing owned output', async flaw => fixture(async ({ config, write, dir }) => {
  write(font()); const first = await buildProject(config); expect(first.ok).toBe(true);
  const original = readFileSync(first.artifacts.sheet), bad = font();
  if (flaw === 'bounds') bad.report.frames[0].bounds = { left: 0, top: 0, right: 5, bottom: 8 };
  if (flaw === 'advance') bad.report.glyphs['?'].advance = 0;
  if (flaw === 'palette') bad.report.tones.rare = '#abcdef';
  if (flaw === 'frame') bad.report.glyphs['?'].frames.rare = 'absent';
  if (flaw === 'trim') bad.report.cellSize.width = 5;
  write(bad); const result = await buildProject(config);
  expect(result.ok).toBe(false); expect(result.errors[0].message).toMatch(/UI|font|glyph|tone|bounds|frame|cell/i);
  expect(readFileSync(first.artifacts.sheet)).toEqual(original);
}), 20000);
test('generated skin exports trimmed painted size and tiled source insets', async () => fixture(async ({ config, write }) => {
  const operations = [{ command: 'new', name: 'custom-skin', size: '12x12', cols: 1, rows: 1, palette: 'pico8' }, { command: 'draw', type: 'rect', cell: '0,0', x: 0, y: 0, w: 8, h: 8, color: '#123456', filled: true, name: 'panel' }, { command: 'name', cell: '0,0', as: 'panel' }];
  write({ operations, report: { version: 1, kind: 'skin', cellSize: { width: 12, height: 12 }, frames: [{ alias: 'panel', cell: '0,0', bounds: { left: 0, top: 0, right: 7, bottom: 7 } }], skins: { panel: { insets: { left: 3, right: 3, top: 3, bottom: 3 }, padding: { left: 4, right: 4, top: 4, bottom: 4 }, minWidth: 8, minHeight: 8 } } } });
  const result = await buildProject(config); expect(result.errors).toEqual([]); expect(result.ok).toBe(true);
  expect(JSON.parse(readFileSync(result.artifacts.uiPhaser)).frames.panel).toMatchObject({ source: { width: 8, height: 8, xOffset: 0, yOffset: 0 }, nineSlice: { leftWidth: 3, rightWidth: 3, topHeight: 3, bottomHeight: 3 } });
}), 20000);
