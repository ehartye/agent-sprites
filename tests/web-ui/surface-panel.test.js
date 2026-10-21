// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { Workbench } from '../../server/web/public/js/workbench.js';
import { validateSurface, validateLighting } from '../../server/web/public/js/shared/surface-model.js';

let bench, project, request, refresh, selectedCell;
const png = 'data:image/png;base64,iVBORw0KGgo=';
const fixture = () => ({ name: 'Surface study', grid: { rows: 1, cols: 2 }, cells: {
  '0,0': { name: 'rest', shapes: [
    { id: 'shape-id', name: 'body', params: { surface: { normal: { mode: 'bevel', width: 2, depth: 1 }, material: { wall: true }, lamps: [{ name: 'key', x: 2, y: 3, color: '#fff' }] } } },
    { id: 'body', params: {} },
  ] },
  '0,1': { name: 'step', shapes: [{ id: 'next', name: 'foot', params: {} }] },
} });
const control = name => document.querySelector(`[name="${name}"]`);
const action = name => document.querySelector(`[data-action="surface-${name}"]`);
const feedback = () => document.querySelector('[data-surface-status]');
const edit = (name, value) => { const node = control(name); node.value = value; node.dispatchEvent(new Event('input')); };
const choose = (name, value) => { const node = control(name); node.value = value; node.dispatchEvent(new Event('change')); };
const check = (name, value) => { const node = control(name); node.checked = value; node.dispatchEvent(new Event('change')); };
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const surface = () => JSON.parse(control('surface-json').value);
const lighting = () => JSON.parse(control('lighting-json').value);

beforeEach(() => {
  document.body.innerHTML = '<div id="workbench-mount"></div><div id="workbench-status"></div>';
  project = fixture(); refresh = vi.fn(); selectedCell = 'rest';
  request = vi.fn(async (path, body) => {
    if (path === '/workbench/project') return { data: structuredClone(project) };
    if (path === '/cell/surface') {
      const shape = project.cells[body.cell].shapes.find(shape => shape.id === body.shapeId);
      if (body.surface === null) delete shape.params.surface;
      else shape.params.surface = validateSurface(body.surface);
    }
    if (path === '/cell/lighting') {
      if (body.lighting === null) delete project.cells[body.cell].lighting;
      else project.cells[body.cell].lighting = validateLighting(body.lighting);
    }
    if (path.startsWith('/cell/surface-preview?')) return { data: { cell: '0,0', channel: new URLSearchParams(path.split('?')[1]).get('channel'), image: png } };
    return { data: {} };
  });
  bench = new Workbench({ request, getCell: () => selectedCell, getShape: () => project.cells['0,0'].shapes[1], getColor: () => '#fff', setColor: vi.fn(), refresh });
  bench.init(); bench.setProject(project, 'surface-session');
});

test('Lighting tab shows the canonical cell and selects unnamed shapes by typed ID', async () => {
  expect(document.querySelector('[data-panel="lighting"]')).not.toBeNull();
  await bench.show('lighting');
  expect(document.querySelector('[data-surface-cell]').textContent).toContain('0,0 · rest');
  expect(control('surface-shape').value).toBe('body');
  expect(control('surface-shape').selectedOptions[0].textContent).toContain('Unnamed');
  expect(control('surface-shape').options).toHaveLength(2);
  expect(control('lighting-enabled').checked).toBe(false);
  expect(control('lighting-policy').value).toBe('');
  expect(document.querySelector('[data-surface-ownership]').textContent).toContain('shape');
  expect(document.querySelector('[data-lighting-policy]').textContent).toContain('opaque');
});

