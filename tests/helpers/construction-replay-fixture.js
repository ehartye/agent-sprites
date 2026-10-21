import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildProject } from '../../server/build/project-build.js';

export async function constructionReplayFixture(dir) {
  writeFileSync(join(dir, 'operations.json'), JSON.stringify([
    { command: 'new', name: 'replay-test', size: 8, rows: 1, cols: 1, palette: 'pico8' },
    { command: 'draw', type: 'rect', cell: '0,0', name: 'body', x: 1, y: 1, w: 4, h: 4, color: '#ff0000', filled: true },
    { command: 'draw', type: 'point', cell: '0,0', name: 'eye', x: 2, y: 2, color: '#0000ff' },
  ]));
  const file = join(dir, 'sprite-project.json');
  writeFileSync(file, JSON.stringify({ version: 1, ops: 'operations.json', output: 'dist', replay: { cells: ['0,0'], maxSteps: 16 } }));
  const built = await buildProject(file);
  if (!built.ok) throw new Error(JSON.stringify(built.errors));
  return built;
}
