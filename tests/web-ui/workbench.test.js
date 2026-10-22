// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ReadableStream } from 'node:stream/web';
import { Workbench } from '../../server/web/public/js/workbench.js';
import { COMMANDS } from '../../server/commands/catalog.js';
import { commandRequest } from '../../server/web/public/js/command-catalog.js';
import { ShapePanel, ShapeGroupPanel } from '../../server/web/public/js/panels.js';
import { jsonReport, animationProof } from '../../server/web/public/js/components.js';

let bench, request, color;
afterEach(() => { vi.unstubAllGlobals(); });
test('shape-group membership badges preserve prototype-like names without loading other cells', () => {
  document.body.innerHTML = '<section><ul id="shape-group-items"></ul></section>';
  const panel = new ShapeGroupPanel(); panel.init({}); panel.setActiveCell('0,0');
  const groups = { ['__proto__']: ['dot'], constructor: ['dot'] };
  panel.setAllCellGroups({ '0,0': groups, '0,1': groups }); panel.setCellGroups(groups);
  expect([...document.querySelectorAll('.shape-group-badge')].map(node => node.textContent)).toEqual(['🔗2', '🔗2']);
});
test('copy handoff uses metadata summary without reading expanded geometry', async () => {
  const writeText = vi.fn(); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  bench.setProject({ name: 'Sparse', cells: { '0,0': { shapeCount: 5 } } }, 'pinned');
  request.mockImplementation(async path => { if (path !== '/workbench/project-summary') throw new Error('Expanded read forbidden'); return { data: { name: 'Sparse', sessionId: 'pinned' } }; });
  await bench.show('handoff'); [...bench.body.querySelectorAll('button')].find(button => button.textContent === 'Copy handoff for agent').click();
  await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
  expect(writeText.mock.calls[0][0]).toContain('Session: pinned');
  expect(request).not.toHaveBeenCalledWith('/workbench/project');
});
test('large shared reports disclose preview limits and retain the complete downloadable result', () => {
  const onDownload = vi.fn(), report = jsonReport({ onDownload });
  const data = { instances: [{ name: 'one' }], shapes: [], detail: 'x'.repeat(30000) };
  report.set(data); document.body.append(report.node);
  expect(report.output.textContent).toContain('1 instance');
  expect(report.output.textContent).toContain('Showing first');
  const download = report.node.querySelector('button');
  expect(download.hidden).toBe(false); download.click();
  expect(onDownload).toHaveBeenCalledWith(data);
});
test('atlas proof uses a separate animated preview and keeps binary data out of the readable report', async () => {
  const gif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  request.mockImplementation(async path => path === '/workbench/commands' ? { data: COMMANDS } : {
    data: { ok: true, frameCount: 2, durationMs: 200, artifacts: { gif: '/review/proof.gif' } }, preview: gif,
  });
  await bench.show('tools'); bench.selectCommand('atlas-proof');
  document.querySelector('[name="path"]').value = '/source/proof.json';
  document.querySelector('[name="out"]').value = '/review';
  document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(document.querySelector('.animation-proof img')?.src).toBe(gif));
  expect(document.querySelector('.tool-output').textContent).toContain('frameCount');
  expect(document.querySelector('.tool-output').textContent).not.toContain('base64');
  expect(document.querySelector('.animation-proof img').alt).toContain('atlas');
  expect(document.querySelector('.animation-proof a').download).toBe('atlas-proof.gif');
  expect(request).toHaveBeenCalledWith('/workbench/atlas-proof', { path: '/source/proof.json', out: '/review' });
});
test('shared animation preview pauses at the poster and clears rejected or stale media', () => {
  const view = animationProof(), gif = 'data:image/gif;base64,R0lGODlh', poster = 'data:image/png;base64,iVBORw0KGgo=';
  view.set(gif, poster); document.body.append(view.node);
  const image = view.node.querySelector('img'), pause = view.node.querySelector('button');
  pause.click(); expect(image.src).toBe(poster); expect(pause.textContent).toBe('Play animation');
  pause.click(); expect(image.src).toBe(gif);
  view.set('https://foreign.example/proof.gif');
  expect(view.node.hidden).toBe(true); expect(image.hasAttribute('src')).toBe(false);
  expect(view.node.querySelector('a').hasAttribute('href')).toBe(false);
});
test('shared animation preview respects reduced motion and starts on a still poster', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  try {
    const view = animationProof(), gif = 'data:image/gif;base64,R0lGODlh', poster = 'data:image/png;base64,iVBORw0KGgo=';
    view.set(gif, poster);
    expect(view.node.querySelector('img').src).toBe(poster);
    expect(view.node.querySelector('button').textContent).toBe('Play animation');
  } finally { vi.unstubAllGlobals(); }
});
beforeEach(() => {
  document.body.innerHTML = '<div id="workbench-mount"></div><div id="workbench-status"></div>';
  color = vi.fn();
  request = vi.fn(async path => {
    if (path.includes('/session/list')) return { data: [{ id: 's_1', project_name: '<script>sprite</script>', updated_at: Date.now() }] };
    if (path === '/workbench/palettes') return { data: { current: [], presets: [
      { name: 'pico8', colors: [{ name: 'red', color: '#ff004d' }] }, { name: 'nes', colors: [{ name: 'red', color: '#d82800' }] },
    ] } };
    if (path === '/workbench/commands') return { data: COMMANDS };
    return { data: 'ok' };
  });
  bench = new Workbench({ request, getCell: () => '1,2', getColor: () => '#aabbcc', setColor: color, refresh: vi.fn() });
  bench.init();
});