test('normal presets and material edits retain lamps and unrelated metadata', async () => {
  await bench.show('lighting'); choose('surface-shape', 'shape-id');
  edit('normal-depth', '2.5'); edit('normal-width', '3');
  check('material-unlit', true);
  expect(surface()).toMatchObject({ normal: { mode: 'bevel', width: 3, depth: 2.5 }, material: { wall: true, unlit: true }, lamps: [{ name: 'key' }] });
  choose('normal-mode', 'flat'); edit('normal-vector', '[1, 0, 1]');
  expect(surface().normal).toEqual({ mode: 'flat', vector: [1, 0, 1] });
  choose('normal-mode', 'grid'); edit('normal-x', '-2'); edit('normal-y', '3'); edit('normal-rows', ' 7\nq.');
  expect(surface().normal).toEqual({ mode: 'grid', x: -2, y: 3, rows: [' 7', 'q.'] });
  expect(surface().material.wall).toBe(true); expect(surface().lamps[0].name).toBe('key');
});

test('bounded lamp JSON supports all properties and add/remove without mounting per-pixel rows', async () => {
  await bench.show('lighting'); choose('surface-shape', 'shape-id');
  const lamps = [{ name: 'fill', x: -3, y: 4, radius: 8, power: 0.5, z: 10, color: '#123456' }];
  edit('surface-lamps', JSON.stringify(lamps)); action('lamp-add').click();
  expect(surface().lamps).toHaveLength(2); expect(surface().lamps[0]).toEqual(lamps[0]);
  action('lamp-remove').click(); expect(surface().lamps).toEqual(lamps);
  edit('surface-json', JSON.stringify({ normal: { mode: 'grid', x: 0, y: 0, rows: ['7'.repeat(256)].concat(Array(255).fill('7'.repeat(256))) }, lamps: Array.from({ length: 64 }, (_, i) => ({ name: `lamp-${i}`, x: i, y: 0 })) }));
  expect(control('surface-json').maxLength).toBeGreaterThan(65000);
  expect(document.querySelectorAll('.surface-panel input').length).toBeLessThan(30);
  action('lamp-add').click(); expect(feedback().textContent).toContain('64');
  expect(surface().lamps).toHaveLength(64);
});

test('surface set and clear use pinned typed IDs and repaint normalized canonical metadata', async () => {
  await bench.show('lighting');
  choose('normal-mode', 'flat'); edit('normal-vector', '[4, 0, 4]'); action('save').click();
  await vi.waitFor(() => expect(feedback().textContent).toBe('Surface saved.'));
  expect(request).toHaveBeenCalledWith('/cell/surface', { cell: '0,0', shapeId: 'body', surface: validateSurface({ normal: { mode: 'flat', vector: [4, 0, 4] } }) }, { sessionId: 'surface-session' });
  expect(request).toHaveBeenCalledWith('/workbench/project', undefined, { sessionId: 'surface-session' });
  expect(surface().normal.vector[0]).toBeCloseTo(Math.SQRT1_2);
  expect(refresh).toHaveBeenCalledTimes(1);
  action('clear').click();
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith('/cell/surface', { cell: '0,0', shapeId: 'body', surface: null }, { sessionId: 'surface-session' }));
  await vi.waitFor(() => expect(control('normal-mode').value).toBe(''));
});

test('lighting requires an explicit palette policy and retains advanced fields during common edits', async () => {
  await bench.show('lighting'); check('lighting-enabled', true); action('lighting-save').click();
  await settle(); expect(request).not.toHaveBeenCalled(); expect(feedback().textContent).toContain('palettePolicy');
  edit('lighting-json', JSON.stringify({ palettePolicy: 'nearest', sky: 2, block: 0.7, shape: 'diamond', skyDir: [1, 2], skyReach: 12, relief: 3, skyColor: '#abc', ambientColor: '#123' }));
  edit('lighting-ambient', '0.5'); edit('lighting-cell', '8'); check('lighting-smooth', true);
  expect(lighting()).toMatchObject({ palettePolicy: 'nearest', ambient: 0.5, cell: 8, smooth: true, sky: 2, block: 0.7, shape: 'diamond', skyDir: [1, 2], skyReach: 12, relief: 3, skyColor: '#abc', ambientColor: '#123' });
  action('lighting-save').click(); await vi.waitFor(() => expect(feedback().textContent).toBe('Lighting saved.'));
  expect(request).toHaveBeenCalledWith('/cell/lighting', { cell: '0,0', lighting: validateLighting(lighting()) }, { sessionId: 'surface-session' });
  action('lighting-clear').click(); await vi.waitFor(() => expect(control('lighting-enabled').checked).toBe(false));
  expect(request).toHaveBeenCalledWith('/cell/lighting', { cell: '0,0', lighting: null }, { sessionId: 'surface-session' });
});

