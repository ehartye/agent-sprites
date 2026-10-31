import { createCanvas, loadImage } from 'canvas';
import { createBitmapFont, fontToneNames } from './ui-runtime.mjs';
const PANGRAM = 'The quick brown fox jumps over the lazy dog.\n0123456789 Sphinx of black quartz, judge my vow!';

/**
 * A reviewable proof of a bitmap font: every glyph in every tone at 3x, then
 * wrapped multiline sample text, drawn through the same portable runtime games
 * use. Light tones sit on the deep panel color, ink on paper. `proof.surfaces`
 * from the build config maps a tone to the hex background a game really draws
 * it on; the report then lists every sampled tone and surface pairing.
 */
const luminance = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return Math.round((hi + 0.05) / (lo + 0.05) * 100) / 100; };

/** Validates the optional `proof` setting; returns a tone to lowercase hex map, or null when none is declared. */
export function parseProofSurfaces(proof, tones) {
  if (proof === undefined) return null;
  if (!proof || typeof proof !== 'object' || Array.isArray(proof)) throw new Error('proof must be an object with an optional surfaces map.');
  for (const key of Object.keys(proof)) if (key !== 'surfaces') throw new Error(`Unknown proof field: ${key}. Supported: surfaces.`);
  const { surfaces } = proof;
  if (surfaces === undefined) return null;
  if (!surfaces || typeof surfaces !== 'object' || Array.isArray(surfaces)) throw new Error('proof.surfaces must map a tone name to a #rrggbb background.');
  const out = {};
  for (const [tone, value] of Object.entries(surfaces)) {
    if (!tones.includes(tone)) throw new Error(`proof.surfaces names unknown tone "${tone}"; this font's tones are ${tones.join(', ')}.`);
    if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error(`proof.surfaces.${tone} must be a #rrggbb hex color, got ${JSON.stringify(value)}.`);
    out[tone] = value.toLowerCase();
  }
  return Object.keys(out).length ? out : null;
}

export async function renderFontProof(png, atlas, report, options = {}) {
  const TONES = fontToneNames(report);
  const declared = parseProofSurfaces(options.proof, TONES);
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
  const background = tone => declared?.[tone] ?? (tone === 'ink' ? report.colors.paper : report.colors.deep);
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
  [TONES[0], TONES.includes('ink') ? 'ink' : TONES.at(-1)].forEach((tone, i) => {
    const top = TONES.length * blockH + i * sampleH;
    ctx.fillStyle = background(tone); ctx.fillRect(0, top, width, sampleH);
    font.draw(ctx, text, pad, top + pad, { scale: sampleScale, tone, maxWidth: sampleWidth });
  });
  const proofReport = { version: 1, width, height, scale, tones: TONES, glyphs: cells, sample: { text, scale: sampleScale, lines: sample.lines } };
  // Only declared surfaces add a field, so an undeclared proof keeps its exact bytes.
  if (declared) proofReport.pairings = TONES.map(tone => ({ tone, surface: background(tone), declared: tone in declared, contrast: contrast(report.colors[tone], background(tone)) }));
  return { png: canvas.toBuffer('image/png'), report: proofReport };
}
