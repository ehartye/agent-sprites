import { Project } from '../engine/project.js';
import { projectName } from '../session-activation.js';

function map(value) { return value && typeof value === 'object' && !Array.isArray(value); }
export function validateImportedProject(data, { maxCells, maxShapes }, name) {
  const rows = data?.grid?.rows, cols = data?.grid?.cols;
  if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(cols) || rows <= 0 || cols <= 0 || rows * cols > maxCells) throw new Error(`Project exceeds ${maxCells} declared cells or has invalid dimensions`);
  if (!Array.isArray(data.palette) || !map(data.cells)) throw new Error('Invalid project palette or cells');
  const validRef = ref => { const m = /^(\d+),(\d+)$/.exec(ref); return m && +m[1] < rows && +m[2] < cols; };
  let shapes = 0;
  for (const [ref, cell] of Object.entries(data.cells)) {
    if (!validRef(ref) || !map(cell) || !Array.isArray(cell.shapes)) throw new Error('Invalid project cell');
    shapes += cell.shapes.length;
    if (shapes > maxShapes) throw new Error(`Project exceeds ${maxShapes} expanded shapes`);
  }
  if (data.shapeGroups !== undefined) {
    if (!map(data.shapeGroups)) throw new Error('Shape groups must map cell references to groups');
    for (const [ref, groups] of Object.entries(data.shapeGroups)) {
      if (!validRef(ref) || !map(groups)) throw new Error('Invalid shape group cell or group map');
      for (const members of Object.values(groups)) if (!Array.isArray(members) || members.some(v => typeof v !== 'string')) throw new Error('Shape group members must be string arrays');
    }
  }
  const project = Project.fromJSON(data);
  project.name = projectName(name ?? project.name);
  return { project, summary: { name: project.name, rows, cols, cells: rows * cols, shapes } };
}