test('editable project downloads pass the response Blob directly with pinned session and format choices', async () => {
  const blob = new Blob(['portable bytes'], { type: 'application/json' });
  const fetchFile = vi.fn(async () => ({ ok: true, headers: new Headers({ 'content-type': 'application/json' }), blob: async () => blob,
    json: () => { throw new Error('must not parse a project'); } }));
  vi.stubGlobal('fetch', fetchFile);
  const oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL;
  const create = vi.fn(() => 'blob:project'); URL.createObjectURL = create; URL.revokeObjectURL = vi.fn();
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    bench.project = { name: 'Shared art', storageVersion: 2 }; bench.sessionId = 'pinned'; await bench.show('handoff');
    const select = document.querySelector('[name="project-format"]'); expect(select).not.toBeNull();
    const action = [...document.querySelectorAll('button')].find(button => button.textContent === 'Download editable project');
    for (const [value, suffix] of [['', ''], ['shared', '?format=shared'], ['expanded', '?format=expanded']]) {
      select.value = value; action.click();
      await vi.waitFor(() => expect(fetchFile).toHaveBeenLastCalledWith('/api/workbench/project-file' + suffix, { headers: { 'X-Sprite-Session': 'pinned' } }));
      await vi.waitFor(() => expect(create).toHaveBeenLastCalledWith(blob));
    }
    expect(request.mock.calls.some(([path]) => path === '/workbench/project')).toBe(false);
    expect(click).toHaveBeenCalledTimes(3);
  } finally { URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke; click.mockRestore(); vi.unstubAllGlobals(); }
});

test('save tool offers current, shared and expanded format and omits the current format override', async () => {
  await bench.show('tools'); bench.selectCommand('save');
  const select = document.querySelector('select[name="format"]'); expect(select).not.toBeNull();
  expect([...select.options].map(option => option.value)).toEqual(['', 'shared', 'expanded']);
  expect(commandRequest(COMMANDS.find(command => command.id === 'save'), { format: '' }).body).toEqual({});
  const submit = () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  submit(); await vi.waitFor(() => expect(request).toHaveBeenCalledWith('/session/save', {}));
  select.value = 'expanded'; submit(); await vi.waitFor(() => expect(request).toHaveBeenCalledWith('/session/save', { format: 'expanded' }));
});
test('handoff streams large files, disables duplicate input, and cancels when the drawer closes', async () => {
  const calls = [], uploads = [];
  class Upload {
    constructor() { this.upload = {}; uploads.push(this); }
    open() {} setRequestHeader() {} send(file) { this.file = file; } abort() { this.onabort?.(); }
  }
  vi.stubGlobal('XMLHttpRequest', Upload);
  vi.stubGlobal('fetch', async (path, options) => { calls.push({ path, ...options }); return { ok: true, json: async () => ({ ok: true, data: { id: 'file-job' } }) }; });
  try {
    bench.sessionId = 'pinned'; await bench.show('handoff');
    const upload = document.querySelector('input[type="file"]');
    expect(upload.accept).toContain('.json.gz');
    const file = new File(['x'], 'large.json'); Object.defineProperty(file, 'size', { value: 65 * 1024 * 1024 });
    file.text = () => { throw new Error('must not buffer'); };
    Object.defineProperty(upload, 'files', { value: [file] }); upload.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(uploads).toHaveLength(1)); expect(uploads[0].file).toBe(file); expect(upload.disabled).toBe(true);
    uploads[0].upload.onprogress({ loaded: 1024, total: file.size, lengthComputable: true });
    expect(document.querySelector('[data-import-status]').textContent).toMatch(/1,024|1024/);
    expect(document.querySelector('[data-import-cancel]').disabled).toBe(false);
    bench.close(); await vi.waitFor(() => expect(calls.some(call => call.method === 'DELETE')).toBe(true));
    expect(request.mock.calls.some(([path]) => path === '/session/import')).toBe(false);
    expect(bench.refresh).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});
