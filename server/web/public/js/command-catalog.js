// The workbench exposes ordinary API requests, never evaluates shell commands.
// Samples also serve as editable templates for handoffs between artist and agent.
const post = (id, category, label, path, body, description = '') => ({ id, category, label, method: 'POST', path, body, description });
const get = (id, category, label, path, query = {}) => ({ id, category, label, method: 'GET', path, body: query });
const cell = '0,0';
const shape = 'body';
const draw = (type, label, params, description = '') => post(`draw ${type}`, 'Draw', label, '/api/draw', { type, cell, shape_name: type, color: '#ffccaa', ...params }, description);
const ERASE_NOTE = 'Add "erase": true to cut a hole through the shapes below it instead of painting.';
const WIDTH_NOTE = 'Add "width": 2–4 for a thicker brush stroke (emitted as named points).';
export const COMMANDS = [
  post('new', 'Session', 'New design', '/api/session/new', { name: 'New design', width: 32, height: 48, rows: 1, cols: 4, palette: 'db-32' }),
  post('open', 'Session', 'Open project on disk', '/api/session/open', { path: '' }),
  post('open-session', 'Session', 'Open saved session', '/api/session/open-session', { ref: '' }),
  post('session-copy', 'Session', 'Copy as a new session', '/api/session/copy', { name: 'Design variation' }),
  get('sessions', 'Session', 'List sessions', '/api/session/list'),
  get('status', 'Session', 'Current session', '/api/session/status'),
  post('save', 'Session', 'Save project on disk', '/api/session/save', {}),
  post('export', 'Session', 'Export PNG and atlas on disk', '/api/session/export', {}, 'Uses this session’s export folder. Add a dest field in JSON for another folder, or "trim": true for a trimmed atlas.'),
  post('pivot', 'Session', 'Set sprite pivot', '/api/session/pivot', { anchor: 'bottom-center' }),
  post('skin-tone', 'Character', 'Apply skin tone', '/api/workbench/skin-tone', { tone: 'peach' }, 'Applies to every pose with skin role groups. Choose rose, peach, apricot, terracotta, umber, plum or espresso.'),
  draw('point', 'Point', { x: 8, y: 8 }, ERASE_NOTE),
  draw('line', 'Line', { x1: 4, y1: 4, x2: 12, y2: 12 }, `${WIDTH_NOTE} ${ERASE_NOTE}`),
  draw('rect', 'Rectangle', { x: 4, y: 4, w: 8, h: 8, filled: true }, ERASE_NOTE),
  draw('circle', 'Circle', { cx: 8, cy: 8, r: 4, filled: true }, ERASE_NOTE),
  draw('ellipse', 'Ellipse', { cx: 8, cy: 8, rx: 4, ry: 6, filled: true }, ERASE_NOTE),
  draw('fill', 'Flood fill', { x: 8, y: 8 }),
  draw('polygon', 'Polygon', { points: [{ x: 4, y: 4 }, { x: 12, y: 4 }, { x: 8, y: 12 }], filled: true }, ERASE_NOTE),
  draw('polyline', 'Open polyline', { points: [{ x: 4, y: 4 }, { x: 12, y: 4 }, { x: 8, y: 12 }] }, `${WIDTH_NOTE} ${ERASE_NOTE}`),
  draw('highlight', 'Highlight', { shape, direction: 'top-left', strength: 1 }),
  draw('shadow', 'Shadow', { shape, direction: 'bottom-right', strength: 1 }),
  draw('sphere-shade', 'Sphere shading', { shape, intensity: 'auto' }, 'Add "coverage": true to paint whole crescents on small forms (radius 4–7).'),
  draw('arc', 'Arc', { cx: 8, cy: 8, r: 5, from_deg: 180, to_deg: 360 }, WIDTH_NOTE),
  draw('ring', 'Ring outline', { shape }),
  draw('border', 'Continuous border', { shapes: [shape] }),
  post('draw dither', 'Draw', 'Dither fill', '/api/draw', { type: 'rect', cell, x: 4, y: 4, w: 8, h: 8, filled: true, color: '#ffccaa', color2: '#d9a066', pattern: 'checker' }),
  get('shapes', 'Shapes', 'List shapes', '/api/shapes', { cell }),
  post('rename', 'Shapes', 'Rename shape', '/api/shape/name', { cell, shape_id: '', name: 'renamed' }, 'Select a shape in the list, or enter its ID.'),
  post('move', 'Shapes', 'Move shape', '/api/shape/move', { cell, name: shape, dx: 1, dy: 0 }),
  post('move-to', 'Shapes', 'Position shape', '/api/shape/move-to', { cell, shape, x: 8, y: 8 }),
  post('resize', 'Shapes', 'Resize shape', '/api/shape/resize', { cell, shape, updates: { w: 8, h: 8 } }),
  post('recolor', 'Shapes', 'Recolor shape', '/api/shape/recolor', { cell, name: shape, color: '#5fcde4' }),
  post('clone', 'Shapes', 'Clone into another cell', '/api/shape/clone', { from_cell: cell, to_cell: '0,1', shape, new_name: 'body-copy' }),
  post('duplicate', 'Shapes', 'Duplicate in this cell', '/api/shape/duplicate', { cell, shape, as: 'body-copy', mirror: 'horizontal' }),
  post('flip', 'Shapes', 'Flip shape', '/api/shape/flip', { cell, name: shape, axis: 'horizontal', about: 'self' }),
  post('rotate', 'Shapes', 'Rotate shape', '/api/shape/rotate', { cell, name: shape, deg: 90, about: 'self' }),
  post('delete', 'Shapes', 'Delete shape', '/api/shape/delete', { cell, name: shape }),
  post('z-order', 'Shapes', 'Move shape in stack', '/api/shape/z-dir', { cell, shape, direction: 'up' }),
  post('copy', 'Cells', 'Copy cell', '/api/cell/copy', { from: cell, to: '0,1' }),
  post('clone-cell', 'Cells', 'Clone cell to several frames', '/api/cell/clone-fanout', { from: cell, to: ['0,1','0,2'] }),
  post('clear', 'Cells', 'Clear cell', '/api/cell/clear', { cell }),
  post('name', 'Cells', 'Name cell', '/api/cell/name', { cell, name: 'front-idle' }),
  post('mirror', 'Cells', 'Mirror cell', '/api/cell/mirror', { cell, axis: 'horizontal' }),
  post('shift', 'Cells', 'Shift cell', '/api/cell/shift', { cell, dx: 1, dy: 0 }),
  post('rotate-cell', 'Cells', 'Rotate cell', '/api/cell/rotate', { cell, deg: 90 }),
  post('ref set', 'Cells', 'Attach tracing reference', '/api/cell/reference', { cell, path: '', opacity: 0.35 }),
  post('ref clear', 'Cells', 'Remove tracing reference', '/api/cell/reference', { cell, path: null }),
  post('view', 'Cells', 'Render cell on disk', '/api/cell/view', { cell, format: 'png', scale: 4 }),
  post('view sheet', 'Cells', 'Render sheet on disk', '/api/view/sheet', { scale: 1 }),
  post('view stack', 'Cells', 'Render cells stacked as layers', '/api/view/stack', { cells: [cell, '0,1'], scale: 4 }, 'Cell names or R,C, first at the bottom.'),
  post('undo', 'Cells', 'Undo cell edit', '/api/cell/undo', { cell }),
  post('redo', 'Cells', 'Redo cell edit', '/api/cell/redo', { cell }),
  post('tween', 'Animation', 'Tween a shape across frames', '/api/shape/tween', { group: 'idle', shape, to: { x: 8, y: 10 }, ease: 'in-out' }),
  ...['create','add','remove','delete','fps','direction','list'].map(sub => sub === 'list'
    ? get('group list', 'Animation', 'List animation groups', '/api/group/cell/list')
    : post(`group ${sub}`, 'Animation', `${sub[0].toUpperCase() + sub.slice(1)} animation group`, `/api/group/cell/${sub}`, {
      name: 'idle', ...(['create','add','remove'].includes(sub) ? { cells: [cell,'0,1'] } : {}), ...(['create','fps'].includes(sub) ? { fps: 8 } : {}), ...(sub === 'direction' ? { direction: 'pingpong' } : {}),
    })),
  ...['create','add','remove','delete','list'].map(sub => sub === 'list'
    ? get('shape-group list', 'Groups', 'List shape groups', '/api/group/shape/list', { cell })
    : post(`shape-group ${sub}`, 'Groups', `${sub[0].toUpperCase() + sub.slice(1)} shape group`, `/api/group/shape/${sub}`, {
      cell, name: 'figure', ...(sub !== 'delete' ? { shapes: [shape] } : {}),
    })),
  post('move-group', 'Groups', 'Move shape group', '/api/group/shape/move', { cell, name: 'figure', dx: 1, dy: 0, all_cells: false }),
  post('recolor-group', 'Groups', 'Recolor shape group', '/api/group/shape/recolor', { cell, name: 'figure', color: '#5fcde4', all_cells: false }),
  post('cast', 'Review', 'Create a frame casting review', '/api/casting', { title: 'Choose the poses', slots: [{ id: 'front', label: 'Front' }], candidates: [{ id: 'a', label: 'Candidate A', path: '' }] }, 'The result includes a link to the side-by-side casting review.'),
  { id: 'view-anim', category: 'Animation', label: 'Play animation', action: 'preview', description: 'Choose an animation group in the right panel, then open Preview.' },
  { id: 'batch', category: 'Review', label: 'Apply agent operations', action: 'batch', description: 'Paste expanded CLI batch operations, review them, and apply in order. Stops on the first failure; earlier edits remain.' },
  post('build', 'Files', 'Build a project', '/api/workbench/build', { path: '' }, 'Choose a local build configuration. Runs an isolated build, including any configured local generator. Available from localhost; the live design stays unchanged.'),
  post('verify', 'Files', 'Verify exported pixels', '/api/workbench/verify', { path: '', expectedTags: [], expectedFrames: [], outlineColors: [], scale: 4 }, 'Choose a local atlas JSON file. Checks its PNG and metadata. Add outline colors to check continuous outlines. Available from localhost.'),
  post('trace', 'Files', 'Trace an image into shapes', '/api/workbench/trace', { path: '', out: '', name: 'image-trace' }, 'Choose a local PNG or WebP and a new output directory. Preserves decoded pixels and emits an editable project. Available from localhost.'),
  ...[
    ['restart', 'Restart the server', 'agent-sprites restart', 'Run in a terminal so the process can reconnect after shutdown.'],
    ['help', 'Full command reference', 'agent-sprites --help', 'All live editing commands have controls here. Offline file workflows and server lifecycle stay in the terminal.'],
  ].map(([id, label, cli, description]) => ({ id, category: 'Terminal', label, cli, description })),
];

export function commandRequest(command, values) {
  if (!command.path) throw new Error('This tool does not make an API request');
  if (command.method === 'GET') {
    const query = new URLSearchParams(Object.entries(values).filter(([, value]) => value !== '' && value != null));
    return { method: 'GET', path: `${command.path}${query.size ? `?${query}` : ''}` };
  }
  return { method: 'POST', path: command.path, body: values };
}
