import { readFileSync } from 'node:fs';
import { decodePng } from '../../../server/engine/png-decode.js';
import { SKIN_TONES } from '../../../server/engine/skin-tones.js';
import { NATIVE_EYE_COLORS } from '../../../server/authoring/native/native-eyes.mjs';

const width = 16, height = 32, frames = 8;
const directions = ['front-right', 'back-right', 'back-left', 'front-left'];
const sheet = decodePng(readFileSync(new URL('./walk.png', import.meta.url)));
if (sheet.width !== width * frames || sheet.height !== height * directions.length) {
  throw new Error('The adult walk sheet must have eight columns and four rows of 16 by 32 pixels.');
}
const palette = SKIN_TONES.find(tone => tone.id === 'peach').colors;
const roleByColor = new Map();
for (const [material, colors] of [['skin', palette], ['eyes', NATIVE_EYE_COLORS]]) {
  for (const [role, color] of Object.entries(colors)) roleByColor.set(color, material + '-' + role);
}

const operations = [{ command: 'new', name: 'adult-diagonal-walk', size: '16x32', rows: 4, cols: frames }];
for (const [row, direction] of directions.entries()) {
  const cells = [];
  for (let frame = 0; frame < frames; frame++) {
    const cell = [row, frame].join(',');
    cells.push(cell);
    const groups = new Map();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = ((row * height + y) * sheet.width + frame * width + x) * 4;
        if (sheet.data[offset + 3] === 0) continue;
        const color = '#' + Buffer.from(sheet.data.subarray(offset, offset + 3)).toString('hex');
        const role = roleByColor.get(color);
        if (!role || sheet.data[offset + 3] !== 255) throw new Error('Unexpected color or opacity in ' + cell);
        const name = 'pixel_' + x + '_' + y;
        operations.push({ command: 'draw', type: 'point', cell, name, x, y, color });
        if (!groups.has(role)) groups.set(role, []);
        groups.get(role).push(name);
      }
    }
    for (const [name, shapes] of groups) {
      operations.push({ command: 'shape-group', sub: 'create', cell, name, shapes });
    }
    operations.push({ command: 'name', cell, as: direction + '_walk_' + frame });
    operations.push({ command: 'duration', cell, ms: frame % 2 === 0 ? 62 : 63 });
  }
  operations.push({ command: 'group', sub: 'create', name: 'walk_' + direction, cells, fps: 16 });
}
operations.push({ command: 'pivot', x: 8, y: 29 });
process.stdout.write(JSON.stringify(operations));