test('invalid advanced JSON and malformed metadata remain editable without mutations', async () => {
  await bench.show('lighting'); edit('surface-json', '{broken'); check('material-solid', true);
  expect(control('surface-json').value).toBe('{broken'); expect(feedback().classList.contains('error')).toBe(true);
  action('save').click(); await settle(); expect(request).not.toHaveBeenCalled();
  edit('surface-json', JSON.stringify({ normal: { mode: 'grid', x: 0, y: 0, rows: ['77', '7'] } }));
  action('save').click(); await settle(); expect(request).not.toHaveBeenCalled(); expect(feedback().textContent).toContain('equal width');
});

test('partial common fields and lamp JSON survive live refreshes and cannot silently save earlier values', async () => {
  await bench.show('lighting'); choose('surface-shape', 'shape-id');
  edit('normal-depth', ''); edit('surface-lamps', '[{"name":'); check('material-solid', true);
  bench.setProject(fixture(), 'surface-session');
  expect(control('normal-depth').value).toBe(''); expect(control('surface-lamps').value).toBe('[{"name":');
  expect(control('material-solid').checked).toBe(true);
  action('save').click(); await settle(); expect(request).not.toHaveBeenCalled();
  edit('normal-depth', '3'); edit('surface-lamps', '[{"name":"fixed","x":0,"y":0}]');
  action('save').click(); await vi.waitFor(() => expect(feedback().textContent).toBe('Surface saved.'));
  expect(surface()).toMatchObject({ normal: { depth: 3 }, lamps: [{ name: 'fixed', radius: 32 }] });
});

test('grid rows and cell lighting drafts survive live refreshes independently of surface edits', async () => {
  await bench.show('lighting'); choose('normal-mode', 'grid'); edit('normal-rows', ' q\n. ');
  check('lighting-enabled', true); choose('lighting-policy', 'rgb'); edit('lighting-ambient', '0.7');
  bench.setProject(fixture(), 'surface-session');
  expect(control('normal-rows').value).toBe(' q\n. '); expect(control('lighting-enabled').checked).toBe(true);
  expect(control('lighting-policy').value).toBe('rgb'); expect(control('lighting-ambient').value).toBe('0.7');
  action('save').click(); await vi.waitFor(() => expect(feedback().textContent).toBe('Surface saved.'));
  expect(control('lighting-ambient').value).toBe('0.7');
});

test('no session or no shape leaves cell lighting usable only when a cell is available', async () => {
  project.cells['0,0'].shapes = []; await bench.show('lighting');
  expect(action('save').disabled).toBe(true); expect(action('lighting-save').disabled).toBe(false);
  expect(control('normal-mode').disabled).toBe(true);
  expect(document.querySelector('[data-surface-empty]').hidden).toBe(false);
  check('lighting-enabled', true); choose('lighting-policy', 'rgb'); action('lighting-save').click();
  await vi.waitFor(() => expect(feedback().textContent).toBe('Lighting saved.'));
  bench.setProject(null, null); await settle();
  expect(action('preview').disabled).toBe(true); expect(action('lighting-save').disabled).toBe(true);
});

