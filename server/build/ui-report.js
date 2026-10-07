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
    if (typeof report.fallback !== 'string' || [...report.fallback].length !== 1 || !report.glyphs?.[report.fallback]) throw Error('UI font requires a supported fallback.');
    const tones = fontToneNames(report);
    if (!tones.length || tones.some(t => !/^[a-z][a-z0-9_-]*$/.test(t))) throw Error('UI font tone names must be nonempty identifiers.');
    if (report.tones && Object.values(report.tones).some(color => !/^#[\da-f]{6}$/i.test(color))) throw Error('UI font tone colors must be RGB hex.');
    for (const [char, glyph] of Object.entries(report.glyphs)) {
      if ([...char].length !== 1 || char.codePointAt(0) > 65535) throw Error('UI native bitmap glyphs require one BMP character.');
      positive(glyph.advance, 'font glyph advance');
      if (char === ' ') continue;
      for (const tone of tones) {
        const record = declared.get(glyph.frames?.[tone]);
        if (!record) throw Error(`UI missing font tone frame: ${tone} for ${char}`);
        if (['left', 'top', 'right', 'bottom'].some(key => record.bounds[key] !== glyph.bounds?.[key])) throw Error(`UI glyph bounds differ from frame: ${char}`);
        if (record.bounds.right >= glyph.advance) throw Error(`UI glyph advance clips ink: ${char}`);
        if (report.tones) {
          const rgb = report.tones[tone].slice(1).match(/../g).map(n => parseInt(n, 16)), f = record.entry.frame;
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
      }
    }
  }
}
