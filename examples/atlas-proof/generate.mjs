// Two independently timed, editable sources for an atlas alignment proof.
export function operations(overlay = false) {
  const count = overlay ? 3 : 4, name = overlay ? 'hat' : 'body';
  const ops = [{ command: 'new', name, size: 16, rows: 1, cols: count, palette: 'db-32' }];
  for (let i = 0; i < count; i++) {
    const cell = `0,${i}`, bob = i % 2;
    const rect = (name, x, y, w, h, color) => ops.push({ command: 'draw', type: 'rect', name, cell, x, y, w, h, color, filled: true });
    if (overlay) {
      rect('hat-brim', 3 + bob, 4, 10, 1, '#222034');
      rect('hat-crown', 5 + bob, 1, 6, 3, '#d95763');
      rect('hat-band', 5 + bob, 3, 6, 1, '#fbf236');
    } else {
      rect('head-outline', 4, 4 + bob, 8, 7, '#222034');
      rect('face', 5, 5 + bob, 6, 5, '#ffccaa');
      rect('left-eye', 6, 7 + bob, 1, 1, '#222034');
      rect('right-eye', 9, 7 + bob, 1, 1, '#222034');
      rect('coat', 4, 11 + bob, 8, 4 - bob, '#5fcde4');
      rect('feet', 4, 15, 8, 1, '#222034');
    }
    ops.push({ command: 'name', cell, as: `${name}-${i}` });
  }
  ops.push({ command: 'group', sub: 'create', name: 'idle', cells: Array.from({ length: count }, (_, i) => `0,${i}`), fps: overlay ? 10 : 8 });
  ops.push({ command: 'pivot', anchor: 'bottom-center' });
  return ops;
}
