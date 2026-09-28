import { createCanvas, loadImage } from 'canvas';
import { createBitmapFont, FONT_TONES as TONES } from './ui-runtime.mjs';
const PANGRAM = 'The quick brown fox jumps over the lazy dog.\n0123456789 Sphinx of black quartz, judge my vow!';

/**
 * A reviewable proof of a bitmap font: every glyph in every tone at 3x, then
 * wrapped multiline sample text, drawn through the same portable runtime games
 * use. Light tones sit on the deep panel color, ink on paper.
 */
export async function renderFontProof(png, atlas, report) {
  const image = await loadImage(png), font = createBitmapFont({ image, atlas, report });
  const glyphs = Object.keys(report.glyphs).filter(c => c !== ' ').sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
  const scale = 3, pad = 4, cols = Math.min(16, glyphs.length);
  const cw = report.cellSize.width * scale, ch = report.cellSize.height * scale;
  const blockW = cols * (cw + pad) + pad, blockH = Math.ceil(glyphs.length / cols) * (ch + pad) + pad;
  const supported = font.missingGlyphs(PANGRAM).length === 0;
  // Fonts built for a subset still get multiline text made of their own glyphs.
  const words = glyphs.join('').match(/.{1,5}/gu) ?? [];
  const text = supported ? PANGRAM : `${words.join(' ')}\n${[...words].reverse().join(' ')}`;
  const sampleScale = 2, sampleWidth = blockW - 2 * pad;
  const sample = font.measure(text, { scale: sampleScale, maxWidth: sampleWidth });
  const sampleH = sample.height + 2 * pad;
  const width = blockW, height = TONES.length * blockH + 2 * sampleH;
  const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
  const background = tone => tone === 'ink' ? report.colors.paper : report.colors.deep;
  const cells = glyphs.map(character => ({ character, boxes: {} }));
  TONES.forEach((tone, t) => {
    const top = t * blockH;
    ctx.fillStyle = background(tone); ctx.fillRect(0, top, blockW, blockH);
    glyphs.forEach((character, i) => {
      const x = pad + (i % cols) * (cw + pad), y = top + pad + Math.floor(i / cols) * (ch + pad);
      font.draw(ctx, character, x, y, { scale, tone });
      cells[i].boxes[tone] = { x, y, w: cw, h: ch };
    });
  });
  ['cream', 'ink'].forEach((tone, i) => {
    const top = TONES.length * blockH + i * sampleH;
    ctx.fillStyle = background(tone); ctx.fillRect(0, top, width, sampleH);
    font.draw(ctx, text, pad, top + pad, { scale: sampleScale, tone, maxWidth: sampleWidth });
  });
  return {
    png: canvas.toBuffer('image/png'),
    report: { version: 1, width, height, scale, tones: TONES, glyphs: cells, sample: { text, scale: sampleScale, lines: sample.lines } },
  };
}