test('rejected preview URLs and preview errors never display arbitrary media', async () => {
  await bench.show('lighting');
  request.mockResolvedValueOnce({ data: { cell: '0,0', channel: 'color', image: 'https://foreign.example/image.png' } });
  action('preview').click(); await vi.waitFor(() => expect(feedback().textContent).toContain('PNG'));
  expect(document.querySelector('.surface-preview img').hasAttribute('src')).toBe(false);
  request.mockRejectedValueOnce(new Error('Preview unavailable')); action('preview').click();
  await vi.waitFor(() => expect(feedback().textContent).toContain('Preview unavailable'));
  expect(action('preview').disabled).toBe(false);
});

test.each(['/cell/surface', '/workbench/project'])('a failed %s preserves the complete draft and restores submission controls', async failedPath => {
  await bench.show('lighting');
  request.mockImplementation(async path => { if (path === failedPath) throw new Error('Disk unavailable'); return { data: {} }; });
  edit('surface-json', '{"material":{"wall":false},"lamps":[]}'); action('save').click();
  await vi.waitFor(() => expect(feedback().textContent).toContain('Disk unavailable'));
  expect(surface()).toEqual({ material: { wall: false }, lamps: [] }); expect(action('save').disabled).toBe(false);
});

test('edits during a save survive canonical refresh and pending actions cannot submit twice', async () => {
  let resolveSave;
  await bench.show('lighting');
  request.mockImplementation(async path => path === '/cell/surface' ? new Promise(resolve => { resolveSave = resolve; }) : { data: fixture() });
  edit('surface-json', '{"material":{"solid":true}}'); action('save').click();
  expect(action('save').disabled).toBe(true); expect(action('lighting-save').disabled).toBe(true);
  action('save').click(); expect(request).toHaveBeenCalledTimes(1);
  edit('surface-json', '{"material":{"solid":false}}');
  resolveSave({ data: {} }); await vi.waitFor(() => expect(action('save').disabled).toBe(false));
  expect(surface()).toEqual({ material: { solid: false } });
});

test.each([false, true])('newer live state wins over a stale project read and preserves subsequent edits=%s', async edited => {
  let resolveProject;
  await bench.show('lighting');
  request.mockImplementation(async path => path === '/workbench/project' ? new Promise(resolve => { resolveProject = resolve; }) : { data: {} });
  edit('surface-json', '{"material":{"solid":true}}'); action('save').click();
  await vi.waitFor(() => expect(resolveProject).toBeTypeOf('function'));
  if (edited) edit('surface-json', '{"material":{"solid":false}}');
  const live = fixture(); live.cells['0,0'].shapes[1].params.surface = { normal: { mode: 'dome', depth: 3 } };
  bench.setProject(live, 'surface-session'); resolveProject({ data: fixture() });
  await vi.waitFor(() => expect(action('save').disabled).toBe(false));
  expect(surface()).toEqual(edited ? { material: { solid: false } } : { normal: { mode: 'dome', depth: 3 } });
  if (!edited) {
    live.cells['0,0'].shapes[1].params.surface.normal.depth = 4; bench.setProject(live, 'surface-session');
    expect(surface().normal.depth).toBe(4);
  }
});

test.each(['cell', 'shape', 'session', 'tab'])('late saves cannot replace a changed %s context', async kind => {
  let resolveSave;
  await bench.show('lighting');
  request.mockImplementation(() => new Promise(resolve => { resolveSave = resolve; }));
  edit('surface-json', '{"material":{"solid":true}}'); action('save').click();
  if (kind === 'cell') { selectedCell = 'step'; bench.refreshProjectPanels(); }
  if (kind === 'shape') choose('surface-shape', 'shape-id');
  if (kind === 'session') bench.setProject(fixture(), 'next-session');
  if (kind === 'tab') await bench.show('handoff');
  const content = bench.body.textContent;
  resolveSave({ data: {} }); await settle();
  expect(bench.body.textContent).toBe(content); expect(request).toHaveBeenCalledTimes(1); expect(refresh).not.toHaveBeenCalled();
});

