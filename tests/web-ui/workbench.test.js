// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { Workbench } from '../../server/web/public/js/workbench.js';
import { COMMANDS, commandRequest } from '../../server/web/public/js/command-catalog.js';
import { ShapePanel } from '../../server/web/public/js/panels.js';

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
test('skin tone buttons apply a whole ramp to the pinned session, separately from drawing swatches', async () => {
  bench.sessionId = 'different-session';
  bench.renderPalettes({ current: [], presets: [], skinTones: { supported: true, selected: 'rose', sessionId: 'skin-session', presets: [
    { id: 'umber', name: 'Umber', colors: { highlight: '#8b3e28', base: '#80362d', shadow: '#732b2c', outline: '#432331' } },
  ] } });
  const button = document.querySelector('[data-skin-tone="umber"]');
  expect(button).not.toBeNull();
  button.click();
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith('/workbench/skin-tone', { tone: 'umber' }, { sessionId: 'skin-session' }));
  expect(color).not.toHaveBeenCalled();
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
test('a batch pins its starting session and stops when another client switches designs', async () => {
  bench.sessionId = 'original';
  request.mockImplementation(async path => {
    if (path === '/workbench/map-operations') return { data: [
      { path: '/api/draw', method: 'POST', body: { type: 'point' } },
      { path: '/api/draw', method: 'POST', body: { type: 'point' } },
    ] };
    bench.sessionId = 'other';
    return { data: 'ok' };
  });
  await bench.show('tools'); bench.selectCommand('batch');
  [...document.querySelectorAll('button')].find(button => button.textContent === 'Apply operations').click();
  await vi.waitFor(() => expect(document.getElementById('workbench-status').textContent).toContain('Stopped at operation 2'));
  expect(request.mock.calls.filter(([path]) => path === '/draw')).toHaveLength(1);
  expect(request).toHaveBeenCalledWith('/draw', { type: 'point' }, { sessionId: 'original' });
});
test('large traces render bounded shape pages with a searchable full list', () => {
  document.body.innerHTML = '<input id="shape-search"><div id="shape-pagination"></div><ul id="shape-items"></ul>';
  const panel = new ShapePanel(); panel.init({});
  panel.setShapes(Array.from({ length: 10001 }, (_, index) => ({ id: `s${index}`, name: `run-${index}`, color: '#000000', zIndex: index, type: 'rect' })));
  expect(document.querySelectorAll('#shape-items li')).toHaveLength(100);
  const search = document.getElementById('shape-search'); search.value = 'run-5555'; search.dispatchEvent(new Event('input'));
  expect(document.querySelectorAll('#shape-items li')).toHaveLength(1);
  expect(document.getElementById('shape-items').textContent).toContain('run-5555');
});