test('own import broadcast preserves handoff until its receipt arrives, then refreshes actual state', async () => {
  const calls = [], uploads = [];
  class Upload {
    constructor() { this.upload = {}; uploads.push(this); }
    open() {} setRequestHeader() {} send() {} abort() { this.onabort?.(); }
  }
  vi.stubGlobal('XMLHttpRequest', Upload);
  vi.stubGlobal('fetch', async (path, options) => {
    calls.push({ path, ...options }); let data = { id: 'own-import', state: options.method === 'GET' ? 'ready' : 'uploading' };
    if (path.endsWith('/activate')) { bench.setProject({ name: 'Imported' }, 'new-session'); data = { session_id: 'new-session', project_name: 'Imported' }; }
    return { ok: true, json: async () => ({ ok: true, data }) };
  });
  try {
    bench.sessionId = 'original'; await bench.show('handoff');
    const upload = document.querySelector('input[type="file"]'), status = document.querySelector('[data-import-status]');
    Object.defineProperty(upload, 'files', { value: [new File(['x'], 'own.json')] }); upload.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(uploads).toHaveLength(1)); uploads[0].status = 202; uploads[0].onload();
    await vi.waitFor(() => expect(bench.refresh).toHaveBeenCalledOnce());
    expect(document.querySelector('[data-import-status]')).toBe(status); expect(status.textContent).toContain('complete');
    expect(bench.sessionId).toBe('new-session'); expect(calls.some(call => call.method === 'DELETE')).toBe(false);
  } finally { vi.unstubAllGlobals(); }
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
test('the import command opens the streamed file handoff rather than an edit form', async () => {
  await bench.show('tools');
  expect(COMMANDS.find(command => command.id === 'import')).toMatchObject({ action: 'import' });
  bench.selectCommand('import');
  const open = [...document.querySelectorAll('.command-detail button')].find(button => button.textContent === 'Choose project file');
  expect(open).toBeDefined(); open.click();
  await vi.waitFor(() => expect(document.querySelector('input[type="file"]')?.accept).toContain('.json.gz'));
});

test('layer edit controls use the selected child and the common guarded request workflow',async()=>{
  bench.getShape=()=>({params:{layers:[{id:'scene:child'}]}});
  await bench.show('tools');bench.selectCommand('layer edit');
  expect(document.querySelector('[name="id"]').value).toBe('scene:child');
  document.querySelector('[name="dx"]').value='2';
  document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await vi.waitFor(()=>expect(request).toHaveBeenCalledWith('/cell/layer',{cell:'1,2',id:'scene:child',dx:2,dy:0}));
});

test('tools load their supported command descriptors from the server', async () => {
  request.mockImplementation(async path => path === '/workbench/commands' ? { data: [
    { id: 'server-tool', category: 'Review', label: 'Server tool', method: 'POST', path: '/api/server-tool', body: { cell: '0,0' } },
  ] } : { data: 'ok' });
  await bench.show('tools');
  expect(request).toHaveBeenCalledWith('/workbench/commands');
  expect(document.querySelector('[data-command="server-tool"]')).not.toBeNull();
  expect(document.querySelector('[name="cell"]').value).toBe('1,2');
});

test('ASCII editor reads canonical server rows and shows unmapped pixels without inventing colors', async () => {
  bench.project = { cellWidth: 24, cellHeight: 48 };
  bench.sessionId = 'ascii-session';
  request.mockImplementation(async path => path === '/cell/ascii-read' ? { data: {
    x: 0, y: 0, w: 24, h: 48, rows: [' A?', '___'], colors: { ' ': '#ffffff', A: '#112233' }, keep: '.', erase: '_', unknown: '?',
    unmapped: [{ x: 2, y: 0, rgba: '#34567880' }],
  } } : { data: 'ok' });
  await bench.show('ascii');
  expect(document.querySelector('[name="w"]').value).toBe('24');
  expect(document.querySelector('[name="h"]').value).toBe('48');
  [...document.querySelectorAll('button')].find(button => button.textContent === 'Read region').click();
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith('/cell/ascii-read', { cell: '1,2', x: 0, y: 0, w: 24, h: 48 }, { sessionId: 'ascii-session' }));
  await vi.waitFor(() => expect(document.querySelector('[name="rows"]').value).toBe(' A?\n___'));
  expect(JSON.parse(document.querySelector('[name="colors"]').value)).toEqual({ ' ': '#ffffff', A: '#112233' });
  expect(document.querySelector('.ascii-unmapped').textContent).toContain('2,0');
  expect(document.querySelector('.ascii-unmapped').textContent).toContain('#34567880');
  expect(document.querySelector('.ascii-legend').textContent).toContain('keep');
  expect(document.querySelector('[data-action="ascii-patch"]').disabled).toBe(true);
});

