// Recovered ramps from the seven diagonal tone demonstrations in the doll
// references. Roles describe lighting, independent of pose or chosen tone.
export const SKIN_TONES = [
  { id: 'rose', name: 'Rose', colors: { highlight: '#ffc0c2', base: '#ffa7cf', shadow: '#e079b8', outline: '#6a396a' } },
  { id: 'peach', name: 'Peach', colors: { highlight: '#ffc3b9', base: '#ffa9ad', shadow: '#f08099', outline: '#673649' } },
  { id: 'apricot', name: 'Apricot', colors: { highlight: '#faa282', base: '#f08961', shadow: '#e26c52', outline: '#673649' } },
  { id: 'terracotta', name: 'Terracotta', colors: { highlight: '#c86a5c', base: '#b95b56', shadow: '#a94a4f', outline: '#6c3a57' } },
  { id: 'umber', name: 'Umber', colors: { highlight: '#8b3e28', base: '#80362d', shadow: '#732b2c', outline: '#432331' } },
  { id: 'plum', name: 'Plum', colors: { highlight: '#8b3a47', base: '#7b334c', shadow: '#6b3052', outline: '#3b184f' } },
  { id: 'espresso', name: 'Espresso', colors: { highlight: '#5d271b', base: '#531f1b', shadow: '#491b1d', outline: '#2f071a' } },
];
const roles = ['highlight', 'base', 'shadow', 'outline'];
const rgb = hex => hex.match(/[a-f\d]{2}/gi).map(v => parseInt(v, 16));
const candidates = SKIN_TONES.flatMap(tone => Object.entries(tone.colors).map(([role, hex]) => ({ role, rgb: rgb(hex) })));
// Eye colors compete with skin colors so iris brown is never mistaken for skin.
for (const hex of ['#000000', '#d3c0b8', '#682b0f', '#fffdfc', '#813f20', '#f5e2ff', '#b2e5f9', '#3c4e77', '#edf4fa', '#8f71c6']) candidates.push({ role: null, rgb: rgb(hex) });
export function referenceSkinRole(hex) {
  if (!/^#[a-f\d]{6}$/i.test(hex)) throw new Error('Expected a six-digit reference color');
  const value = rgb(hex);
  const nearest = candidates.map(c => ({ ...c, distance: c.rgb.reduce((sum, n, i) => sum + (n - value[i]) ** 2, 0) })).sort((a, b) => a.distance - b.distance)[0];
  return nearest.distance <= 24 ** 2 ? nearest.role : null;
}

function skinMembers(project) {
  const cells = [];
  for (const [ref, groups] of Object.entries(project.shapeGroups)) {
    const cell = project.cells.getCell(ref), members = new Map();
    for (const role of roles) for (const name of groups[`skin-${role}`] ?? []) {
      const shape = cell.shapes.get(name);
      if (!shape) continue; // Deleting a pixel should not disable the tone picker.
      if (members.has(shape) && members.get(shape) !== role) throw new Error(`Shape ${name} belongs to multiple skin roles`);
      members.set(shape, role);
    }
    if (members.size) cells.push({ cell, members });
  }
  return cells;
}
export function skinToneState(project) {
  const cells = project ? skinMembers(project) : [];
  return { supported: cells.length > 0, selected: cells.length ? SKIN_TONES.find(tone => cells.every(({ members }) => [...members].every(([shape, role]) => shape.color.toLowerCase() === tone.colors[role])))?.id ?? null : null, presets: SKIN_TONES };
}
export function applySkinTone(project, id) {
  const tone = SKIN_TONES.find(tone => tone.id === id);
  if (!tone) throw new Error(`Unknown skin tone: ${id}`);
  const cells = skinMembers(project); // Validate all memberships before mutating.
  if (!cells.length) throw new Error('This design has no skin role groups. Normalize the reference first.');
  for (const { cell, members } of cells) {
    const before = [...members].map(([shape, role]) => ({ id: shape.id, role, color: shape.color }));
    cell._exec({
      execute: () => { for (const { id, role } of before) { const shape = cell.shapes.get(id); if (shape) shape.color = tone.colors[role]; } },
      undo: () => { for (const { id, color } of before) { const shape = cell.shapes.get(id); if (shape) shape.color = color; } },
    });
  }
  return { tone: id, cells: cells.length };
}
