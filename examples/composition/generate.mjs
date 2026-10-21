import { readFileSync } from 'node:fs';

const composition = JSON.parse(readFileSync(new URL('./composition.json', import.meta.url), 'utf8'));
console.log(JSON.stringify([
  { command: 'new', name: 'garden', size: 32, rows: 1, cols: 1, palette: 'db-32' },
  { command: 'draw', type: 'rect', name: 'soil', cell: '0,0', x: 0, y: 26, w: 32, h: 6, filled: true, color: '#663931' },
  { command: 'compose', ...composition },
  { command: 'name', cell: '0,0', as: 'garden' },
  { command: 'pivot', anchor: 'bottom-center' }
]));