test('ASCII patch preserves whitespace and pins the read session and target until a new read', async () => {
  bench.project = { cellWidth: 8, cellHeight: 8 };
  bench.sessionId = 'ascii-session';
  request.mockImplementation(async path => path === '/cell/ascii-read' ? { data: {
    x: 0, y: 0, w: 8, h: 8, rows: ['AA'], colors: { A: '#112233' }, keep: '.', erase: '_', unknown: '?', unmapped: [],
  } } : { data: { changed: 2, shapes: [{ id: 'stable', name: 'patch-1' }] } });
  await bench.show('ascii');
  document.querySelector('[data-action="ascii-read"]').click();
  await vi.waitFor(() => expect(document.querySelector('[name="rows"]').value).toBe('AA'));
  const rows = document.querySelector('[name="rows"]'); rows.value = ' A\n._'; rows.dispatchEvent(new Event('input'));
  const colors = document.querySelector('[name="colors"]'); colors.value = JSON.stringify({ ' ': '#ffffff', A: '#112233' });
  document.querySelector('[data-action="ascii-patch"]').click();
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith('/cell/ascii-patch', {
    cell: '1,2', x: 0, y: 0, rows: ' A\n._', colors: { ' ': '#ffffff', A: '#112233' }, prefix: 'patch',
  }, { sessionId: 'ascii-session' }));
  expect(bench.refresh).toHaveBeenCalled();
  await vi.waitFor(() => expect(document.querySelector('[role="status"]').textContent).toContain('2 pixels'));
  const x = document.querySelector('[name="x"]'); x.value = '1'; x.dispatchEvent(new Event('input'));
  expect(document.querySelector('[data-action="ascii-patch"]').disabled).toBe(true);
});

test('ASCII editor exposes server errors and rejects stale reads without replacing the rows', async () => {
  bench.project = { cellWidth: 8, cellHeight: 8 }; bench.sessionId = 'original';
  request.mockRejectedValueOnce(new Error('Region exceeds 4096 pixels'));
  await bench.show('ascii');
  document.querySelector('[data-action="ascii-read"]').click();
  await vi.waitFor(() => expect(document.querySelector('[role="status"]').textContent).toContain('Region exceeds 4096 pixels'));
  let resolveRead;
  request.mockImplementation(() => new Promise(resolve => { resolveRead = resolve; }));
  document.querySelector('[data-action="ascii-read"]').click();
  bench.sessionId = 'other';
  resolveRead({ data: { x: 0, y: 0, w: 1, h: 1, rows: ['A'], colors: { A: '#112233' }, unmapped: [] } });
  await vi.waitFor(() => expect(document.querySelector('[role="status"]').textContent).toContain('session changed'));
  expect(document.querySelector('[name="rows"]').value).toBe('');
});

