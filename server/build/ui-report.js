import { createCanvas, loadImage } from 'canvas';
import { fontToneNames } from './ui-runtime.mjs';

export const isUiReport = report => ['font', 'skin', 'logo'].includes(report?.kind);
const positive = (n, label) => { if (!Number.isInteger(n) || n < 1) throw Error(`UI ${label} must be a positive integer.`); };

// Validate authored reports against the published pixels, including trimmed cells.
// A generator has the same report contract as an inline UI recipe.
export async function validateUiReport(report, atlas, png) {
  if (!isUiReport(report) || !Array.isArray(report.frames) || !report.frames.length) throw Error('UI report requires named frames.');
  positive(report.cellSize?.width, 'cell width'); positive(report.cellSize?.height, 'cell height');
  const image = await loadImage(png), canvas = createCanvas(image.width, image.height), context = canvas.getContext('2d');
  context.drawImage(image, 0, 0); const pixels = context.getImageData(0, 0, image.width, image.height).data;
  const byAlias = new Map(atlas.frames.map(frame => [frame.filename, frame])), declared = new Map();
  for (const frame of report.frames) {
    if (typeof frame.alias !== 'string' || declared.has(frame.alias)) throw Error('UI frame aliases must be unique.');
    const entry = byAlias.get(frame.alias);
    if (!entry || entry.rotated) throw Error(`UI missing or rotated frame: ${frame.alias}`);
    if (entry.sourceSize.w !== report.cellSize.width || entry.sourceSize.h !== report.cellSize.height) throw Error(`UI cell size differs from atlas: ${frame.alias}`);
    const { frame: f, spriteSourceSize: source } = entry;
    if (!source || source.w !== f.w || source.h !== f.h || source.x < 0 || source.y < 0 || source.x + f.w > entry.sourceSize.w || source.y + f.h > entry.sourceSize.h) throw Error(`UI invalid trim metadata: ${frame.alias}`);
    const bounds = { left: Infinity, top: Infinity, right: -1, bottom: -1 };
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (pixels[((f.y + y) * image.width + f.x + x) * 4 + 3]) {
      bounds.left = Math.min(bounds.left, x + source.x); bounds.top = Math.min(bounds.top, y + source.y);
      bounds.right = Math.max(bounds.right, x + source.x); bounds.bottom = Math.max(bounds.bottom, y + source.y);
    }
    if (bounds.right < 0 || ['left', 'top', 'right', 'bottom'].some(key => frame.bounds?.[key] !== bounds[key])) throw Error(`UI painted bounds differ from report: ${frame.alias}`);
    declared.set(frame.alias, { entry, bounds });
  }
  if (report.kind === 'font') {
    positive(report.lineHeight, 'font line height');
    if (!Number.isInteger(report.baseline) || report.baseline < 0 || report.baseline >= report.cellSize.height || report.baseline >= report.lineHeight) throw Error('UI font baseline must be inside the source cell and line height.');
    if (typeof report.fallback !== 'string' || [...report.fallback].length !== 1 || !report.glyphs?.[report.fallback]) throw Error('UI font requires a supported fallback.');
    const tones = fontToneNames(report);
    if (!tones.length || tones.some(t => !/^[a-z][a-z0-9_-]*$/.test(t))) throw Error('UI font tone names must be nonempty identifiers.');
    const palette = report.tones ?? Object.fromEntries(tones.map(tone => [tone, report.colors?.[tone]]));
    if (Object.values(palette).some(color => typeof color !== 'string' || !/^#[\da-f]{6}$/i.test(color))) throw Error('UI font tone colors must be RGB hex.');
    for (const [char, glyph] of Object.entries(report.glyphs)) {
      if ([...char].length !== 1 || char.codePointAt(0) > 65535) throw Error('UI native bitmap glyphs require one BMP character.');
      positive(glyph.advance, 'font glyph advance');
      if (char === ' ') continue;
      for (const tone of tones) {
        const record = declared.get(glyph.frames?.[tone]);
        if (!record) throw Error(`UI missing font tone frame: ${tone} for ${char}`);
        if (['left', 'top', 'right', 'bottom'].some(key => record.bounds[key] !== glyph.bounds?.[key])) throw Error(`UI glyph bounds differ from frame: ${char}`);
        if (record.bounds.right >= glyph.advance) throw Error(`UI glyph advance clips ink: ${char}`);
        // The authored display face intentionally carries highlight, shade and outline pixels.
        if (report.tones || report.face !== 'display') {
          const rgb = palette[tone].slice(1).match(/../g).map(n => parseInt(n, 16)), f = record.entry.frame;
          for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
            const i = ((f.y + y) * image.width + f.x + x) * 4;
            if (pixels[i + 3] && rgb.some((n, channel) => pixels[i + channel] !== n)) throw Error(`UI font tone pixels differ: ${tone}`);
          }
        }
      }
    }
  } else if (report.kind === 'skin') {
    if (!report.skins || Object.keys(report.skins).length !== declared.size) throw Error('UI skin metrics require every declared frame.');
    for (const [alias, skin] of Object.entries(report.skins)) {
      const record = declared.get(alias); if (!record) throw Error(`UI missing skin frame: ${alias}`);
      positive(skin.minWidth, 'skin min width'); positive(skin.minHeight, 'skin min height');
      for (const side of ['left', 'right', 'top', 'bottom']) if (!Number.isInteger(skin.padding?.[side]) || skin.padding[side] < 0) throw Error(`UI skin padding is invalid: ${alias}`);
      if (!skin.tile && !skin.icon) {
        for (const side of ['left', 'right', 'top', 'bottom']) if (!Number.isInteger(skin.insets?.[side]) || skin.insets[side] < 0) throw Error(`UI skin insets are invalid: ${alias}`);
        if (skin.insets.left + skin.insets.right >= record.entry.frame.w || skin.insets.top + skin.insets.bottom >= record.entry.frame.h) throw Error(`UI skin insets leave no tile: ${alias}`);
        if (skin.minWidth <= skin.insets.left + skin.insets.right || skin.minHeight <= skin.insets.top + skin.insets.bottom) throw Error(`UI skin minimum leaves no center between fixed borders: ${alias}`);
      }
      if (skin.content !== undefined) {
        const content = skin.content, width = record.entry.frame.w, height = record.entry.frame.h;
        if (!content || typeof content !== 'object' || Array.isArray(content)) throw Error(`UI skin content must be a rectangle or insets: ${alias}`);
        if (Object.keys(content).every(key => ['x', 'y', 'w', 'h'].includes(key))) {
          if (!['x', 'y', 'w', 'h'].every(key => Number.isInteger(content[key])) || content.x < 0 || content.y < 0 || content.w < 1 || content.h < 1 || content.x + content.w > width || content.y + content.h > height) throw Error(`UI skin content crop leaves the trimmed source: ${alias}`);
        } else if (Object.keys(content).every(key => ['left', 'right', 'top', 'bottom', 'capWidth'].includes(key))) {
          if (!['left', 'right', 'top', 'bottom'].every(key => Number.isInteger(content[key]) && content[key] >= 0) || content.left + content.right >= width || content.top + content.bottom >= height) throw Error(`UI skin content insets leave no interior: ${alias}`);
          if (content.capWidth !== undefined && (!Number.isInteger(content.capWidth) || content.capWidth < 1 || content.capWidth * 2 >= width)) throw Error(`UI skin content capWidth leaves no tile: ${alias}`);
        } else throw Error(`UI skin content shape is unsupported: ${alias}`);
      }
    }
  } else if (report.frames.length !== 1 || report.frames[0].alias !== 'logo') {
    throw Error('UI logo report requires exactly one named logo frame.');
  }
}