test('changing cells preserves drafts by canonical cell and shape', async () => {
  await bench.show('lighting'); edit('surface-json', '{"material":{"wall":true}}');
  selectedCell = 'step'; bench.refreshProjectPanels();
  expect(document.querySelector('[data-surface-cell]').textContent).toContain('0,1 · step'); expect(surface()).toEqual({});
  selectedCell = '0,0'; bench.refreshProjectPanels(); expect(surface()).toEqual({ material: { wall: true } });
});

test('previews are pinned server PNGs of saved color, normal and light channels and edits invalidate them', async () => {
  await bench.show('lighting');
  for (const channel of ['color', 'normal', 'light']) {
    choose('surface-channel', channel); action('preview').click();
    await vi.waitFor(() => expect(document.querySelector('.surface-preview img').src).toBe(png));
    expect(request).toHaveBeenLastCalledWith(`/cell/surface-preview?cell=0%2C0&channel=${channel}`, undefined, { sessionId: 'surface-session' });
  }
  edit('surface-json', '{}'); expect(document.querySelector('.surface-preview img').hasAttribute('src')).toBe(false);
  expect(document.querySelector('[data-preview-note]').textContent).toContain('saved');
});

test.each(['edit', 'cell', 'shape', 'session', 'tab', 'channel'])('late preview for changed %s is discarded', async kind => {
  let resolvePreview;
  await bench.show('lighting'); request.mockImplementation(() => new Promise(resolve => { resolvePreview = resolve; }));
  action('preview').click();
  if (kind === 'edit') edit('surface-json', '{}');
  if (kind === 'cell') { selectedCell = 'step'; bench.refreshProjectPanels(); }
  if (kind === 'shape') choose('surface-shape', 'shape-id');
  if (kind === 'session') bench.setProject(fixture(), 'next-session');
  if (kind === 'tab') await bench.show('handoff');
  if (kind === 'channel') choose('surface-channel', 'normal');
  resolvePreview({ data: { cell: '0,0', channel: 'color', image: png } }); await settle();
  expect(document.querySelector('.surface-preview img')?.hasAttribute('src') ?? false).toBe(false);
});

test.each([['auto', undefined], ['include', true], ['omit', false]])('handoff export normal mode %s preserves trim and session pin', async (choice, normal) => {
  request.mockResolvedValue({ data: 'Exported', artifacts: [{ type: 'normal-sheet', path: '/output/study.normal.png' }, { type: 'normal-atlas', path: '/output/study.normal.atlas.json' }] });
  await bench.show('handoff'); choose('export-normal', choice); check('export-trim', true);
  edit('export-dest', '/output'); document.querySelector('[data-action="handoff-export"]').click();
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith('/session/export', { dest: '/output', trim: true, normal }, { sessionId: 'surface-session' }));
  await vi.waitFor(() => expect(document.querySelector('.tool-output').textContent).toContain('normal-atlas'));
});

test('handoff export prevents duplicate submissions and reports a current failure', async () => {
  let rejectExport;
  request.mockImplementation(() => new Promise((_resolve, reject) => { rejectExport = reject; }));
  await bench.show('handoff'); const exportButton = document.querySelector('[data-action="handoff-export"]');
  exportButton.click(); exportButton.click(); expect(request).toHaveBeenCalledTimes(1); expect(exportButton.disabled).toBe(true);
  rejectExport(new Error('Export folder unavailable'));
  await vi.waitFor(() => expect(document.getElementById('workbench-status').textContent).toContain('Export folder unavailable'));
  expect(exportButton.disabled).toBe(false);
});

test.each(['session', 'tab'])('a late export error cannot replace the changed %s status', async kind => {
  let rejectExport;
  request.mockImplementation(() => new Promise((_resolve, reject) => { rejectExport = reject; }));
  await bench.show('handoff'); document.querySelector('[data-action="handoff-export"]').click();
  if (kind === 'session') bench.setProject(fixture(), 'next-session'); else await bench.show('lighting');
  bench.notify('Current view ready.'); rejectExport(new Error('Old export failed')); await settle();
  expect(document.getElementById('workbench-status').textContent).toBe('Current view ready.');
});
