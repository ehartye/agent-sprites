import { FONT_TONES, getFrame } from './ui-runtime.mjs';

/**
 * Phaser-ready data for a UI build, so games need no adapter. Fonts: one `BitmapFontData` per tone (the shape of
 * Phaser.Types.GameObjects.BitmapText.BitmapFontData) pointing at that tone's glyph frames in the one font PNG.
 * Skins: nine-slice numbers named like the `add.nineslice` arguments.
 */
export function buildPhaserUi({ report, atlas, name }) {
  const image = `${name}.png`, atlasName = `${name}.atlas.json`;
  if (report.kind === 'font') {
    const chars = Object.keys(report.glyphs).filter(c => c !== ' ').join('');
    const space = report.glyphs[' ']?.advance ?? 0;
    const tones = {};
    for (const tone of FONT_TONES) {
      const map = {};
      for (const [ch, g] of Object.entries(report.glyphs)) {
        const code = ch.codePointAt(0);
        if (ch === ' ' || !g.frames?.[tone]) { map[code] = { x: 0, y: 0, width: 0, height: 0, centerX: 0, centerY: 0, xOffset: 0, yOffset: 0, xAdvance: g.advance, data: {}, kerning: {} }; continue; }
        const f = getFrame(atlas, g.frames[tone]);
        map[code] = { x: f.x, y: f.y, width: f.w, height: f.h, centerX: Math.floor(f.w / 2), centerY: Math.floor(f.h / 2), xOffset: 0, yOffset: 0, xAdvance: g.advance, data: {}, kerning: {} };
      }
      tones[tone] = { font: `${name}-${tone}`, size: report.lineHeight, lineHeight: report.lineHeight, retroFont: false, chars: map };
    }
    return { version: 1, kind: 'font', face: report.face ?? 'regular', image, atlas: atlasName, lineHeight: report.lineHeight, baseline: report.baseline, size: report.lineHeight, spaceAdvance: space, fallback: report.fallback, glyphs: chars, tones };
  }
  const frames = {};
  const bounds = Object.fromEntries(report.frames.map(f => [f.alias, f.bounds]));
  for (const [alias, s] of Object.entries(report.skins)) {
    const entry = { frame: alias };
    if (bounds[alias]) entry.bounds = bounds[alias];
    if (!s.tile && !s.icon) entry.nineSlice = { leftWidth: s.insets.left, rightWidth: s.insets.right, topHeight: s.insets.top, bottomHeight: s.insets.bottom };
    entry.padding = s.padding; entry.minWidth = s.minWidth; entry.minHeight = s.minHeight;
    for (const k of ['textTone', 'tile', 'content', 'icon', 'color', 'hollow']) if (s[k] !== undefined) entry[k] = s[k];
    frames[alias] = entry;
  }
  return { version: 1, kind: 'skin', image, atlas: atlasName, cell: report.cellSize, frames };
}
