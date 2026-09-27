import { test, expect } from 'vitest';
import { Project } from '../../server/engine/project.js';
import { SKIN_TONES, applySkinTone, skinToneState, referenceSkinRole } from '../../server/engine/skin-tones.js';

function fixture() {
  const project = Project.create({ name: 'Skin study', cellSize: 16, rows: 1, cols: 2 });
  for (const ref of ['0,0', '0,1']) {
    const cell = project.cells.getCell(ref);
    cell.draw('point', { x: 1, y: 1 }, '#ffc0c2', 'skin');
    cell.draw('point', { x: 2, y: 1 }, '#682b0f', 'eye');
    project.shapeGroups[ref] = { 'skin-highlight': ['skin'] };
  }
  return project;
}
test('recognizes equivalent shading across all seven reference tones, including compressed colors', () => {
  expect(SKIN_TONES).toHaveLength(7);
  expect(referenceSkinRole('#ffc0c2')).toBe('highlight');
  expect(referenceSkinRole('#8b3e28')).toBe('highlight');
  expect(referenceSkinRole('#8c3f29')).toBe('highlight');
  expect(referenceSkinRole('#531f1b')).toBe('base');
  expect(referenceSkinRole('#6a396a')).toBe('outline');
  expect(referenceSkinRole('#b2e5f9')).toBeNull();
  expect(referenceSkinRole('#682b0f')).toBeNull();
  expect(referenceSkinRole('#000000')).toBeNull();
});
test('switches every pose, preserves eyes and geometry, survives serialization and supports per-cell undo', () => {
  const project = fixture(), before = project.toJSON();
  applySkinTone(project, 'umber');
  expect(skinToneState(project).selected).toBe('umber');
  for (const ref of ['0,0', '0,1']) {
    const cell = project.cells.getCell(ref);
    expect(cell.shapes.getByName('skin').color).toBe('#8b3e28');
    expect(cell.shapes.getByName('eye').color).toBe('#682b0f');
    expect(cell.shapes.getByName('skin').params).toEqual({ x: 1, y: 1 });
  }
  expect(skinToneState(Project.fromJSON(project.toJSON())).selected).toBe('umber');
  project.cells.getCell('0,0').undo();
  expect(project.cells.getCell('0,0').toJSON()).toEqual(before.cells['0,0']);
  expect(skinToneState(project).selected).toBeNull();
});
test('invalid tone or conflicting role membership fails before changing any pose', () => {
  const project = fixture();
  expect(() => applySkinTone(project, 'missing')).toThrow('Unknown skin tone');
  project.shapeGroups['0,1']['skin-shadow'] = ['skin'];
  const before = project.toJSON();
  expect(() => applySkinTone(project, 'umber')).toThrow('multiple skin roles');
  expect(project.toJSON()).toEqual(before);
});
test('tone undo and redo resolve shapes recreated by undoing a deletion', () => {
  const project = fixture(), cell = project.cells.getCell('0,0');
  applySkinTone(project, 'umber');
  cell.deleteShape('skin'); cell.undo(); cell.undo();
  expect(cell.shapes.getByName('skin').color).toBe('#ffc0c2');
  cell.redo();
  expect(cell.shapes.getByName('skin').color).toBe('#8b3e28');
});
