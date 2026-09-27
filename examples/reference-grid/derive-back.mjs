import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SKIN_TONES } from '../../server/engine/skin-tones.js';

// A deliberately small, authored rear study for the established adult/child
// mannequin templates, not an automatic image-to-back-view conversion.
export function deriveBackStudy(project, { kind = 'adult', tone = 'peach' } = {}) {
  const profile = { adult: { top: 2, shoulders: 15, hips: 22 }, child: { top: 8, shoulders: 20, hips: 25 } }[kind];
  const ramp = SKIN_TONES.find(item => item.id === tone)?.colors;
  if (!profile || !ramp) throw new Error('Choose an adult/child template and a supported skin tone.');
  if (project.cellWidth !== 16 || project.cellHeight !== 32) throw new Error('This study requires the centered 16x32 template.');
  const front = project.cells['0,0'], right = project.cells['1,0'];
  if (!front?.shapes?.length || !right?.shapes?.length) throw new Error('Front 0,0 and right 1,0 source frames are required.');
  for (const cell of [front, right]) for (const shape of cell.shapes) {
    const { x, y } = shape.params;
    if (shape.type !== 'point' || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 15 || y < 0 || y > 31 || shape.visible === false) throw new Error('Source must contain visible, in-bounds named point shapes.');
  }
  const mask = new Set(front.shapes.map(s => `${s.params.x},${s.params.y}`));
  const head = front.shapes.filter(s => s.params.y >= profile.top && s.params.y <= profile.top + 10);
  if (Math.min(...head.map(s => s.params.x)) !== 3 || Math.max(...head.map(s => s.params.x)) !== 12) throw new Error('Expected a centered ten-pixel head.');
  const ops = [{ command: 'new', name: `back-study-${kind}`, size: '16x32', rows: 1, cols: 3 }];
  // Preserve the existing neutral front and profile as comparison frames.
  for (const [sourceRef, cell, name] of [['0,0','0,0','front'], ['1,0','0,1','right']]) {
    ops.push({ command: 'name', cell, as: name });
    for (const shape of project.cells[sourceRef].shapes) ops.push({ command: 'draw', type: 'point', cell, name: shape.name, ...shape.params, color: Object.entries(project.shapeGroups?.[sourceRef] ?? {}).reduce((color, [group, names]) => group.startsWith('skin-') && names.includes(shape.name) ? (ramp[group.slice(5)] ?? color) : color, shape.color) });
    for (const [name, shapes] of Object.entries(project.shapeGroups?.[sourceRef] ?? {})) ops.push({ command: 'shape-group', sub: 'create', cell, name, shapes });
  }
  const groups = { head: [], body: [], 'skin-highlight': [], 'skin-base': [], 'skin-shadow': [], 'skin-outline': [] };
  ops.push({ command: 'name', cell: '0,2', as: 'back' });
  for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) {
    if (!mask.has(`${x},${y}`)) continue;
    const edge = [[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dy]) => !mask.has(`${x+dx},${y+dy}`));
    const isHead = y <= profile.top + 10;
    let role = 'base';
    if (isHead) {
      // Broad upper-left cranial light; lower skull and right side turn away.
      if (((y === profile.top + 2 && x >= 6 && x <= 8) || (y >= profile.top + 3 && y <= profile.top + 5 && x >= 5 && x <= 8) || (y === profile.top + 6 && x >= 5 && x <= 7))) role = 'highlight';
      if (x >= 10 || y >= profile.top + 9) role = 'shadow';
    } else if (y < profile.shoulders) role = 'shadow';
    else {
      if (x <= 6 && y < profile.hips) role = 'highlight';
      if (x >= 10) role = 'shadow';
      // Subtle scapula planes, kept clear of the outer arm contour.
      if (y === profile.shoulders + 2 && (x === 6 || x === 9)) role = 'shadow';
      if (y >= profile.shoulders + 2 && y <= profile.hips && (x === 4 || x === 11)) role = 'outline';
      if (y === profile.hips && x >= 5 && x <= 10) role = 'shadow';
      // Separate the legs and shade heels, without carrying frontal anatomy over.
      if (y > profile.hips && (x === 7 || x === 8)) role = 'outline';
      if (y === 28 && (x === 5 || x === 10)) role = 'highlight';
    }
    if (edge) role = 'outline';
    const part = isHead ? 'head' : 'body', name = `back-${part}-${x}-${y}`;
    groups[part].push(name); groups[`skin-${role}`].push(name);
    ops.push({ command: 'draw', type: 'point', cell: '0,2', name, x, y, color: ramp[role] });
  }
  for (const [name, shapes] of Object.entries(groups)) ops.push({ command: 'shape-group', sub: 'create', cell: '0,2', name, shapes });
  ops.push({ command: 'pivot', anchor: 'bottom-center' });
  return ops;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: node derive-back.mjs centered.project.json [adult|child] [tone]');
  process.stdout.write(JSON.stringify(deriveBackStudy(JSON.parse(readFileSync(resolve(process.argv[2]), 'utf8')), { kind: process.argv[3] ?? 'adult', tone: process.argv[4] ?? 'peach' })));
}
