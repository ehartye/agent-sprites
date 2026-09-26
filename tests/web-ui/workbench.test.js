// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { Workbench } from '../../server/web/public/js/workbench.js';
import { COMMANDS, commandRequest } from '../../server/web/public/js/command-catalog.js';

let bench, request, color;
beforeEach(() => {
  document.body.innerHTML = '<div id="workbench-mount"></div><div id="workbench-status"></div>';
  color = vi.fn();
  request = vi.fn(async path => {
    if (path.includes('/session/list')) return { data: [{ id: 's_1', project_name: '<script>sprite</script>', updated_at: Date.now() }] };
    if (path === '/workbench/palettes') return { data: { current: [], presets: [
      { name: 'pico8', colors: [{ name: 'red', color: '#ff004d' }] }, { name: 'nes', colors: [{ name: 'red', color: '#d82800' }] },
    ] } };
    return { data: 'ok' };
  });
  bench = new Workbench({ request, getCell: () => '1,2', getColor: () => '#aabbcc', setColor: color, refresh: vi.fn() });
  bench.init();
});
test('renders all palette families together; selecting another palette uses exact hex without renaming existing colors', async () => {
  await bench.show('palettes');
  expect(document.querySelectorAll('.palette-family')).toHaveLength(2);
  document.querySelector('[title="nes / red · #d82800"]').click();
  expect(color).toHaveBeenCalledWith('#d82800', '#d82800');
});
test('sessions are escaped and switching uses the stable id', async () => {
  await bench.show('sessions');
  expect(document.querySelector('script')).toBeNull();
  expect(document.querySelector('.session-entry').textContent).toContain('<script>sprite</script>');
  document.querySelector('.session-entry').click();
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith('/session/open-session', { ref: 's_1' }));
});
test('drawing forms start with the selected cell and literal active color', async () => {
  await bench.show('tools');
  bench.selectCommand('draw rect');
  expect(document.querySelector('[name="cell"]').value).toBe('1,2');
  expect(document.querySelector('[name="color"]').value).toBe('#aabbcc');
});
test('catalog includes every top-level CLI command and nested editing operation', () => {
  const ids = new Set(COMMANDS.map(c => c.id.split(' ')[0]));
  for (const id of ['new','open','sessions','save','export','pivot','status','restart','build','verify','trace','draw','shapes','rename','move','move-to','resize','recolor','clone','delete','duplicate','flip','rotate','copy','clone-cell','clear','name','mirror','rotate-cell','ref','view','view-anim','undo','redo','tween','group','shape-group','move-group','recolor-group','batch','cast']) expect(ids.has(id), id).toBe(true);
  expect(new Set(COMMANDS.map(c => c.id)).size).toBe(COMMANDS.length);
  expect(commandRequest(COMMANDS.find(c => c.id === 'shapes'), { cell: 'front & side' }).path).toBe('/api/shapes?cell=front+%26+side');
});
