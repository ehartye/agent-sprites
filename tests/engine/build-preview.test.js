import { test, expect } from 'vitest';
import { animationSequence, createPreview } from '../../server/build/preview.js';
test.each([
  ['forward',[2,3,4]], ['reverse',[4,3,2]], ['pingpong',[2,3,4,3]], ['pingpong_reverse',[4,3,2,3]],
])('preview honors %s animation direction', (direction, expected) => {
  expect(animationSequence({from:2,to:4,direction})).toEqual(expected);
});
test('preview safely embeds asset names containing script markup', () => {
  const html=createPreview({frames:[],meta:{frameTags:[]}},Buffer.from('png'),'</script><script>alert(1)</script>');
  expect(html.match(/<script>/g)).toHaveLength(1);
  expect(html).toContain('\\u003c/script>');
});
