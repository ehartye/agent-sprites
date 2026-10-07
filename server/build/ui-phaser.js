import { FONT_TONES, fontToneNames, getFrame } from './ui-runtime.mjs';

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
    const tones = {}, tw = atlas.meta.size.w, th = atlas.meta.size.h;
    for (const tone of fontToneNames(report)) {
      const map = {};
      for (const [ch, g] of Object.entries(report.glyphs)) {
        const code = ch.codePointAt(0);
        if (ch === ' ' || !g.frames?.[tone]) { map[code] = { x: 0, y: 0, width: 0, height: 0, centerX: 0, centerY: 0, xOffset: 0, yOffset: 0, xAdvance: g.advance, data: {}, kerning: {}, u0: 0, v0: 0, u1: 0, v1: 0 }; continue; }
        const f = getFrame(atlas, g.frames[tone]);
        const entry = atlas.frames.find(frame => frame.filename === g.frames[tone]), offset = entry.spriteSourceSize;
        map[code] = { x: f.x, y: f.y, width: f.w, height: f.h, centerX: Math.floor(f.w / 2), centerY: Math.floor(f.h / 2), xOffset: offset?.x ?? 0, yOffset: offset?.y ?? 0, xAdvance: g.advance, data: {}, kerning: {}, u0: f.x / tw, v0: 1 - f.y / th, u1: (f.x + f.w) / tw, v1: 1 - (f.y + f.h) / th };
      }
      tones[tone] = { font: `${name}-${tone}`, size: report.lineHeight, lineHeight: report.lineHeight, retroFont: false, chars: map };
    }
    const metrics = Object.fromEntries(Object.entries(report.glyphs).map(([ch, g]) => [ch, { advance: g.advance, bounds: g.bounds }]));
    return { version: 1, kind: 'font', face: report.face ?? 'regular', image, atlas: atlasName, lineHeight: report.lineHeight, baseline: report.baseline, size: report.lineHeight, cell: report.cellSize, metrics, colors: report.tones ?? Object.fromEntries(FONT_TONES.map(t => [t, report.colors[t]])), spaceAdvance: space, fallback: report.fallback, symbols: report.symbols ?? {}, glyphs: chars, tones };
  }
  if (report.kind === 'logo') return { version: 1, kind: 'logo', image, atlas: atlasName, frame: 'logo', size: report.cellSize, bounds: report.frames[0].bounds };
  const frames = Object.create(null);
  const bounds = Object.fromEntries(report.frames.map(f => [f.alias, f.bounds]));
  for (const [alias, s] of Object.entries(report.skins)) {
    const atlasFrame = atlas.frames.find(frame => frame.filename === alias), f = atlasFrame.frame;
    const entry = { frame: alias, source: { width: f.w, height: f.h, xOffset: atlasFrame.spriteSourceSize.x, yOffset: atlasFrame.spriteSourceSize.y } };
    if (bounds[alias]) entry.bounds = bounds[alias];
    if (!s.tile && !s.icon) entry.nineSlice = { leftWidth: s.insets.left, rightWidth: s.insets.right, topHeight: s.insets.top, bottomHeight: s.insets.bottom };
    entry.padding = s.padding; entry.minWidth = s.minWidth; entry.minHeight = s.minHeight;
    for (const k of ['textTone', 'tile', 'content', 'icon', 'color', 'hollow']) if (s[k] !== undefined) entry[k] = s[k];
    frames[alias] = entry;
  }
  return { version: 1, kind: 'skin', image, atlas: atlasName, cell: report.cellSize, frames };
}
