// Front and back arm swing for the 16x32 mannequins.
//
// The stride poses (phases 1 and 3) are the two contact frames. Each already had
// one long and one short arm, but only two rows apart, and the whole body bobs
// down one row on the same frames, so the arms read as rising and falling with
// the torso. The contact poses now push the arms apart: the near arm (swinging
// toward the viewer in the front view, back toward the viewer in the rear view)
// ends one row lower and carries a two-pixel hand; the far arm (swinging away)
// ends one row higher and tucks its hand. Phase 3 mirrors phase 1. Passing poses
// (0 and 2) keep both arms at the sides.
//
// The front arms are authored in the source templates (templates/*.project.json,
// cells 0,1 and 0,3). The rear study derives its silhouette from the front mask,
// so it inherits the longer and shorter arms; the tables below only finish what
// the derivation leaves untidy. They are in source-pose pixels: `set` writes a pixel
// with a skin role (adding it when absent) and `clear` removes one. Roles keep the
// skin-tone ramp, so every garment, costume and suit derived from the mannequin follows.
const mirror = ([x, y, role]) => role === undefined ? [15 - x, y] : [15 - x, y, role];
const REAR = {
  // Recolour only: the rear silhouette must stay identical to the front's.
  adult: {
    1: {set: [[10,24,'outline']], clear: []},
    3: {set: [[5,24,'outline']], clear: []},
  },
};

/** Rear-study finishing patch for one source pose, or null when there is none. */
export function armSwingPatch(kind, dir, phase) {
  if (dir !== 'back' || phase % 2 === 0) return null;
  const table = REAR[kind];
  if (!table) return null;
  if (table[phase]) return table[phase];
  const first = table[1];
  return first && {set: first.set.map(mirror), clear: first.clear.map(mirror)};
}

/**
 * Apply a patch to one cell's draw and shape-group operations. `colors` maps the
 * four skin roles to the tone's ramp. Returns new operations; the input is untouched.
 */
export function applyArmSwing(cellOps, patch, colors) {
  if (!patch) return cellOps;
  const draws = cellOps.filter(o => o.command === 'draw').map(o => ({...o}));
  const groups = cellOps.filter(o => o.command === 'shape-group').map(o => ({...o, shapes: [...o.shapes]}));
  const cell = (draws[0] ?? groups[0]).cell;
  const at = (x, y) => draws.findIndex(o => o.x === x && o.y === y);
  const group = name => groups.find(g => g.name === name) ?? groups[groups.push({command: 'shape-group', sub: 'create', cell, name, shapes: []}) - 1];
  for (const [x, y] of patch.clear) {
    const i = at(x, y);
    if (i < 0) continue;
    const name = draws[i].name;
    for (const g of groups) g.shapes = g.shapes.filter(n => n !== name);
    draws.splice(i, 1);
  }
  for (const [x, y, role] of patch.set) {
    const i = at(x, y);
    let name;
    if (i >= 0) {
      name = draws[i].name;
      for (const g of groups) if (g.name.startsWith('skin-')) g.shapes = g.shapes.filter(n => n !== name);
      draws[i].color = colors[role];
    } else {
      name = `arm-${x}-${y}`;
      draws.push({command: 'draw', type: 'point', cell, name, x, y, color: colors[role]});
      group('body').shapes.push(name);
    }
    group(`skin-${role}`).shapes.push(name);
  }
  return [...draws, ...groups.filter(g => g.shapes.length)];
}
