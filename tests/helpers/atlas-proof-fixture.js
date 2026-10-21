import { createCanvas } from 'canvas';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function atlasProofFixture(dir) {
  const canvas = createCanvas(4, 2), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = '#0000ff'; ctx.fillRect(3, 1, 1, 1);
  writeFileSync(join(dir, 'motion.png'), canvas.toBuffer('image/png'));
  const atlas = { frames: [0, 1].map(i => ({ filename: `pose-${i}`,
    frame: { x: i * 2, y: 0, w: 2, h: 2 }, rotated: false, trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: 2, h: 2 }, sourceSize: { w: 2, h: 2 }, duration: 100,
  })), meta: { image: 'motion.png', size: { w: 4, h: 2 }, frameTags: [{ name: 'move', from: 0, to: 1, direction: 'forward' }] } };
  writeFileSync(join(dir, 'motion.atlas.json'), JSON.stringify(atlas));
  const config = join(dir, 'proof-input.json');
  writeFileSync(config, JSON.stringify({ version: 1, canvas: { w: 3, h: 3 },
    tracks: [{ name: 'base', atlas: 'motion.atlas.json', tag: 'move', x: 1, y: 1 }],
  }));
  return config;
}
