import { Project } from '../engine/project.js';
import { Shape } from '../engine/shape.js';
import { projectName } from '../session-activation.js';
import { validateProjectData } from '../engine/project-validation.js';

export function validateImportedProject(data, { maxCells, maxShapes }, name) {
  const { rows, cols, shapes } = validateProjectData(data, { maxCells, maxShapes });
  const project = Project.fromJSON(data);
  Shape.assertIdAllocationAvailable();
  project.name = projectName(name ?? project.name);
  return { project, summary: { name: project.name, rows, cols, cells: rows * cols, shapes } };
}