test('ASCII patch refuses a changed session and requires a fresh read before retrying', async () => {
  bench.project = { cellWidth: 8, cellHeight: 8 }; bench.sessionId = 'original';
  request.mockResolvedValue({ data: { x: 0, y: 0, w: 8, h: 8, rows: ['A'], colors: { A: '#112233' }, unmapped: [] } });
  await bench.show('ascii');
  document.querySelector('[data-action="ascii-read"]').click();
  await vi.waitFor(() => expect(document.querySelector('[data-action="ascii-patch"]').disabled).toBe(false));
  bench.sessionId = 'other';
  document.querySelector('[data-action="ascii-patch"]').click();
  await vi.waitFor(() => expect(document.querySelector('[role="status"]').textContent).toContain('session changed'));
  expect(request.mock.calls.filter(([path]) => path === '/cell/ascii-patch')).toHaveLength(0);
  expect(document.querySelector('[data-action="ascii-patch"]').disabled).toBe(true);
});

test('ASCII editor starts large designs with a bounded read and exposes parsing errors', async () => {
  bench.project = { cellWidth: 8192, cellHeight: 1024 }; bench.sessionId = 'original';
  await bench.show('ascii');
  const width = Number(document.querySelector('[name="w"]').value), height = Number(document.querySelector('[name="h"]').value);
  expect(width * height).toBeLessThanOrEqual(4096);
  document.querySelector('[name="colors"]').value = '[]';
  document.querySelector('[data-action="ascii-read"]').click();
  await vi.waitFor(() => expect(document.querySelector('[role="status"]').textContent).toContain('Character colors must be a JSON object'));
  expect(request).not.toHaveBeenCalled();
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
    if (path === '/workbench/commands') return { data: COMMANDS };
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

test('batch ASCII reads expose their exact rows, palette and unmapped diagnostics', async () => {
  const readback = { rows: ['R?'], colors: { R: '#ff0000' }, unmapped: [{ x: 1, y: 0, rgba: '#123456ff' }] };
  request.mockImplementation(async path => {
    if (path === '/workbench/commands') return { data: COMMANDS };
    if (path === '/workbench/map-operations') return { data: [{ path: '/api/cell/ascii-read', method: 'POST', body: { cell: '0,0', x: 0, y: 0, w: 2, h: 1 } }] };
    return { data: readback };
  });
  await bench.show('tools'); bench.selectCommand('batch');
  [...document.querySelectorAll('button')].find(button => button.textContent === 'Apply operations').click();
  await vi.waitFor(() => expect(document.querySelector('.tool-output').textContent).toContain('#123456ff'));
  expect(document.querySelector('.tool-output').textContent).toContain('R?');
  expect(document.querySelector('.tool-output').textContent).toContain('#ff0000');
});

test('composition controls edit reusable parts and placements through the shared server form', async () => {
  await bench.show('tools'); bench.selectCommand('compose');
  const parts = { leaf: { shapes: [{ name: 'blade', type: 'point', params: { x: 0, y: 0 }, color: '#00ff00' }] } };
  const placements = [{ kind: 'stamp', part: 'leaf', name: 'front', x: 3, y: 2 }];
  expect(document.querySelector('textarea[name="parts"]')).not.toBeNull();
  const partInput = document.querySelector('textarea[name="parts"]');
  partInput.value = JSON.stringify(parts); partInput.dispatchEvent(new Event('input'));
  const placementInput = document.querySelector('textarea[name="placements"]');
  placementInput.value = JSON.stringify(placements); placementInput.dispatchEvent(new Event('input'));
  document.querySelector('.tool-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith('/cell/compose', expect.objectContaining({ cell: '1,2', parts, placements })));
  expect(bench.refresh).toHaveBeenCalled();
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

async function buildView(command = 'build', { project = { name: 'Current', projectId: 'project-one' }, sessionId = 'pinned-build' } = {}) {
  const encoder = new TextEncoder();
  let source, signal;
  const canceled = vi.fn();
  const body = new ReadableStream({ start(controller) { source = controller; }, cancel: canceled });
  const fetchBuild = vi.fn(async (_path, options) => {
    signal = options.signal;
    signal.addEventListener('abort', () => source.error(new DOMException('Request aborted', 'AbortError')), { once: true });
    return { ok: true, headers: new Headers({ 'content-type': 'application/x-ndjson' }), body };
  });
  vi.stubGlobal('fetch', fetchBuild);
  bench.setProject(project, sessionId);
  await bench.show('tools'); bench.selectCommand(command);
  const form = document.querySelector('.tool-form'), submit = form.querySelector('[type="submit"]');
  form.querySelector('[name="path"]').value = '/source/build.json';
  const start = () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  const push = value => source.enqueue(encoder.encode(JSON.stringify(value) + '\n'));
  return { form, submit, start, fetchBuild, canceled, get signal() { return signal; }, get locked() { return body.locked; }, push,
    finish(report = { ok: true, name: '羽 🦉', artifacts: { project: '/out/project.json' } }) { push({ type: 'result', ok: true, data: report }); source.close(); } };
}

test.each(['build', 'build-animation'])('%s uses owned streamed progress, prevents duplicate builds and opens only the actual generated file', async command => {
  const wire = await buildView(command);
  wire.start(); wire.start();
  expect(wire.submit.disabled).toBe(true);
  await vi.waitFor(() => expect(wire.fetchBuild).toHaveBeenCalledOnce());
  expect(wire.fetchBuild).toHaveBeenCalledWith('/api/workbench/build', expect.objectContaining({
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson', 'X-Sprite-Session': 'pinned-build' }, body: '{"path":"/source/build.json"}' }));
  expect(request.mock.calls.some(([path]) => path === '/workbench/build')).toBe(false);
  wire.push({ type: 'progress', phase: 'generator', bytes: 9437184 });
  await vi.waitFor(() => expect(document.querySelector('[data-build-status]').textContent).toContain('9,437,184 bytes'));
  const progress = document.querySelector('[data-build-progress]');
  expect(progress.hasAttribute('value')).toBe(false);
  wire.push({ type: 'progress', phase: 'operations', completed: 4, total: 10 });
  await vi.waitFor(() => expect(progress.value).toBe(4)); expect(progress.max).toBe(10);
  expect(document.querySelector('[data-build-status]').textContent).toContain('4 of 10 operations');
  const cancel = document.querySelector('[data-build-cancel]'); expect(cancel.disabled).toBe(false);
  wire.push({ type: 'progress', phase: 'committing' });
  await vi.waitFor(() => expect(cancel.disabled).toBe(true));
  expect(document.querySelector('[data-build-status]').textContent).toContain('Publishing build files');
  wire.finish();
  await vi.waitFor(() => expect(document.querySelector('.tool-output').textContent).toContain('羽 🦉'));
  expect(document.querySelector('[data-build-status]').textContent).toContain('Build completed');
  expect(wire.submit.disabled).toBe(false); expect(cancel.disabled).toBe(true);
  expect(bench.refresh).not.toHaveBeenCalled();
  [...document.querySelectorAll('button')].find(button => button.textContent === 'Open generated project').click();
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith('/session/open', { path: '/out/project.json' }));
  expect(bench.refresh).toHaveBeenCalledOnce();
});

test('an offline build succeeds without an active project or a live-project refresh', async () => {
  const wire = await buildView('build', { project: null, sessionId: null }), rejectedRefresh = vi.fn();
  bench.refresh.mockImplementation(() => {
    const pending = Promise.reject(new Error('No active project'));
    // Observe the real failure a needless refresh would produce without leaking a test rejection.
    pending.catch(rejectedRefresh); return pending;
  });
  wire.start(); wire.finish();
  await vi.waitFor(() => expect(wire.submit.disabled).toBe(false));
  expect(JSON.parse(document.querySelector('.tool-output').textContent)).toMatchObject({ ok: true, artifacts: { project: '/out/project.json' } });
  expect([...document.querySelectorAll('button')].some(button => button.textContent === 'Open generated project')).toBe(true);
  expect(document.getElementById('workbench-status').textContent).toBe('Build a project completed.');
  expect(bench.refresh).not.toHaveBeenCalled(); expect(rejectedRefresh).not.toHaveBeenCalled();
  expect(wire.fetchBuild.mock.calls[0][1].headers).not.toHaveProperty('X-Sprite-Session');
});

test('ordinary tool success still refreshes the live project', async () => {
  await bench.show('tools'); bench.selectCommand('draw rect');
  document.querySelector('.tool-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(bench.refresh).toHaveBeenCalledOnce());
  expect(request).toHaveBeenCalledWith('/draw', expect.objectContaining({ type: 'rect', cell: '1,2' }));
  expect(document.getElementById('workbench-status').textContent).toBe('Rectangle completed.');
});

test('a build report with ok false remains visible and offers no generated-project action', async () => {
  const wire = await buildView(); wire.start();
  wire.finish({ ok: false, errors: ['Outline verification failed'], artifacts: { project: '/out/rejected.json' } });
  await vi.waitFor(() => expect(document.querySelector('.tool-output').textContent).toContain('Outline verification failed'));
  expect(document.querySelector('[data-build-status]').textContent).toMatch(/failed/i);
  expect(document.getElementById('workbench-status').textContent).toContain('failed');
  expect([...document.querySelectorAll('button')].some(button => button.textContent === 'Open generated project')).toBe(false);
  expect(bench.refresh).not.toHaveBeenCalled();
});

test('Cancel build reports an unconfirmed outcome and permits a deliberate retry', async () => {
  const wire = await buildView(); wire.start();
  const cancel = document.querySelector('[data-build-cancel]'); cancel.click();
  expect(wire.signal.aborted).toBe(true);
  await vi.waitFor(() => expect(document.querySelector('[data-build-status]').textContent).toMatch(/inspect output before retrying/i));
  expect(document.querySelector('[data-build-status]').textContent).not.toMatch(/rolled back|no outputs|unchanged/i);
  expect(wire.submit.disabled).toBe(false); expect(cancel.disabled).toBe(true);
  expect(wire.fetchBuild).toHaveBeenCalledOnce();
});

test.each(['other command', 'same command', 'other tab', 'drawer close', 'session change', 'project change'])('%s disposes only its precommit build view', async reason => {
  const wire = await buildView(); wire.start();
  await vi.waitFor(() => expect(wire.signal).toBeDefined());
  if (reason === 'other command') bench.selectCommand('draw rect');
  if (reason === 'same command') bench.selectCommand('build');
  if (reason === 'other tab') await bench.show('palettes');
  if (reason === 'drawer close') bench.close();
  if (reason === 'session change') bench.setProject({ projectId: 'project-two' }, 'another-session');
  if (reason === 'project change') bench.setProject({ projectId: 'project-two' }, 'pinned-build');
  await vi.waitFor(() => expect(wire.signal.aborted).toBe(true));
  expect(document.getElementById('workbench-status').textContent).toBe('');
  // An event queued by the detached form cannot send another build.
  wire.start(); expect(wire.fetchBuild).toHaveBeenCalledOnce();
});

test.each(['command', 'tab', 'close', 'session', 'project'])('after publishing starts, %s change retains the receipt without reviving stale UI', async reason => {
  const wire = await buildView(); wire.start();
  const owner = bench.builder;
  wire.push({ type: 'progress', phase: 'committed' });
  await vi.waitFor(() => expect(document.querySelector('[data-build-cancel]').disabled).toBe(true));
  if (reason === 'command') bench.selectCommand('build');
  if (reason === 'tab') await bench.show('palettes');
  if (reason === 'close') bench.close();
  if (reason === 'session') bench.setProject({ projectId: 'project-two' }, 'new-session');
  if (reason === 'project') bench.setProject({ projectId: 'project-two' }, 'pinned-build');
  if (reason === 'session' || reason === 'project') await vi.waitFor(() => expect(bench.body.querySelector('.tool-form')).not.toBeNull());
  const contents = bench.body.innerHTML;
  expect(wire.signal.aborted).toBe(false);
  wire.finish();
  await vi.waitFor(() => { expect(owner.busy).toBe(false); expect(wire.locked).toBe(false); });
  expect(bench.body.innerHTML).toBe(contents);
  expect(document.getElementById('workbench-status').textContent).toBe('');
  expect(bench.refresh).not.toHaveBeenCalled();
});

test('same-project updates keep a running build, while a direct stale session prevents callbacks', async () => {
  const wire = await buildView(); wire.start();
  bench.setProject({ name: 'Updated metadata', projectId: 'project-one' }, 'pinned-build');
  expect(wire.signal.aborted).toBe(false);
  const contents = bench.body.innerHTML; bench.sessionId = 'changed-outside-setProject';
  wire.push({ type: 'progress', phase: 'operations', completed: 1, total: 2 });
  await vi.waitFor(() => expect(wire.signal.aborted).toBe(true));
  expect(bench.body.innerHTML).toBe(contents);
  expect(document.getElementById('workbench-status').textContent).toBe('');
});

test('build request errors stay within their selected view', async () => {
  await bench.show('tools'); bench.selectCommand('build');
  vi.stubGlobal('fetch', async () => ({ ok: false, status: 403, headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ ok: false, error: 'Local file tools require localhost' }) }));
  document.querySelector('.tool-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(document.querySelector('[data-build-status]').textContent).toBe('Local file tools require localhost'));
  expect(document.getElementById('workbench-status').textContent).toBe('Local file tools require localhost');
});

test('a detached cancel control cannot cancel a newer build request', async () => {
  const wire = await buildView(); wire.start();
  const oldCancel = document.querySelector('[data-build-cancel]');
  bench.selectCommand('build');
  let newerSignal;
  wire.fetchBuild.mockImplementationOnce((_path, options) => new Promise((_resolve, reject) => {
    newerSignal = options.signal;
    newerSignal.addEventListener('abort', () => reject(new DOMException('Request aborted', 'AbortError')), { once: true });
  }));
  document.querySelector('.tool-form').dispatchEvent(new Event('submit', { cancelable: true }));
  try {
    expect(newerSignal.aborted).toBe(false);
    oldCancel.click();
    expect(newerSignal.aborted).toBe(false);
  } finally { bench.disposeBuild(); }
});

test.each(['workbench', 'controller'])('%s disposal suppresses the result even while the same command and pins remain selected', async disposal => {
  const wire = await buildView(); wire.start();
  const owner = bench.builder, receipt = vi.spyOn(owner, 'stream'), notify = vi.spyOn(bench, 'notify');
  wire.push({ type: 'progress', phase: 'committing' });
  await vi.waitFor(() => expect(document.querySelector('[data-build-cancel]').disabled).toBe(true));
  if (disposal === 'controller') { owner.dispose(); expect(bench.builder).toBe(owner); }
  else bench.disposeBuild();
  const contents = bench.body.innerHTML;
  expect(wire.signal.aborted).toBe(false);
  wire.finish();
  await vi.waitFor(() => { expect(owner.busy).toBe(false); expect(wire.locked).toBe(false); });
  await expect(receipt.mock.results[0].value).resolves.toMatchObject({ type: 'result', ok: true, data: { ok: true, artifacts: { project: '/out/project.json' } } });
  expect(bench.body.innerHTML).toBe(contents);
  expect(document.querySelector('.tool-output').textContent).toBe('');
  expect([...document.querySelectorAll('button')].some(button => button.textContent === 'Open generated project')).toBe(false);
  expect(document.getElementById('workbench-status').textContent).toBe('');
  expect(notify).not.toHaveBeenCalled();
  expect(bench.refresh).not.toHaveBeenCalled();
});

test('a retry clears the previous generated-project action before showing a failed build report', async () => {
  const wire = await buildView(); wire.start(); wire.finish();
  await vi.waitFor(() => expect(wire.submit.disabled).toBe(false));
  expect([...document.querySelectorAll('button')].some(button => button.textContent === 'Open generated project')).toBe(true);
  const encoder = new TextEncoder();
  wire.fetchBuild.mockImplementationOnce(async () => ({ ok: true, headers: new Headers({ 'content-type': 'application/x-ndjson' }),
    body: new ReadableStream({ start(source) {
      source.enqueue(encoder.encode(JSON.stringify({ type: 'result', ok: true, data: { ok: false, errors: ['Retry failed'] } }) + '\n')); source.close();
    } }) }));
  wire.start();
  expect([...document.querySelectorAll('button')].some(button => button.textContent === 'Open generated project')).toBe(false);
  await vi.waitFor(() => expect(document.querySelector('.tool-output').textContent).toContain('Retry failed'));
  expect([...document.querySelectorAll('button')].some(button => button.textContent === 'Open generated project')).toBe(false);
  expect(wire.fetchBuild).toHaveBeenCalledTimes(2);
});

test('a delayed server rejection after a command change cannot notify the new view', async () => {
  const wire = await buildView();
  let release;
  wire.fetchBuild.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  wire.start(); const owner = bench.builder;
  bench.selectCommand('draw rect'); const contents = bench.body.innerHTML;
  release({ ok: false, status: 403, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ ok: false, error: 'Delayed old failure' }) });
  await vi.waitFor(() => expect(owner.busy).toBe(false));
  expect(bench.body.innerHTML).toBe(contents);
  expect(document.getElementById('workbench-status').textContent).toBe('');
});
