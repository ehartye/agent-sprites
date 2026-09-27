import { test, expect } from 'vitest';
import { previewSequences, selectPreviewSequence } from '../../server/web/public/js/preview-sequences.js';

const project = { grid: { rows: 2, cols: 4 }, groups: {}, animationFps: {} };
test('an untagged sheet defaults to a playable row, with explicit cell and whole-sheet choices', () => {
  const options = previewSequences(project, '1,2');
  expect(selectPreviewSequence(options, 'row').frames).toEqual(['1,0','1,1','1,2','1,3']);
  expect(selectPreviewSequence(options, 'cell').frames).toEqual(['1,2']);
  expect(selectPreviewSequence(options, 'all').frames).toHaveLength(8);
});
test('saved groups retain repeated frames and timing; removed groups fall back to the current row', () => {
  const options = previewSequences({ ...project, groups: { walk: ['0,1','0,0','0,2','0,0'] }, animationFps: { walk: 6 } }, '0,0');
  expect(selectPreviewSequence(options, 'group:walk')).toMatchObject({ frames: ['0,1','0,0','0,2','0,0'], fps: 6 });
  expect(selectPreviewSequence(previewSequences(project, '0,0'), 'group:walk').id).toBe('row');
});
test('live group previews follow reverse and pingpong tag directions', () => {
  const options = previewSequences({ ...project, groups: { chomp: ['0,0','0,1','0,2'], back: ['0,0','0,1'] }, animationDirections: { chomp: 'pingpong', back: 'reverse' } }, '0,0');
  expect(selectPreviewSequence(options, 'group:chomp').frames).toEqual(['0,0','0,1','0,2','0,1']);
  expect(selectPreviewSequence(options, 'group:back').frames).toEqual(['0,1','0,0']);
});
