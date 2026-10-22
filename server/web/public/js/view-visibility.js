// trace creates these named rectangles. Filtering is local to the viewer;
// project data, agent operations and exported artwork retain every shape.
export const isTracedShape = shape => shape.type === 'rect' && /^trace-\d{6}$/.test(shape.name ?? '');
const views = new WeakMap();

export function cellsForView(cells = {}, { trace = true, reference = true } = {}) {
  if (trace && reference) return cells;
  return Object.fromEntries(Object.entries(cells).map(([ref, cell]) => {
    let variants = views.get(cell);
    if (!variants) { variants = new Map(); views.set(cell, variants); }
    const key = `${trace}/${reference}`;
    const { shapes, ...metadata } = cell, metadataKey = JSON.stringify(metadata), cached = variants.get(key);
    // Progressive cells are immutable. Legacy callers can mutate metadata or
    // reorder the same shape array, so retain only an ordered identity snapshot.
    const ordered = Array.isArray(shapes) ? shapes : null;
    const unchanged = cached && cached.metadataKey === metadataKey && cached.source === shapes &&
      (trace || (cached.ordered?.length === ordered?.length && (ordered ?? []).every((shape, i) => cached.ordered[i] === shape && cached.traced[i] === isTracedShape(shape))));
    if (!unchanged) variants.set(key, { metadataKey, source: shapes,
      ordered: ordered && [...ordered], traced: ordered?.map(isTracedShape), value: { ...cell,
        ...(ordered ? { shapes: trace ? shapes : shapes.filter(shape => !isTracedShape(shape)) } : {}),
        ...(reference ? {} : { reference: null }),
      } });
    return [ref, variants.get(key).value];
  }));
}
