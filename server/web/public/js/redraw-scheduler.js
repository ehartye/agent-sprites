/**
 * Coalesce view refreshes: any number of edits between two animation frames
 * produce one flush with the set of cells they touched. A thousand-point batch
 * broadcast then costs one redraw instead of a thousand.
 */
export function createRedrawScheduler(flush, schedule = cb => requestAnimationFrame(cb)) {
  let dirty = null;
  return {
    /** Mark a cell ref as changed and make sure a flush is pending. */
    mark(ref) {
      if (!dirty) {
        dirty = new Set();
        schedule(() => {
          const refs = dirty;
          dirty = null;
          flush(refs);
        });
      }
      dirty.add(ref);
    },
  };
}
