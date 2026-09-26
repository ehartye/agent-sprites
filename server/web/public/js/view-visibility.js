// trace creates these named rectangles. Filtering is local to the viewer;
// project data, agent operations and exported artwork retain every shape.
export const isTracedShape = shape => shape.type === 'rect' && /^trace-\d{6}$/.test(shape.name ?? '');

export function cellsForView(cells = {}, { trace = true, reference = true } = {}) {
  if (trace && reference) return cells;
  return Object.fromEntries(Object.entries(cells).map(([ref, cell]) => [ref, {
    ...cell,
    shapes: trace ? cell.shapes : (cell.shapes ?? []).filter(shape => !isTracedShape(shape)),
    reference: reference ? cell.reference : null,
  }]));
}
