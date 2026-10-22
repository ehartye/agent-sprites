import { Project } from '../engine/project.js';
import { Shape } from '../engine/shape.js';
import { projectName } from '../session-activation.js';

export function validateImportedProject(data, { maxCells, maxShapes }, name) {
  // The shared loader validates raw data before allocating and interns V1 directly.
  const project = Project.fromJSON(data, { sharedGeometry: true, maxCells, maxShapes });
  const { rows, cols } = project.cells;
  const shapes = Object.values(data.cells).reduce((count, cell) => count + cell.shapes.length, 0);
  Shape.assertIdAllocationAvailable();
  project.name = projectName(name ?? project.name);
  return { project, summary: { name: project.name, rows, cols, cells: rows * cols, shapes } };
}
